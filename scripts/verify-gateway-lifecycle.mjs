import assert from "node:assert/strict";
import test from "node:test";
import { ChannelGateway, MemoryImSessionStore } from "../packages/octo-channel-gateway-sdk/dist/index.js";
import { GatewayTransport } from "../packages/octo-channel-gateway-sdk/dist/transport/channel.js";
import { ImConnectionError } from "../packages/octo-channel-gateway-sdk/dist/transport/connection-error.js";
import { kernelFixture, kernelInput } from "../test/kernel-fixture.js";
import { waitFor } from "../test/runtime-fixture.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const agent = { adapter_type: "test", workdir: process.cwd() };
const bot = (id = "one", extra = {}) => ({ botId: id.replace(/_rotated$/, ""), apiUrl: "https://example.test/api", bfToken: `bf_${id}`, ...extra });
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
  await assert.rejects(gateway.register(bot("one", { botId: "" }), agent), /BOT_ID_REQUIRED/);
  assert.deepEqual([...active], [original]);
});

test("same-identity concurrent registration follows call order", async t => {
  const { gateway, active } = await setup(t);
  await Promise.all([gateway.register(bot("one", { botName: "first" }), agent), gateway.register(bot("one", { botName: "second" }), agent)]);
  assert.equal(active.size, 1);
  assert.equal(gateway.status[0].bot_name, "second");
});

test("transient initial connection failure keeps reconnect and other bindings alive", async t => {
  const { gateway, active } = await setup(t);
  await gateway.register(bot("one"), agent);
  t.mock.method(GatewayTransport.prototype, "start", async function () {
    if (this.config.bot_id === "two") throw new ImConnectionError("IM_WS_NETWORK_ERROR", true);
    active.add(this);
  });
  await gateway.register(bot("two"), agent);
  assert.equal(gateway.status.length, 2);
  assert.ok(gateway.status.some(item => item.state === "online"));
  assert.ok(gateway.status.some(item => item.state === "retrying"));
  assert.equal(active.size, 1);
  await gateway.close();
  assert.equal(active.size, 0);
});

test("registered binding recovers repeated disconnects without register and ignores stale callbacks after close", async t => {
  const { gateway, active } = await setup(t);
  await gateway.register(bot(), agent);
  let attempts = 0;
  t.mock.method(GatewayTransport.prototype, "start", async function () {
    attempts++;
    if (attempts <= 2) throw new ImConnectionError("IM_WS_NETWORK_ERROR", true);
    active.add(this);
  });
  [...active][0].callbacks.onDisconnect("IM_WS_NETWORK_ERROR", true);
  await waitFor(() => gateway.status[0]?.state === "online" && attempts >= 3, 6000);
  assert.equal(active.size, 1);
  const recovered = [...active][0];
  recovered.callbacks.onDisconnect("IM_WS_NETWORK_ERROR", true);
  await waitFor(() => gateway.status[0]?.state === "online" && attempts >= 4);
  assert.equal(active.size, 1);
  await gateway.close();
  const before = attempts;
  recovered.callbacks.onDisconnect("IM_WS_NETWORK_ERROR", true);
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(attempts, before);
  assert.equal(active.size, 0);
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
  } }), agent), error => {
    assert.equal(error.message, "IM_CONNECTION_NOT_READY");
    assert.equal(error.cause?.message, "IM_AUTH_IDENTITY_INVALID");
    return true;
  });
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
  const publicApi = await import("../packages/octo-channel-gateway-sdk/dist/index.js");
  assert.equal("ChannelRegistry" in publicApi, false);
  assert.equal("ChannelRegistration" in publicApi, false);
});

test("all logging and diagnostic callbacks contain sync and async failures under strict Node rejection handling", async t => {
  const fixture = await kernelFixture(t);
  const source = `
    import assert from "node:assert/strict";
    import { attachKernel } from ${JSON.stringify(import.meta.resolve("@mininglamp-oss/octo-runtime-client"))};
    import { ChannelGateway, ImRuntime, imApi } from ${JSON.stringify(new URL("../packages/octo-channel-gateway-sdk/dist/index.js", import.meta.url).href)};
    import { GatewayTransport } from ${JSON.stringify(new URL("../packages/octo-channel-gateway-sdk/dist/transport/channel.js", import.meta.url).href)};
    const kernel = attachKernel({ endpoint: ${JSON.stringify(fixture.endpoint)} });
    const events = new Set();
    let callbacks;
    GatewayTransport.prototype.start = async function () { callbacks = this.callbacks; };
    GatewayTransport.prototype.close = async function () {};
    const failures = [
      () => { throw Error("sync diagnostic failure"); },
      async () => { throw Error("async diagnostic failure"); },
      () => ({ then(_resolve, reject) { reject(Error("thenable diagnostic failure")); } }),
      () => Object.defineProperty({}, "then", { get() { throw Error("then getter failure"); } }),
      () => new Promise(() => {}),
    ];
    try {
      for (const fail of failures) {
        const log = (level, event) => { events.add(level + ":" + event); return fail(); };
        const gateway = new ChannelGateway({ kernel, log });
        await gateway.register({ apiUrl: "https://example.test/api", botId: "disabled", enabled: false }, { adapter_type: "test" });
        await gateway.close();
        let diagnosed = false;
        const runtime = new ImRuntime({ bot_id: "diagnostic", api_url: "https://example.test/api", agent: { adapter_type: "test" } }, {
          kernel, log, onDiagnostic() { diagnosed = true; return fail(); },
        });
        await runtime.start();
        callbacks.onDiagnostic("IM_TEST_DIAGNOSTIC");
        assert.equal(diagnosed, true);
        callbacks.onDisconnect("IM_WS_NETWORK_ERROR", true);
        await new Promise(resolve => setTimeout(resolve, 10));
        await runtime.close();
        const apiOptions = { apiUrl: "https://example.test/api", botToken: "bf_test", uid: "user", groupNo: "group", log: { info: fail, error: fail } };
        globalThis.fetch = async () => new Response("{}", { status: 500 });
        assert.deepEqual(await imApi.fetchBotGroups(apiOptions), []);
        assert.equal(await imApi.fetchUserInfo(apiOptions), null);
        assert.equal((await imApi.getMentionPref(apiOptions)).effective, false);
        globalThis.fetch = async () => new Response("{}", { status: 401 });
        assert.equal((await imApi.getMentionPref(apiOptions)).effective, false);
        globalThis.fetch = async () => { throw new Error("network failed"); };
        await assert.rejects(imApi.fetchBotGroups(apiOptions), /network failed/);
        assert.equal(await imApi.fetchUserInfo(apiOptions), null);
        assert.equal((await imApi.getMentionPref(apiOptions)).effective, false);
      }
      for (const key of ["info:channel.stopped", "info:channel.connected", "info:channel.retry_scheduled", "warn:channel.diagnostic"]) assert.ok(events.has(key), key);
      await new Promise(resolve => setTimeout(resolve, 20));
      assert.equal((await kernel.status()).execution_ready, true);
    } finally { kernel.close(); }
  `;
  await promisify(execFile)(process.execPath, ["--unhandled-rejections=strict", "--input-type=module", "-e", source], { timeout: 10_000 });
});
