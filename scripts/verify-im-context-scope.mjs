// 显式本地专项：只读边界、请求复用与原有串行失败边界，不增加 CI。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createImContextBuildScope } from '../packages/octo-channel-gateway-sdk/dist/transport/im-context/scope.js';
import { buildImContexts } from '../packages/octo-channel-gateway-sdk/dist/transport/im-context/index.js';
import { buildChannelRules } from '../packages/octo-channel-gateway-sdk/dist/transport/im-context/rules.js';

const config = { bot_id: 'scope-bot', api_url: 'https://example.invalid/api', spaceId: 'space', agent: { adapter_type: 'codex' } };
const message = { messageId: 'm', messageSeq: 10, fromUid: 'alice', channelId: 'group____topic', channelType: 5, timestamp: 0,
  payload: { type: 1, content: 'question', mention: { uids: ['scope-bot'] } } };
const create = (options = {}, incoming = message, signal = new AbortController().signal, bot = config) =>
  createImContextBuildScope(bot, incoming, 'fixture-token', signal, { initialSession: false, turnIndex: 3, ...options });
const rules = () => ({ content: 'rules', version: 1, updated_at: null, updated_by: 'owner' });

test('scope is a detached deeply readonly snapshot; cancellation stays live', async t => {
  const original = structuredClone(message);
  const plan = { mode: 'delta', excludedOutputs: [{ seq: 2, fingerprint: 'original' }] };
  const abort = new AbortController();
  const scope = create({ historyGap: plan }, original, abort.signal);
  original.payload.mention.uids.push('later'); plan.excludedOutputs[0].fingerprint = 'changed';
  assert.deepEqual(scope.message.payload.mention.uids, ['scope-bot']);
  assert.equal(scope.historyPlan.excludedOutputs[0].fingerprint, 'original');
  for (const mutate of [() => { scope.channelId = 'other'; }, () => { scope.turnIndex++; },
    () => scope.message.payload.mention.uids.push('bad'), () => { scope.historyPlan.excludedOutputs[0].seq = 99; },
    () => { scope.readers.groupRules = async () => rules(); }]) assert.throws(mutate, TypeError);
  t.mock.method(globalThis, 'fetch', async () => Response.json(rules()));
  const result = await scope.readers.groupRules();
  assert.throws(() => { result.version = 42; }, TypeError);
  abort.abort();
  await assert.rejects(scope.readers.groupRules(), /abort/i);
  assert.equal(scope.signal.aborted, true);
});

test('overlapping identity batches fetch each UID once, including missing and failed results', async t => {
  const batches = [];
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    const { uids } = JSON.parse(options.body); batches.push(uids);
    return Response.json({ users: uids.filter(uid => uid !== 'missing').map(uid => ({ uid, name: uid, robot: false })) });
  });
  const scope = create();
  const [a, b] = await Promise.all([scope.readers.identities(['alice', 'missing']), scope.readers.identities(['alice', 'bob', 'missing'])]);
  assert.equal(a.alice.name, 'alice'); assert.equal(b.bob.name, 'bob');
  assert.equal(Object.hasOwn(a, 'missing'), false);
  await scope.readers.identities(['missing', 'alice']);
  assert.deepEqual(batches.flat().sort(), ['alice', 'bob', 'missing']);
  assert.throws(() => { a.alice.name = 'changed'; }, TypeError);
  assert.throws(() => { a.alice = {}; }, TypeError);
  // 未知身份只在本轮复用，下一轮允许重新查。
  await create().readers.identities(['missing']);
  assert.equal(batches.flat().filter(uid => uid === 'missing').length, 2);
  t.mock.method(globalThis, 'fetch', async () => { throw Error('unavailable'); });
  const failed = create();
  assert.deepEqual(Object.keys(await failed.readers.identities(['alice'])), []);
  assert.deepEqual(Object.keys(await failed.readers.identities(['alice'])), []);
  assert.equal(globalThis.fetch.mock.callCount(), 1);
});

