import {
  invokeWire,
  gatewayWire,
} from "../test-support/kernel-mock.js";
import { octoCliEnvironment } from "@mininglamp-oss/octo-channel-gateway";
import { assertAdapterAgentEnv } from "@mininglamp-oss/octo-runtime/adapter-sdk";
import {
  invocationInput,
  InvokeInput,
} from "@mininglamp-oss/octo-runtime-client/protocol";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { sanitizePublicValue } from "../dist/packages/gateway/src/support/public-display.js";
import { adapter } from "./fixtures/tool-environment-adapter.js";
import { nativeHost } from "./native-host-fixture.js";
import { invokeRequest } from "./runtime-fixture.js";
import { createImInvocation } from "../dist/packages/gateway/src/execution/dispatcher.js";
import { prepareKernelInput } from "../dist/packages/gateway/src/execution/kernel-input.js";

const token = `bf_${randomUUID()}`;
const base = "https://im-test.deepminer.com.cn";
const context = {
  schema: "octo.context-envelope/v3",
  items: [
    {
      namespace: "octo.execution",
      name: "envs",
      payload: {
        env_variables: [
          { key: "OCTO_BOT_TOKEN", value: "wrong-context" },
          { key: "OCTO_TOKEN", value: randomUUID() },
          { key: "OCTO_API_BASE_URL", value: "wrong-context" },
          { key: "EXTRA_TOOL_VALUE", value: "kept" },
          { key: "EXPECTED_TOKEN", value: token },
        ],
      },
    },
  ],
};

test("Agent MCP/env defaults compile only into execution settings, merge overrides and freeze retries", () => {
  const bot = {
    bot_id: "example",
    api_url: `${base}/api`,
    agent: {
      adapter_type: "codex",
      workdir: tmpdir(),
      mcp: {
        mcpServers: {
          local: { type: "stdio", command: "/private/tool" },
          remote: {
            type: "streamable_http",
            url: "https://example.test/mcp",
            headers: { Authorization: "PRIVATE_HEADER" },
          },
        },
      },
      envs: {
        env_variables: [
          { key: "KEEP", value: "PRIVATE_ENV" },
          { key: "OVERRIDE", value: "old" },
          { key: "OCTO_BOT_TOKEN", value: "wrong-agent" },
        ],
      },
    },
  };
  const ctx = {
    schema: "octo.context-envelope/v3",
    items: [
      {
        namespace: "octo.execution",
        name: "mcp",
        payload: {
          mcpServers: { local: { type: "stdio", command: "/override/tool" } },
        },
      },
      {
        namespace: "octo.execution",
        name: "envs",
        payload: { env_variables: [{ key: "OVERRIDE", value: "new" }] },
      },
    ],
  };
  const before = structuredClone({ bot, ctx });
  const message = {
    messageId: "m",
    senderId: "peer",
    conversationId: "chat",
    text: "Hello",
  };
  const prepare = (context, historyRetry = false) =>
    createImInvocation(
      bot,
      { ...message, historyRetry },
      context,
      "key",
      { id: "session", generation: 1 },
      new AbortController().signal,
    ).request;
  const request = prepare(ctx);
  const compiled = prepareKernelInput(
    request,
    octoCliEnvironment(`${base}/api`, token),
  );
  const find = (items, name) =>
    items.find(
      (item) => item.namespace === "octo.execution" && item.name === name,
    )?.payload;
  assert.equal(
    find(compiled.agentEnv.items, "mcp").mcpServers.local.command,
    "/override/tool",
  );
  assert.equal(
    find(compiled.agentEnv.items, "mcp").mcpServers.remote.headers
      .Authorization,
    "PRIVATE_HEADER",
  );
  const env = Object.fromEntries(
    find(compiled.agentEnv.items, "envs").env_variables.map(
      ({ key, value }) => [key, value],
    ),
  );
  assert.equal(env.KEEP, "PRIVATE_ENV");
  assert.equal(env.OVERRIDE, "new");
  assert.equal(env.OCTO_BOT_TOKEN, token);
  for (const secret of [
    "PRIVATE_HEADER",
    "PRIVATE_ENV",
    "https://example.test/mcp",
    token,
  ])
    assert.ok(!JSON.stringify(compiled.inputs).includes(secret));
  assert.deepEqual({ bot, ctx }, before);
  bot.agent.mcp.mcpServers.added = { type: "stdio", command: "/new/tool" };
  bot.agent.envs.env_variables.push({ key: "ADDED", value: "new" });
  const retry = prepareKernelInput(prepare(request.contexts, true));
  assert.deepEqual(
    find(retry.agentEnv.items, "mcp"),
    find(request.contexts.items, "mcp"),
  );
  assert.deepEqual(
    find(retry.agentEnv.items, "envs"),
    find(request.contexts.items, "envs"),
  );
  const originallyEmpty = { schema: ctx.schema, items: [] };
  const frozenEmpty = prepareKernelInput(prepare(originallyEmpty, true));
  assert.equal(find(frozenEmpty.agentEnv.items, "mcp"), undefined);
  assert.equal(find(frozenEmpty.agentEnv.items, "envs"), undefined);
});

