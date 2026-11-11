import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import test from "node:test";
import { HostSessionStore } from "../packages/octo-channel-gateway-sdk/dist/application/host-session-store.js";
import { ImRuntime } from "../packages/octo-channel-gateway-sdk/dist/application/im-channel.js";
import { MemoryImSessionStore } from "../packages/octo-channel-gateway-sdk/dist/application/session-store.js";
import { ImChannelManager } from "../packages/octo-channel-gateway-sdk/dist/lifecycle/manager.js";
import { withShutdownDeadline } from "../packages/octo-channel-gateway-sdk/dist/support/shutdown.js";
import { GatewayTransport } from "../packages/octo-channel-gateway-sdk/dist/transport/channel.js";
import { kernelRelay } from "./kernel-relay.js";
import { waitFor } from "./runtime-fixture.js";

const bot = (id = "host-store", fields = {}) => ({
  bot_id: id,
  api_url: "https://im-test.deepminer.com.cn/api",
  agent: { adapter_type: "test", workdir: process.cwd() },
  ...fields,
});
const context = { schema: "octo.context-envelope/v3", items: [] };

// 后端属于测试宿主；逐 Bot 句柄关闭不清空后端，也不引入数据库实现。
function hostHandle(backend, trace = []) {
  class Handle {
    #backend = backend;
    closes = 0;
    close() {
      this.closes++;
      trace.push("store.close");
    }
    read(...args) {
      trace.push("read");
      return this.#backend.read(...args);
    }
    save(...args) {
      trace.push("save");
      if (args[1]?.providerSession?.sessionId)
        trace.push(`provider:${args[1].providerSession.sessionId}`);
      return this.#backend.save(...args);
    }
    reset(...args) {
      trace.push("reset");
      return this.#backend.reset(...args);
    }
    occurrence(...args) {
      trace.push("occurrence");
      return this.#backend.occurrence(...args);
    }
    remember(...args) {
      trace.push("remember");
      return this.#backend.remember(...args);
    }
    patchGap(...args) {
      trace.push("patchGap");
      return this.#backend.patchGap(...args);
    }
    invalidateRules(...args) {
      trace.push("invalidateRules");
      return this.#backend.invalidateRules(...args);
    }
    patchRules(...args) {
      trace.push("patchRules");
      return this.#backend.patchRules(...args);
    }
  }
  return new Handle();
}

function transport(t, trace = []) {
  const callbacks = new Map();
  t.mock.method(GatewayTransport.prototype, "start", async function () {
    callbacks.set(this.config.bot_id, this.callbacks);
  });
  t.mock.method(GatewayTransport.prototype, "close", async () => {
    trace.push("connector.close");
  });
  return callbacks;
}

function message(id, fields = {}) {
  return {
    messageId: id,
    senderId: "sender",
    conversationId: "chat",
    conversationKind: "direct",
    text: "hello",
    buildContext: async () => context,
    reply: async () => {},
    ...fields,
  };
}

async function holdSessionUpdate(t, fixture) {
  const held = Promise.withResolvers(),
    gate = Promise.withResolvers();
  let waiting = false;
  t.after(() => gate.resolve());
  const relay = await kernelRelay(t, fixture, {
    async response(value) {
      const frame = value.params?.event;
      if (
        !waiting &&
        value.method === "agent_run.event" &&
        frame?.kind === "canonical" &&
        frame.event.type === "session.update"
      ) {
        waiting = true;
        held.resolve();
        // 暂缓已产生的真实 IPC 帧；取消之后继续原订阅，不要求 Provider 在取消后产生新事件。
        await gate.promise;
      }
    },
  });
  return {
    endpoint: relay.endpoint,
    ready: held.promise,
    release: () => gate.resolve(),
  };
}

