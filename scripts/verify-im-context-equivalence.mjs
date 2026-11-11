// 显式本地验证；默认对照本次重构前真实 pre_invoke 快照，不加入 CI。
// 首次采集：node scripts/verify-im-context-equivalence.mjs --baseline /tmp/BASELINE_ROOT
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { setImmediate as settle } from 'node:timers/promises';
import { kernelMock } from '../test-support/kernel-mock.js';

// 固定夹具时区，避免执行机器的本地时区改变消息文本。
process.env.TZ = 'Asia/Shanghai';
const root = resolve(import.meta.dirname, '..');
const fixture = join(import.meta.dirname, 'fixtures/im-context-pre-invoke.json');
const schema = 'octo.context-envelope/v3';
const png = Buffer.from('89504e470d0a1a0a00000000', 'hex');
const image = { type: 'image', mimeType: 'image/png', data: png.toString('base64'), byteSize: png.length, sha256: createHash('sha256').update(png).digest('hex') };
async function capture(directory, baseline = false) {
  const load = path => import(pathToFileURL(join(directory, 'dist', path)).href);
  const api = await load('packages/gateway/src/index.js');
  // 此分支只用于比较独立保存的重构前产物；生产代码不保留旧入口。
  const build = baseline ? api.build_im_contexts : api.buildImContexts;
  const { GatewayTransport } = await load('packages/gateway/src/transport/channel.js');
  const { createCliHooks } = await load('apps/cli/src/hooks.js');
  const { MessageIdentityCache } = await load('packages/gateway/src/transport/message-identities.js');
  const original = { fetch: globalThis.fetch, start: GatewayTransport.prototype.start, close: GatewayTransport.prototype.close };
  const records = [], wires = [], controls = [], requests = [];
  let receive, sequence = 100, active = '', rulesVersion = 1, rulesStatus = 'present', historyFailure = false, failNext = false;
  const identityCache = new MessageIdentityCache();
  const config = { bot_id: 'fixture-bot', bot_name: 'Fixture Bot', api_url: 'https://example.invalid/api', spaceId: 'fixture-space',
    agent: { adapter_type: 'codex', workdir: root, instruction: 'first-turn instruction ]]> 保留原文',
      model: 'fixture-model', effort: 'high', items: [{ namespace: 'adapter.business', name: 'private', payload: { guidance: { opaque: true }, extra: [1, 2] } }] },
  };
  GatewayTransport.prototype.start = async function () { receive = value => this.callbacks.onMessage(value); };
  GatewayTransport.prototype.close = async () => {};
  globalThis.fetch = async (url, options) => {
    const path = new URL(url).pathname;
    assert.equal(new URL(url).hostname, 'example.invalid');
    requests.push({ active, path, body: options?.body ? JSON.parse(options.body) : undefined });
    if (path.endsWith('/users/batch')) return Response.json({ users: JSON.parse(options.body).uids.map(uid => ({ uid, name: `name:${uid}`, robot: uid === 'fixture-bot' })) });
    if (path.endsWith('/md')) return rulesStatus === 'deleted' ? Response.json({}, { status: 404 }) : Response.json({ content: rulesStatus === 'empty' ? '' : `rules ${rulesVersion}: ${path}`, version: rulesVersion, updated_at: null, updated_by: 'owner' });
    if (path.endsWith('/messages/sync')) {
      if (historyFailure) return Response.json({}, { status: 503 });
      const body = JSON.parse(options.body);
      return Response.json({ more: false, messages: [body.start_message_seq, body.start_message_seq - 1].filter(seq => seq > body.end_message_seq).map(seq => ({
        message_id: `history-${seq}`, message_seq: seq, from_uid: seq % 2 ? 'owner' : 'peer', timestamp: 1794355200000,
        payload: { type: 1, content: `history ${seq} 中文` },
      })) });
    }
    return Response.json({ group_no: 'group', short_id: 'topic', name: 'channel name', group_name: 'group name' });
  };
  const runtime = new api.ImRuntime(config, { hooks: [...createCliHooks(config.agent, () => {}), {
    type: 'pre_invoke', hook: async (ctx, inputs, agentEnv) => {
      records.push({ scenario: active, ctx: { botId: ctx.botId, sessionKey: ctx.sessionKey, generation: ctx.generation,
        sessionId: ctx.sessionId, providerSession: ctx.providerSession, messageId: ctx.messageId, conversation: ctx.conversation, turn: ctx.turn }, inputs: structuredClone(inputs), agentEnv: structuredClone(agentEnv) });
      return { inputs, agentEnv };
    },
  }], kernel: kernelMock({ async *invoke(wire) {
    wires.push(wire);
    yield { protocolVersion: 2, type: 'session.update', payload: { providerSession: { sessionId: 'fixture-provider', resumable: true } } };
    yield { protocolVersion: 2, type: failNext ? 'run.failed' : 'run.completed', payload: {} };
    failNext = false;
  }, async interrupt() { return { accepted: true }; } }) });
  const idle = async () => {
    await settle();
    const end = performance.now() + 4000;
    while (runtime.status.workingTasks !== 0) { assert.ok(performance.now() < end, `timeout ${active}`); await settle(); }
  };
  const send = async (label, kind, payload, text = 'ordinary question') => {
    active = label;
    const id = String(++sequence), channelId = kind === 'direct' ? 'owner' : kind === 'group' ? 'group' : 'group____topic';
    const message = { messageId: id, messageSeq: sequence, fromUid: 'owner', channelId, channelType: kind === 'direct' ? 1 : kind === 'group' ? 2 : 5, timestamp: 1794355200, payload };
    const before = records.length;
    receive({ messageId: id, senderId: 'owner', conversationId: channelId, conversationKind: kind, text,
      position: { messageSeq: sequence },
      async buildContext(signal, options) { return { schema, items: await build(config, message, 'fixture-token', signal, { ...options, identityCache }) }; },
      ...(payload.type === 2 ? { async buildInputs() { return [structuredClone(image)]; } } : {}),
      executionEnvironment: () => ({ executionEnvOverrides: { env_variables: [{ key: 'FIXTURE_CREDENTIAL', value: 'local-fixture-only' }] } }),
      async reply() {}, beginPresentation(_run, _diagnostic, control) { controls.push(control); return { update() {}, async finish() {} }; },
    });
    await idle();
    if (!text.startsWith('/')) assert.equal(records.length, before + 1, label);
  };
  try {
    await runtime.start();
    await send('dm-first-reply', 'direct', { type: 1, content: 'question', reply: { from_name: 'Alice', payload: { type: 1, content: 'quoted text' } } });
    await send('dm-resource', 'direct', { type: 8, name: 'document.pdf', url: 'storage/example.pdf' });
    await send('group-first', 'group', { type: 1, content: 'question', mention: { uids: ['fixture-bot', 'peer'] } });
    await send('group-unchanged', 'group', { type: 1, content: 'question' });
    rulesVersion++;
    await send('group-rules-updated', 'group', { type: 1, content: 'question' });
    rulesVersion++; rulesStatus = 'empty';
    await send('group-rules-empty', 'group', { type: 1, content: 'question' });
    rulesStatus = 'deleted';
    await send('group-rules-deleted', 'group', { type: 1, content: 'question' });
    rulesVersion++; rulesStatus = 'present';
    await send('topic-first', 'thread', { type: 1, content: 'question' });
    await send('topic-image', 'thread', { type: 2 });
    historyFailure = true;
    await send('history-unavailable', 'thread', { type: 1, content: 'question' });
    historyFailure = false;
    await send('forward', 'thread', { type: 11, msgs: [{ from_uid: 'peer', from_name: 'Peer', payload: { type: 1, content: 'forwarded fact' } }] });
    failNext = true;
    await send('failed-turn', 'group', { type: 1, content: 'question' });
    active = 'card-retry';
    assert.equal(controls.at(-1).retry('owner', 'retry-fixture'), true);
    await idle();
    await send('reset', 'group', { type: 1, content: '/reset' }, '/reset');
    await send('after-reset', 'group', { type: 1, content: 'question' });
    assert.equal(records.length, 14);
    assert.equal(wires.length, records.length);
    records.forEach((record, index) => { assert.deepEqual(record.inputs.parts, wires[index].inputs); assert.deepEqual(record.agentEnv, wires[index].agentEnv); });
    const ids = new Map();
    const normalized = JSON.stringify(records).replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g,
      id => { if (!ids.has(id)) ids.set(id, `UUID-${ids.size + 1}`); return ids.get(id); }).replaceAll(root, '$WORKDIR');
    return { records: JSON.parse(normalized), requests };
  } finally {
    await runtime.close();
    globalThis.fetch = original.fetch;
    GatewayTransport.prototype.start = original.start;
    GatewayTransport.prototype.close = original.close;
  }
}

let expected;
if (process.argv[2] === '--baseline') {
  assert.ok(process.argv[3], 'Supply the saved pre-refactor build root');
  const reference = await capture(resolve(process.argv[3]), true);
  expected = { description: 'Actual pre_invoke captures before im-context refactor; only random UUIDs and workspace path normalized. Fixed local API responses; no external traffic.', records: reference.records };
  await mkdir(resolve(fixture, '..'), { recursive: true });
  await writeFile(fixture, JSON.stringify(expected, null, 2) + '\n');
} else expected = JSON.parse(await readFile(fixture, 'utf8'));
const current = await capture(root);
assert.deepEqual(current.records, expected.records);
console.log(`PASS ${current.records.length} actual pre_invoke snapshots match the pre-refactor baseline (including images, AgentEnv, recovery, updated/empty/deleted rules, reset and frozen retry).`);
