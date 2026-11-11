import { validateImBots } from "@mininglamp-oss/octo-channel-gateway";
import { assertJsonByteLimit } from "@mininglamp-oss/octo-runtime-client/protocol";
import assert from "node:assert/strict";
import test from "node:test";
import { ImRuntime } from "../packages/octo-channel-gateway-sdk/dist/application/im-channel.js";
import { ImChannelManager } from "../packages/octo-channel-gateway-sdk/dist/lifecycle/manager.js";

const bot = (id = "qa") => ({
  bot_id: id,
  enabled: false,
  api_url: "https://im-test.deepminer.com.cn/api",
  agent: { adapter_type: "codex" },
});

test("optional Agent MCP and envs use protocol validation without exposing supplied data", () => {
  const valid = {
    mcp: {
      mcpServers: {
        local: {
          type: "stdio",
          command: "/tools/mcp",
          args: [],
          env: { KEY: "private" },
        },
        remote: {
          type: "streamable_http",
          url: "https://example.test/mcp",
          headers: { Authorization: "private" },
        },
      },
    },
    envs: { env_variables: [{ key: "PROJECT_ENV", value: "development" }] },
  };
  assert.doesNotThrow(() =>
    validateImBots([{ ...bot(), agent: { ...bot().agent, ...valid } }]),
  );
  for (const [field, values, code] of [
    [
      "mcp",
      [
        null,
        [],
        {},
        { mcpServers: { private: { type: "invalid" } } },
        { mcpServers: { local: { type: "stdio", command: "" } } },
      ],
      "IM_AGENT_MCP_INVALID",
    ],
    [
      "envs",
      [
        null,
        [],
        {},
        { env_variables: [{ key: "BAD-KEY-private", value: "secret" }] },
        { env_variables: [{ key: "X", value: 1 }] },
        {
          env_variables: [
            { key: "X", value: "one" },
            { key: "X", value: "two" },
          ],
        },
      ],
      "IM_AGENT_ENVS_INVALID",
    ],
  ])
    for (const value of values) {
      assert.throws(
        () =>
          validateImBots([{ ...bot(), agent: { ...valid, [field]: value } }]),
        (error) => error.message === code,
      );
    }
  assert.doesNotThrow(() =>
    validateImBots([
      {
        ...bot(),
        agent: { mcp: { mcpServers: {} }, envs: { env_variables: [] } },
      },
    ]),
  );
});

test("group switch and optional scope validate Gateway definitions", () => {
  const check = (fields, expected) => {
    const config = { ...bot(), ...fields };
    if (expected) assert.doesNotThrow(() => validateImBots([config]));
    else assert.throws(() => validateImBots([config]), /IM_CONFIG_INVALID/);
  };
  for (const groups_enabled of [undefined, true, false])
    for (const group_ids of [undefined, null, [], ["group"]])
      check({ groups_enabled, group_ids }, true);
  for (const groups_enabled of [null, 0, 1, "false", [], {}])
    check({ groups_enabled }, false);
  for (const group_ids of [false, "group", {}, [null], [1], [""]])
    check({ group_ids }, false);
});

test("JSON byte counter matches actual encoding and stops before cloning", () => {
  for (const value of [
    { text: '汉字😀\ud800\udc00\ud800\u0000\n"\\', absent: undefined },
    [null, undefined, false, Infinity, -0, 1.234e30],
    { one: { two: [] } },
  ]) {
    const size = Buffer.byteLength(JSON.stringify(value));
    assert.doesNotThrow(() => assertJsonByteLimit(value, size, "TOO_LARGE"));
    assert.throws(
      () => assertJsonByteLimit(value, size - 1, "TOO_LARGE"),
      /TOO_LARGE/,
    );
  }
  const circular = {};
  circular.self = circular;
  assert.throws(
    () => assertJsonByteLimit(circular, 1024, "TOO_LARGE"),
    /CIRCULAR/,
  );
  assert.throws(
    () =>
      assertJsonByteLimit(
        {
          get text() {
            throw Error("must not execute");
          },
        },
        1024,
        "SIZE",
      ),
    /ACCESSOR/,
  );
});

test("Gateway definitions and manager accept 64 bots; a 65th endpoint is rejected", async () => {
  const bots = Array.from({ length: 64 }, (_, i) => bot(`qa-${i}`));
  validateImBots(bots);
  assert.throws(
    () => validateImBots([...bots, bot("overflow")]),
    /IM_CONFIG_LIST_REQUIRED/,
  );
  const manager = new ImChannelManager({ kernel: {} });
  try {
    for (const config of bots) await manager.upsert(config);
    await assert.rejects(
      manager.upsert(bot("overflow")),
      /IM_ENDPOINT_CAPACITY_EXHAUSTED/,
    );
    assert.equal(manager.status.length, 64);
  } finally {
    await manager.close();
  }
});

test("blocked initialization retains at most 64 operations and close drains without a slot", async (t) => {
  let started;
  const ready = new Promise((resolve) => {
    started = resolve;
  });
  t.mock.method(ImRuntime.prototype, "start", async function () {
    started();
    const signal = this.dependencies.signal;
    if (!signal.aborted)
      await new Promise((resolve) =>
        signal.addEventListener("abort", resolve, { once: true }),
      );
  });
  const clone = t.mock.method(globalThis, "structuredClone", structuredClone);
  const manager = new ImChannelManager({ kernel: {} });
  const first = manager.upsert(bot());
  await ready;
  const pending = [first];
  for (let i = 1; i < 64; i++)
    pending.push(manager.upsert({ ...bot(), note: "x".repeat(32768) }));
  const settled = Promise.allSettled(pending);
  const acceptedClones = clone.mock.callCount();
  for (let i = 0; i < 1000; i++)
    await assert.rejects(
      manager.upsert(bot()),
      /IM_CONFIG_QUEUE_CAPACITY_EXHAUSTED/,
    );
  await assert.rejects(
    manager.remove("missing"),
    /IM_CONFIG_QUEUE_CAPACITY_EXHAUSTED/,
  );
  assert.equal(clone.mock.callCount(), acceptedClones);
  await manager.close();
  const results = await settled;
  assert.equal(results.filter((r) => r.status === "rejected").length, 63);
  await assert.rejects(manager.upsert(bot()), /IM_MANAGER_CLOSED/);
});

test("single configuration boundary and failures return operation capacity", async () => {
  const config = bot();
  config.note = "x".repeat(
    262144 - Buffer.byteLength(JSON.stringify({ ...config, note: "" })),
  );
  const manager = new ImChannelManager({ kernel: {} });
  try {
    await manager.upsert(config);
    await assert.rejects(
      manager.upsert({ ...config, note: config.note + "x" }),
      /IM_CONFIG_TOO_LARGE/,
    );
    for (let i = 0; i < 70; i++)
      await assert.rejects(manager.upsert({}), /IM_BOT_ID_REQUIRED/);
    await manager.upsert(bot("after-failure"));
    assert.equal(manager.status.length, 2);
  } finally {
    await manager.close();
  }
});