test("host wrapper forwards optional methods with private receivers and fences old generations", async (t) => {
  const backend = new MemoryImSessionStore();
  t.after(() => backend.close());
  const trace = [],
    raw = hostHandle(backend, trace),
    lease = new HostSessionStore();
  const store = lease.create(() => raw, {});
  const identity = { sessionId: "session", generation: 1 };
  store.save("chat", { id: identity.sessionId, generation: 1 });
  assert.equal(
    store.patchGap("chat", identity, () => ({
      processEpoch: "p",
      revision: 0,
      localOutputSeqs: [],
    })),
    true,
  );
  assert.equal(
    store.patchRules("chat", identity, () => ({ revision: 1 })),
    true,
  );
  store.invalidateRules((key) => key === "chat");
  assert.deepEqual(store.read("chat").rulesContext, { revision: 2 });
  store.reset("chat", "reset");
  assert.equal(
    store.patchGap("chat", identity, () => {
      throw new Error("late");
    }),
    false,
  );
  assert.equal(
    store.patchRules("chat", identity, () => {
      throw new Error("late");
    }),
    false,
  );
  assert.ok(
    trace.includes("patchGap") &&
      trace.includes("patchRules") &&
      trace.includes("invalidateRules"),
  );
  await lease.close(performance.now() + 1000);
  assert.equal(raw.closes, 1);
  assert.throws(() => store.read("chat"), /IM_SESSION_STORE_CLOSED/);
  assert.equal(trace.at(-1), "store.close");
});

test("missing optional store methods remain absent and a close-less handle is still revoked", async () => {
  const lease = new HostSessionStore();
  const store = lease.create(
    () => ({
      read() {},
      save() {},
      reset() {
        return { generation: 2 };
      },
      occurrence() {},
      remember() {},
    }),
    {},
  );
  for (const name of ["patchGap", "patchRules", "invalidateRules", "close"])
    assert.equal(store[name], undefined);
  await lease.close(performance.now() + 1000);
  assert.throws(() => store.read("chat"), /IM_SESSION_STORE_CLOSED/);
});

for (const name of [
  "read",
  "save",
  "reset",
  "occurrence",
  "remember",
  "patchGap",
  "invalidateRules",
  "patchRules",
]) {
  test(`draining ${name} failures survive a business catch and make lease cleanup fail`, async () => {
    const failure = new Error("private database error");
    const raw = {
      read() {},
      save() {},
      reset() {},
      occurrence() {},
      remember() {},
      [name]() {
        throw failure;
      },
    };
    const lease = new HostSessionStore();
    const store = lease.create(() => raw, {});
    lease.drain(performance.now() + 1000);
    assert.throws(
      () => store[name](),
      (error) => error === failure,
    );
    await assert.rejects(
      lease.close(performance.now() + 1000),
      /IM_SESSION_STORE_DISPOSE_FAILED/,
    );
  });
}

for (const kind of ["throw", "reject", "pending"]) {
  test(`manager retains ownership and forbids replacement after handle close ${kind}`, async (t) => {
    transport(t);
    const backend = new MemoryImSessionStore();
    t.after(() => backend.close());
    const gate = Promise.withResolvers();
    let factories = 0,
      closes = 0;
    const manager = new ImChannelManager({
      kernel: {},
      createSessionStore() {
        factories++;
        const raw = hostHandle(backend);
        raw.close = () => {
          closes++;
          if (kind === "throw") throw new Error("private close");
          return kind === "reject"
            ? Promise.reject(new Error("private close"))
            : gate.promise;
        };
        return raw;
      },
    });
    await manager.upsert(bot());
    const result = await withShutdownDeadline(performance.now() + 60, () =>
      manager.remove(manager.status[0].connection_key),
    ).catch((error) => error);
    assert.equal(result.message, "IM_DISPOSE_FAILED");
    await assert.rejects(manager.upsert(bot()), (error) => error === result);
    assert.equal(factories, 1);
    assert.equal(closes, 1);
    gate.resolve();
    await assert.rejects(manager.close(), /IM_DISPOSE_FAILED/);
    assert.equal(closes, 1);
  });
}

