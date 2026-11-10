import assert from "node:assert/strict";
import test from "node:test";
import { ChannelGateway, MemoryImSessionStore } from "../dist/packages/gateway/src/index.js";
import { GatewayTransport } from "../dist/packages/gateway/src/transport/channel.js";
import { kernelFixture, kernelInput } from "../test/kernel-fixture.js";
import { waitFor } from "../test/runtime-fixture.js";

const agent = { adapter_type: "test", workdir: process.cwd() };
const bot = (id = "one", extra = {}) => ({ apiUrl: "https://example.test/api", bfToken: `bf_${id}`, ...extra });
async function setup(t) {
  const fixture = await kernelFixture(t);
  const active = new Set();
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    const token = JSON.parse(options.body).bot_token;
    if (token === "bf_invalid") return new Response("{}", { status: 401 });
    return Response.json({ bot_uid: token.replace(/^bf_/, "").replace(/_rotated$/, ""), space_id: "space" });
  });
  t.mock.method(GatewayTransport.prototype, "start", async function () { active.add(this); });
  t.mock.method(GatewayTransport.prototype, "close", async function () { active.delete(this); });
  const gateway = new ChannelGateway({ kernel: fixture.client });
  t.after(() => gateway.close().catch(() => undefined));
  return { ...fixture, gateway, active };
}

test("upsert normalizes identity, rotates credentials, snapshots arguments and keeps one connection", async t => {
  const { gateway, active } = await setup(t);
  const input = bot();
  const first = gateway.register(input, agent);
  input.bfToken = "bf_wrong";
  await first;
  await gateway.register(bot("two"), agent);
  await gateway.register(bot("one_rotated", { apiUrl: "https://EXAMPLE.test/api/", botName: "updated" }), { ...agent, model: "new" });
  assert.equal(active.size, 2);
  assert.equal(gateway.status.length, 2);
  assert.ok(gateway.status.some(item => item.bot_name === "updated"));
  await gateway.close();
  assert.equal(active.size, 0);
});

test("authentication and validation failures preserve the old binding", async t => {
  const { gateway, active } = await setup(t);
  await gateway.register(bot(), agent);
  const original = [...active][0];
  await assert.rejects(gateway.register(bot("invalid"), agent));
  await assert.rejects(gateway.register(bot("one", { botId: "wrong" }), agent), /IDENTITY_MISMATCH/);
  await assert.rejects(gateway.register(bot("one", { materialLoading: { timeout_ms: 0 } }), agent), /CONFIG_INVALID/);
  assert.deepEqual([...active], [original]);
});

test("same-identity concurrent registration follows call order", async t => {
  const { gateway, active } = await setup(t);
  await Promise.all([gateway.register(bot("one", { botName: "first" }), agent), gateway.register(bot("one", { botName: "second" }), agent)]);
  assert.equal(active.size, 1);
  assert.equal(gateway.status[0].bot_name, "second");
});

test("replacement start failure releases acquired handles and does not restore old binding", async t => {
  const { gateway, active } = await setup(t);
  await gateway.register(bot(), agent);
  let storesClosed = 0;
  t.mock.method(GatewayTransport.prototype, "start", async function () { active.add(this); throw new Error("IM_AUTH_IDENTITY_INVALID"); });
  await assert.rejects(gateway.register(bot("one", { createSessionStore() {
    const store = new MemoryImSessionStore();
    const close = store.close.bind(store);
    store.close = async () => { storesClosed++; await close(); };
    return store;
  } }), agent), /CONNECTION_NOT_READY/);
  assert.equal(storesClosed, 1);
  assert.equal(active.size, 0);
  assert.equal(gateway.status.length, 0);
});

test("cleanup failure blocks replacement but still cleans other bindings", async t => {
  const { gateway, active } = await setup(t);
  await gateway.register(bot(), agent);
  await gateway.register(bot("two"), agent);
  const failed = [...active][0];
  t.mock.method(GatewayTransport.prototype, "close", async function () {
    active.delete(this);
    if (this === failed) throw new Error("cleanup failed");
  });
  await assert.rejects(gateway.register(bot(), agent), /DISPOSE_FAILED/);
  assert.equal(active.size, 1);
  const close = gateway.close();
  assert.equal(close, gateway.close());
  await assert.rejects(close, /DISPOSE_FAILED/);
  assert.equal(active.size, 0);
  await assert.rejects(gateway.register(bot(), agent), /GATEWAY_CLOSED/);
});

test("close cancels in-progress authentication and queued registration", async t => {
  const { gateway, active } = await setup(t);
  const entered = Promise.withResolvers();
  const first = gateway.register(bot("one", { credentials(_config, signal) {
    entered.resolve();
    return new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("cancelled")), { once: true }));
  } }), agent);
  const second = gateway.register(bot("two"), agent);
  const results = Promise.allSettled([first, second]);
  await entered.promise;
  await gateway.close();
  assert.deepEqual((await results).map(result => result.status), ["rejected", "rejected"]);
  assert.equal(active.size, 0);
});

