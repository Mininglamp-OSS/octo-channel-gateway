// 显式本地专项；不加入默认测试或 CI。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { failurePayload } from '@mininglamp-oss/octo-runtime-client/protocol';
import { ImRuntime, ChannelGateway } from '../dist/packages/gateway/src/index.js';
import { normalizeHooks, runHooks, hookContext } from '../dist/packages/gateway/src/hooks.js';
import { createCliHooks } from '../dist/apps/cli/src/hooks.js';
import { GatewayTransport } from '../dist/packages/gateway/src/transport/channel.js';
import { kernelMock, modelItems } from '../test-support/kernel-mock.js';
import { waitFor } from '../test/runtime-fixture.js';
import { withShutdownDeadline } from '../dist/packages/gateway/src/support/shutdown.js';

const schema = 'octo.context-envelope/v3';
const retryFailure = () => {
  const payload = failurePayload({ httpStatus: 503 }, { stage: 'provider.invoke', defaultDomain: 'provider', source: { component: 'octo-runtime', adapter: 'codex' } });
  payload.failure.retryAfterMs = 100;
  return payload;
};
const base = { inputs: { protocol_mode: 'canonical', parts: [{ type: 'text', text: 'question' }] }, agentEnv: { schema, items: [] } };
const context = (index = 1, signal = new AbortController().signal) => hookContext({
  botId: 'bot', sessionKey: 'scope', sessionId: 'session', providerSession: undefined,
  generation: 1, messageId: 'm', conversation: { kind: 'direct', id: 'owner' }, turn: { index }, signal,
});

test('ordered replacements share one immutable context and preserve original data', async () => {
  const ctx = context(), seen = [];
  const hooks = normalizeHooks([
    { type: 'pre_dispatch', hook: async (value, inputs, agentEnv) => {
      seen.push(value); assert.throws(() => { value.turn.index = 99; }, TypeError);
      return { inputs: { ...inputs, parts: [{ type: 'text', text: 'prefix' }, ...inputs.parts] }, agentEnv };
    } },
    { type: 'pre_dispatch', hook: async (value, inputs, agentEnv) => {
      seen.push(value); assert.equal(inputs.parts[0].text, 'prefix');
      return { inputs, agentEnv: { ...agentEnv, items: [{ namespace: 'business.private', name: 'options', payload: { x: 1 } }] } };
    } },
  ]);
  const result = await runHooks(hooks, 'pre_dispatch', ctx, base);
  assert.equal(result.inputs.parts.length, 2); assert.equal(result.agentEnv.items.length, 1);
  assert.equal(base.inputs.parts.length, 1); assert.equal(base.agentEnv.items.length, 0);
  assert.equal(seen[0], ctx); assert.equal(seen[1], ctx);
});

test('unknown points warn and skip; malformed results, routing and replay mutations fail', async () => {
  const warnings = [];
  assert.equal(normalizeHooks([{ type: 'unknown', hook() { throw Error('must not run'); } }], (...args) => warnings.push(args)).length, 0);
  assert.equal(warnings.length, 1);
  assert.equal(normalizeHooks([{ type: 'unknown' }], async () => { throw Error('logger'); }).length, 0);
  for (const hook of [async () => undefined, async (_c, inputs, agentEnv) => ({ inputs: { ...inputs, sessionId: 'other' }, agentEnv })])
    await assert.rejects(runHooks([{ type: 'pre_dispatch', hook }], 'pre_dispatch', context(), base));
  await assert.rejects(runHooks([{ type: 'pre_invoke', hook: async (_c, inputs, agentEnv) => ({ inputs: { ...inputs, parts: [] }, agentEnv }) }], 'pre_invoke', context(), base, true));
  const gateway = new ChannelGateway({ kernel: {} });
  try { await assert.rejects(gateway.register({ botId: 'bot', apiUrl: 'https://example.test' }, { adapter_type: 'codex' }, [{ type: 'pre_dispatch', hook: 1 }]), /IM_HOOK_INVALID/); }
  finally { await gateway.close(); }
});