test('history readers bind the original channel and reuse only identical windows', async t => {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    requests.push(JSON.parse(options.body));
    return Response.json({ more: false, messages: [{ message_id: '9', message_seq: 9, from_uid: 'alice', payload: { type: 1, content: 'history' } }] });
  });
  const scope = create();
  const window = { beforeSeq: 10, afterSeq: 4, limit: 20 };
  const [a, b] = await Promise.all([scope.readers.history(window), scope.readers.history({ ...window })]);
  assert.equal(requests.length, 1); assert.equal(a, b);
  assert.equal(requests[0].channel_id, 'group____topic'); assert.equal(requests[0].channel_type, 5);
  assert.throws(() => { a.messages[0].payload.content = 'changed'; }, TypeError);
  assert.throws(() => a.messages.push({}), TypeError);
  await scope.readers.history({ ...window, afterSeq: 5 });
  await create().readers.history(window);
  assert.equal(requests.length, 3);
});

test('rule APIs preserve distinct endpoints, per-turn freshness and cached rejection', async t => {
  const paths = [];
  t.mock.method(globalThis, 'fetch', async url => { paths.push(new URL(url).pathname); return Response.json(rules()); });
  const scope = create();
  await Promise.all([scope.readers.groupRules(), scope.readers.groupRules(), scope.readers.topicRules()]);
  assert.deepEqual(paths, ['/api/v1/bot/groups/group/md', '/api/v1/bot/groups/group/threads/topic/md']);
  await create().readers.groupRules(); assert.equal(paths.length, 3);
  t.mock.method(globalThis, 'fetch', async () => Response.json({}, { status: 403 }));
  const failed = create();
  for (let i = 0; i < 2; i++) await assert.rejects(failed.readers.groupRules());
  assert.equal(globalThis.fetch.mock.callCount(), 1);
});

test('private messages skip rules; a required rule failure prevents later history requests', async t => {
  const paths = [];
  t.mock.method(globalThis, 'fetch', async url => {
    const path = new URL(url).pathname; paths.push(path);
    return Response.json({}, { status: path.endsWith('/md') ? 403 : 200 });
  });
  assert.deepEqual(await buildChannelRules(create({}, { ...message, channelId: 'owner', channelType: 1 })), []);
  assert.equal(paths.length, 0);
  await assert.rejects(buildImContexts(config, message, 'fixture-token', new AbortController().signal, { initialSession: true }));
  assert.equal(paths.filter(path => path.endsWith('/messages/sync')).length, 0);
});

test('identity results never cross Bot scopes', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (_url, options) => { calls++; return Response.json({ users: JSON.parse(options.body).uids.map(uid => ({ uid, name: `result-${calls}`, robot: false })) }); });
  const a = await create().readers.identities(['alice']);
  const b = await create({}, message, new AbortController().signal, { ...config, bot_id: 'other-bot' }).readers.identities(['alice']);
  assert.equal(calls, 2); assert.notEqual(a.alice.name, b.alice.name);
});


test('UIDs matching Object prototype keys remain unknown when the API returns no identity', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ users: [] }));
  const incoming = { ...message, channelId: 'owner', channelType: 1, fromUid: 'constructor',
    payload: { type: 1, content: 'question', mention: { uids: ['__proto__', 'toString'] } } };
  const scope = create({}, incoming);
  const identities = await scope.readers.identities(['constructor', '__proto__', 'toString']);
  assert.equal(Object.getPrototypeOf(identities), null);
  assert.equal(identities.constructor, undefined);
  const items = await buildImContexts(config, incoming, 'fixture-token', new AbortController().signal);
  const trigger = items.find(item => item.name === 'message-trigger');
  assert.deepEqual(trigger.payload.sender, { uid: 'constructor', name: null, type: 'unknown' });
  assert.deepEqual(trigger.payload.mentions.targets.map(item => item.uid), ['__proto__', 'toString']);
});