test("close owns late initialization resources and rejects reuse of the closed Gateway", async t => {
  const { gateway, active } = await setup(t);
  const entered = Promise.withResolvers(), release = Promise.withResolvers();
  t.mock.method(GatewayTransport.prototype, "start", async function () { entered.resolve(); await release.promise; active.add(this); });
  const registering = gateway.register(bot(), agent);
  const result = Promise.allSettled([registering]);
  await entered.promise;
  const closing = gateway.close();
  release.resolve();
  await closing;
  assert.equal((await result)[0].status, "rejected");
  assert.equal(active.size, 0);
  await assert.rejects(gateway.register(bot(), agent), /GATEWAY_CLOSED/);
});

test("Gateway close cancels only owned execution; shared client and new Gateway remain usable", async t => {
  const { gateway, client, active } = await setup(t);
  const calls = [];
  for (const method of ["stopAdmission", "drain"]) {
    const original = client.invocations[method].bind(client.invocations);
    t.mock.method(client.invocations, method, (...args) => { calls.push(method); return original(...args); });
  }
  const request = kernelInput("wait-for-cancel");
  const unrelated = client.invoke({ parts: request.inputs, ...Object.fromEntries(Object.entries(request).filter(([key]) => !["inputs", "agentEnv", "sessionId", "providerSession"].includes(key))) }, request.sessionId, request.providerSession, request.agentEnv);
  const unrelatedResult = Array.fromAsync(unrelated);
  t.after(async () => { await client.interrupt(unrelated.invocationId).catch(() => undefined); await unrelatedResult.catch(() => undefined); });
  await gateway.register(bot(), agent);
  [...active][0].callbacks.onMessage({ messageId: "owned", senderId: "sender", conversationId: "chat", conversationKind: "direct", text: "wait-for-cancel", buildContext: async () => ({ schema: "octo.context-envelope/v3", items: [] }), reply: async () => {} });
  await waitFor(() => client.invocations.snapshot().length === 2 && client.invocations.snapshot().every(record => record.ref));
  await gateway.close();
  assert.deepEqual(calls, []);
  assert.deepEqual(client.invocations.snapshot().map(record => record.key.invocation_id), [unrelated.invocationId]);
  const next = new ChannelGateway({ kernel: client });
  try { await next.register(bot("next"), agent); assert.equal(active.size, 1); }
  finally { await next.close(); }
  await client.interrupt(unrelated.invocationId);
  await unrelatedResult;
  assert.equal((await client.status()).execution_ready, true);
});

test("uncooperative material callback reports incomplete cleanup and cannot invoke after close", async t => {
  const { gateway, client, active } = await setup(t);
  const entered = Promise.withResolvers(), release = Promise.withResolvers();
  await gateway.register(bot("one", { async loadMaterials() { entered.resolve(); await release.promise; return []; } }), agent);
  [...active][0].callbacks.onMessage({ messageId: "material", senderId: "sender", conversationId: "chat", conversationKind: "direct", text: "hello", buildContext: async () => ({ schema: "octo.context-envelope/v3", items: [] }), reply: async () => {} });
  await entered.promise;
  const closing = gateway.close();
  await assert.rejects(closing, /DISPOSE_FAILED/);
  assert.equal(active.size, 0);
  release.resolve();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(client.invocations.snapshot().length, 0);
  assert.equal(gateway.close(), closing);
});

test("late credentials after shutdown timeout cannot create a binding", async t => {
  const { gateway, active } = await setup(t);
  const entered = Promise.withResolvers(), release = Promise.withResolvers();
  const registering = gateway.register(bot("one", { async credentials() { entered.resolve(); return release.promise; } }), agent);
  const result = Promise.allSettled([registering]);
  await entered.promise;
  await assert.rejects(gateway.close(), /DISPOSE_FAILED/);
  release.resolve("bf_one");
  assert.equal((await result)[0].status, "rejected");
  assert.equal(active.size, 0);
  assert.equal(gateway.status.length, 0);
});

test("unavailable Kernel preserves old binding and invalid legacy APIs reject", async t => {
  const { gateway, client, active } = await setup(t);
  await gateway.register(bot(), agent);
  t.mock.method(client, "status", async () => { throw new Error("KERNEL_UNAVAILABLE"); });
  await assert.rejects(gateway.register(bot(), agent), /KERNEL_UNAVAILABLE/);
  await assert.rejects(gateway.register({ bot: bot(), agent }), /API_REMOVED/);
  assert.equal(active.size, 1);
  const publicApi = await import("../dist/packages/gateway/src/index.js");
  assert.equal("ChannelRegistry" in publicApi, false);
  assert.equal("ChannelRegistration" in publicApi, false);
});