test('CLI instruction is XML only at turn 1; preserves image bytes, CDATA and explicit recovery', async () => {
  const bytes = Buffer.from('89504e470d0a1a0a00000000', 'hex');
  const image = { type: 'image', mimeType: 'image/png', data: bytes.toString('base64'), byteSize: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  const input = { ...base, inputs: { ...base.inputs, parts: [image], freshFallbackModelInputParts: [image] } };
  const hooks = createCliHooks({ instruction: 'keep <xml> ]]> content' }, () => {});
  const first = await runHooks(hooks, 'pre_dispatch', context(), input);
  assert.match(first.inputs.parts[0].text, /<context namespace="extra.cli" name="instruction">/);
  assert.match(first.inputs.parts[0].text, /\]\]\]\]><!\[CDATA\[>/);
  assert.deepEqual(first.inputs.parts.at(-1), image);
  assert.deepEqual(first.inputs.freshFallbackModelInputParts.at(-1), image);
  for (const index of [2, 20, 30]) assert.deepEqual(await runHooks(hooks, 'pre_dispatch', context(index), input), input);
});

test('CLI debug exact new flag only; complete data; failed or hanging log sink cannot affect execution', async (t) => {
  const old = process.env.OCTO_CHANNEL_GATEWAY_DEBUG, typo = process.env.OCO_CHANNEL_GATEWAY_DEUBG;
  t.after(() => { if (old === undefined) delete process.env.OCTO_CHANNEL_GATEWAY_DEBUG; else process.env.OCTO_CHANNEL_GATEWAY_DEBUG = old;
    if (typo === undefined) delete process.env.OCO_CHANNEL_GATEWAY_DEUBG; else process.env.OCO_CHANNEL_GATEWAY_DEUBG = typo; });
  const records = [], hooks = createCliHooks({}, (...args) => records.push(args));
  process.env.OCO_CHANNEL_GATEWAY_DEUBG = '1';
  for (const flag of [undefined, '0', 'true', '01', '1']) {
    if (flag === undefined) delete process.env.OCTO_CHANNEL_GATEWAY_DEBUG; else process.env.OCTO_CHANNEL_GATEWAY_DEBUG = flag;
    assert.deepEqual(await runHooks(hooks, 'pre_invoke', context(), base), base);
  }
  assert.equal(records.length, 1); assert.deepEqual(records[0][2].inputs, base.inputs); assert.deepEqual(records[0][2].agentEnv, base.agentEnv);
  for (const sink of [() => { throw Error('sync'); }, async () => { throw Error('async'); }, () => new Promise(() => {})])
    assert.deepEqual(await runHooks(createCliHooks({}, sink), 'pre_invoke', context(), base), base);
  await new Promise(resolve => setImmediate(resolve));
});

async function runtimeFixture(t, hooks, options = {}) {
  let receive;
  const calls = [], controls = [], replies = [];
  t.mock.method(GatewayTransport.prototype, 'start', async function () { receive = value => this.callbacks.onMessage(value); });
  t.mock.method(GatewayTransport.prototype, 'close', async () => {});
  const runtime = new ImRuntime({ bot_id: options.botId ?? 'bot', api_url: 'https://example.test/api', agent: { adapter_type: 'codex', workdir: process.cwd(), instruction: 'SDK must not inject' }, codex_retry: { enabled: !!options.autoRetry, initial_delay_ms: 100, max_delay_ms: 100 } }, {
    hooks,
    kernel: kernelMock({ async *invoke(input) {
      calls.push(input);
      yield { protocolVersion: 2, type: 'session.update', payload: { providerSession: { sessionId: 'provider-' + input.sessionId, resumable: true } } };
      yield { protocolVersion: 2, type: options.failAt === calls.length ? 'run.failed' : 'run.completed', payload: options.autoRetry && options.failAt === calls.length ? retryFailure() : {} };
    }, async interrupt() { return { accepted: true }; } }),
  });
  await runtime.start(); t.after(() => options.expectCloseFailure ? assert.rejects(runtime.close()) : runtime.close());
  let id = 0;
  const send = (text = 'question', kind = 'direct', conversationId = 'owner') => {
    receive({ messageId: String(++id), senderId: 'owner', conversationId, conversationKind: kind, text,
      async buildContext() { return { schema, items: [] }; }, async reply(text) { replies.push(text); },
      beginPresentation(_run, _diagnostic, control) { controls.push(control); return { update() {}, async finish() {} }; },
    });
  };
  const idle = () => waitFor(() => runtime.status.workingTasks === 0);
  return { runtime, calls, controls, replies, send, idle };
}