test("channel tool URL normalization removes only the final api segment", () => {
  for (const [input, expected] of [
    [`${base}/api/`, base],
    [base, base],
    [`${base}:8443/api`, `${base}:8443`],
    [`${base}/api/tools`, `${base}/api/tools`],
  ])
    assert.equal(
      octoCliEnvironment(input, token).env_variables[1].value,
      expected,
    );
  for (const input of [
    "file:///tmp/api",
    "https://user:pass@example.com/api",
    `${base}/api?x=1`,
    `${base}/api#x`,
  ])
    assert.throws(() => octoCliEnvironment(input, token), /IM_API_URL_INVALID/);
  assert.throws(() => octoCliEnvironment(base, ""), /IM_BOT_TOKEN_INVALID/);
});

test("tool overrides cross real Kernel RPC and reach child tools without changing Context", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "octo-tool-env-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const manifest = join(root, "adapters.json");
  await writeFile(
    manifest,
    JSON.stringify({
      version: 1,
      adapters: [
        {
          type: "tool-env",
          module: resolve("test/fixtures/tool-environment-adapter.js"),
          export: "adapter",
        },
      ],
    }),
  );
  const host = await nativeHost([adapter], {
    logging: { directory: join(root, "logs") },
  });
  t.after(() => host.close());
  const original = structuredClone(context);
  const execute = async (value, index) => {
    const ctx = structuredClone(context);
    ctx.items[0].payload.env_variables.find(
      (item) => item.key === "EXPECTED_TOKEN",
    ).value = value;
    const { request } = createImInvocation(
      {
        bot_id: "env-bot",
        api_url: `${base}/api`,
        agent: {
          adapter_type: "tool-env",
          workdir: root,
          envs: ctx.items[0].payload,
        },
      },
      {
        messageId: `tool-${index}`,
        senderId: "peer",
        conversationId: "chat",
        text: "Check tool environment",
      },
      { schema: ctx.schema, items: [] },
      "key",
      { id: `session-${index}`, generation: 1 },
      new AbortController().signal,
    );
    const events = [];
    const prepared = gatewayWire(
      request,
      octoCliEnvironment(`${base}/api`, value),
    );
    for await (const event of invokeWire(host.kernel.client, prepared))
      events.push(event);
    assert.deepEqual(
      JSON.parse(
        events.findLast((event) => event.type === "message.update").payload
          .text,
      ),
      {
        tokenMatches: true,
        canonicalMatches: true,
        baseMatches: true,
        extraKept: true,
      },
    );
  };
  await Promise.all([execute(token, 1), execute(`bf_${randomUUID()}`, 2)]);
  assert.deepEqual(context, original);
  await host.close();
  const log = (await readdir(join(root, "logs"))).find((name) =>
    /^kernel-\d{8}T\d{2}\.log$/.test(name),
  );
  assert.ok(!(await readFile(join(root, "logs", log), "utf8")).includes(token));
  const request = invokeRequest({
    agentEnv: context,
    executionEnvOverrides: octoCliEnvironment(`${base}/api`, token),
  });
  assert.equal(
    sanitizePublicValue(request).executionEnvOverrides,
    "[REDACTED]",
  );
  assert.throws(
    () =>
      InvokeInput.check({
        ...invocationInput(request),
        executionEnvOverrides: request.executionEnvOverrides,
      }),
    /unknown field/,
  );
  for (const invalid of [
    { env_variables: [{ key: "BAD-KEY", value: "x" }] },
    { env_variables: [{ key: "X", value: "a\0b" }] },
    {
      env_variables: [
        { key: "X", value: "a" },
        { key: "X", value: "b" },
      ],
    },
    { env_variables: [{ key: "X", value: "a".repeat(65536) }] },
  ])
    assert.throws(() =>
      assertAdapterAgentEnv({ ...request, agentEnv: { ...context, items: [
        { namespace: "octo.execution", name: "envs", payload: invalid },
      ] } }),
    );
});