test("manager closes the previous lease before allocating its replacement and borrows direct sessions", async (t) => {
  transport(t);
  const backend = new MemoryImSessionStore();
  t.after(() => backend.close());
  const order = [];
  const manager = new ImChannelManager({
    kernel: {},
    createSessionStore() {
      order.push("factory");
      return hostHandle(backend, order);
    },
  });
  await manager.upsert(bot());
  await manager.upsert(bot());
  assert.ok(order.indexOf("store.close") < order.lastIndexOf("factory"));
  await manager.close();
  let borrowedCloses = 0;
  const borrowed = hostHandle(backend);
  borrowed.close = () => {
    borrowedCloses++;
  };
  const borrower = new ImChannelManager({ kernel: {}, sessions: borrowed });
  await borrower.upsert(bot());
  await borrower.close();
  assert.equal(borrowedCloses, 0);
  assert.throws(
    () =>
      new ImChannelManager({
        kernel: {},
        sessions: borrowed,
        createSessionStore: () => borrowed,
      }),
    /IM_SESSION_STORE_CONFLICT/,
  );
});

for (const reject of [false, true]) {
  test(`mistaken async factory is rejected and late ${reject ? "rejection is consumed" : "handle is closed once"}`, async (t) => {
    transport(t);
    const gate = Promise.withResolvers();
    const backend = new MemoryImSessionStore();
    t.after(() => backend.close());
    const raw = hostHandle(backend);
    const manager = new ImChannelManager({
      kernel: {},
      createSessionStore: () => gate.promise,
    });
    const upsert = withShutdownDeadline(performance.now() + 60, () =>
      manager.upsert(bot()),
    ).catch((error) => error);
    await waitFor(() => manager.status.length === 0);
    assert.equal((await upsert).message, "IM_ENDPOINT_CLEANUP_INCOMPLETE");
    const failed = manager.close().catch((error) => error);
    if (reject) gate.reject(new Error("private rejection"));
    else gate.resolve(raw);
    assert.equal((await failed).message, "IM_DISPOSE_FAILED");
    await waitFor(() => reject || raw.closes === 1);
    assert.equal(raw.closes, reject ? 0 : 1);
    await assert.rejects(manager.upsert(bot()), /IM_MANAGER_CLOSED/);
  });
}

test("factory reentrant close still releases the newly created handle", async (t) => {
  transport(t);
  const backend = new MemoryImSessionStore();
  t.after(() => backend.close());
  const raw = hostHandle(backend);
  let closing;
  const manager = new ImChannelManager({
    kernel: {},
    createSessionStore() {
      closing = manager.close();
      return raw;
    },
  });
  await assert.rejects(manager.upsert(bot()), /IM_MANAGER_CLOSED/);
  await closing;
  assert.equal(raw.closes, 1);
});

test("startup failure releases the acquired handle and allows a clean retry", async (t) => {
  transport(t);
  const backend = new MemoryImSessionStore(),
    handles = [];
  t.after(() => backend.close());
  let fail = true;
  const start = ImRuntime.prototype.start;
  t.mock.method(ImRuntime.prototype, "start", function () {
    if (fail) throw new Error("startup failed after factory");
    return start.call(this);
  });
  const manager = new ImChannelManager({
    kernel: {},
    createSessionStore() {
      const handle = hostHandle(backend);
      handles.push(handle);
      return handle;
    },
  });
  await assert.rejects(manager.upsert(bot()), /startup failed/);
  assert.equal(handles[0].closes, 1);
  fail = false;
  await manager.upsert(bot());
  await manager.close();
  assert.deepEqual(
    handles.map((handle) => handle.closes),
    [1, 1],
  );
});

test("invalid callable properties are rejected without losing an identifiable handle", async () => {
  let closes = 0;
  const raw = {
    get then() {
      throw new Error("private getter");
    },
    close() {
      closes++;
    },
  };
  const lease = new HostSessionStore();
  assert.throws(() => lease.create(() => raw, {}), /IM_SESSION_STORE_INVALID/);
  await lease.close(performance.now() + 1000);
  assert.equal(closes, 1);
  for (const createSessionStore of [null, false, 0, {}])
    assert.throws(
      () => new ImChannelManager({ kernel: {}, createSessionStore }),
      /IM_SESSION_STORE_FACTORY_INVALID/,
    );
});