test('business chooses first/every 20 turns, independent conversations, reset and frozen card retry', async (t) => {
  const seen = [], logs = [];
  const hooks = [
    { type: 'pre_dispatch', hook: async (ctx, inputs, agentEnv) => {
      seen.push(ctx);
      return { inputs: ctx.turn.index === 1 || ctx.turn.index % 20 === 0 ? { ...inputs, parts: [{ type: 'text', text: 'business prepend' }, ...inputs.parts] } : inputs, agentEnv };
    } },
    { type: 'pre_invoke', hook: async (ctx, inputs, agentEnv) => { logs.push({ ctx, inputs: structuredClone(inputs), agentEnv: structuredClone(agentEnv) }); return { inputs, agentEnv }; } },
  ];
  const f = await runtimeFixture(t, hooks, { failAt: 2 });
  for (let turn = 1; turn <= 30; turn++) { f.send(); await f.idle(); }
  assert.equal(f.calls.length, 30);
  assert.deepEqual(seen.map(ctx => ctx.turn.index), Array.from({ length: 30 }, (_, i) => i + 1));
  for (let i = 0; i < 30; i++) {
    assert.equal(f.calls[i].inputs[0].text === 'business prepend', i === 0 || i === 19);
    assert.deepEqual(logs[i].inputs.parts, f.calls[i].inputs);
    assert.equal(logs[i].ctx.sessionId, f.calls[i].sessionId);
    assert.doesNotMatch(JSON.stringify(f.calls[i].inputs), /SDK must not inject/);
  }
  assert.ok(!modelItems(f.calls[29]).some(item => item.name === 'mention-instructions'));
  assert.equal(f.controls[1].retry('owner', 'retry-2'), true); await f.idle();
  assert.equal(f.calls.length, 31); assert.equal(seen.length, 30);
  assert.deepEqual(f.calls[30].inputs, f.calls[1].inputs); assert.equal(logs.at(-1).ctx.turn.index, 2);
  f.send('group message', 'group', 'group'); await f.idle();
  f.send('topic message', 'thread', 'group____topic'); await f.idle();
  assert.equal(seen.at(-2).turn.index, 1); assert.equal(seen.at(-1).turn.index, 1);
  f.send('/reset'); await new Promise(resolve => setImmediate(resolve));
  f.send(); await f.idle();
  assert.equal(seen.at(-1).turn.index, 1); assert.equal(seen.at(-1).providerSession, undefined);
  assert.notEqual(seen.at(-1).sessionId, seen[0].sessionId);
});

test('pre_invoke failure is not submitted and does not consume a turn', async (t) => {
  let fail = true; const indexes = [];
  const f = await runtimeFixture(t, [{ type: 'pre_invoke', hook: async (ctx, inputs, agentEnv) => {
    indexes.push(ctx.turn.index); if (fail) throw Error('business failure'); return { inputs, agentEnv };
  } }]);
  f.send(); await f.idle(); assert.equal(f.calls.length, 0);
  fail = false; f.send(); await f.idle(); assert.equal(f.calls.length, 1);
  assert.deepEqual(indexes, [1, 1]);
});

test('close aborts a cooperative hook and prevents late invoke', async (t) => {
  let entered = false;
  const f = await runtimeFixture(t, [{ type: 'pre_invoke', hook: async (ctx, inputs, agentEnv) => {
    entered = true; await new Promise(resolve => ctx.signal.addEventListener('abort', resolve, { once: true }));
    return { inputs, agentEnv };
  } }]);
  f.send(); await waitFor(() => entered); await f.runtime.close(); assert.equal(f.calls.length, 0);
});


test('automatic retry preserves first pre_invoke transformation and rejects subsequent mutations', async (t) => {
  for (const mutateRetry of [false, true]) {
    let dispatches = 0, invokes = 0;
    const f = await runtimeFixture(t, [
      { type: 'pre_dispatch', hook: async (_ctx, inputs, agentEnv) => { dispatches++; return { inputs, agentEnv }; } },
      { type: 'pre_invoke', hook: async (_ctx, inputs, agentEnv) => {
        invokes++;
        return { inputs: invokes === 1 || mutateRetry ? { ...inputs, parts: [{ type: 'text', text: 'invoke prefix' }, ...inputs.parts] } : inputs, agentEnv };
      } },
    ], { autoRetry: true, failAt: 1 });
    f.send(); await f.idle();
    assert.equal(dispatches, 1); assert.equal(invokes, 2);
    assert.equal(f.calls.length, mutateRetry ? 1 : 2);
    if (!mutateRetry) assert.deepEqual(f.calls[0].inputs, f.calls[1].inputs);
    await f.runtime.close();
  }
});

test('different Bots own independent session keys and turn counts', async (t) => {
  const contexts = [];
  const hooks = [{ type: 'pre_dispatch', hook: async (ctx, inputs, agentEnv) => { contexts.push(ctx); return { inputs, agentEnv }; } }];
  const first = await runtimeFixture(t, hooks, { botId: 'first-bot' });
  const second = await runtimeFixture(t, hooks, { botId: 'second-bot' });
  first.send(); await first.idle(); first.send(); await first.idle();
  second.send(); await second.idle();
  assert.deepEqual(contexts.map(ctx => [ctx.botId, ctx.turn.index]), [['first-bot', 1], ['first-bot', 2], ['second-bot', 1]]);
  assert.notEqual(contexts[0].sessionKey, contexts[2].sessionKey);
});

test('reset during either async Hook prevents late submission into the new generation', async (t) => {
  for (const type of ['pre_dispatch', 'pre_invoke']) {
    let release, entered = false, block = true;
    const f = await runtimeFixture(t, [{ type, hook: async (_ctx, inputs, agentEnv) => {
      if (block) { entered = true; await new Promise(resolve => { release = resolve; }); }
      return { inputs, agentEnv };
    } }]);
    f.send(); await waitFor(() => entered); f.send('/reset');
    await new Promise(resolve => setImmediate(resolve)); release(); await f.idle();
    assert.equal(f.calls.length, 0);
    block = false; f.send(); await f.idle(); assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0].runMetadata.conversationTurn, 1);
    await f.runtime.close();
  }
});


test('an uncooperative Hook reports incomplete close and its late result cannot submit', async (t) => {
  let release, entered = false;
  const f = await runtimeFixture(t, [{ type: 'pre_dispatch', hook: async (_ctx, inputs, agentEnv) => {
    entered = true; await new Promise(resolve => { release = resolve; }); return { inputs, agentEnv };
  } }], { expectCloseFailure: true });
  f.send(); await waitFor(() => entered);
  try {
    await assert.rejects(withShutdownDeadline(performance.now() + 25, () => f.runtime.close()));
  } finally { release(); }
  await f.idle(); assert.equal(f.calls.length, 0);
});
