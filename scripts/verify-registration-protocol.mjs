// 显式本地专项：pnpm build && node --test scripts/verify-registration-protocol.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { ChannelGateway, validateImConfig } from "../dist/packages/gateway/src/index.js";
import { createImInvocation } from "../dist/packages/gateway/src/execution/dispatcher.js";
import { prepareKernelInput } from "../dist/packages/gateway/src/execution/kernel-input.js";

const agent = { adapter_type: "codex", workdir: process.cwd() };
const bot = { botId: "explicit-bot", apiUrl: "https://example.test/api", bfToken: "bf_placeholder" };

test("missing Bot identity fails before credentials, network or Kernel access", async () => {
  let accesses = 0;
  const gateway = new ChannelGateway({ kernel: { status() { accesses++; throw Error("unexpected"); } } });
  try {
    for (const enabled of [true, false]) {
      for (const botId of [undefined, "", "  ", null]) {
        await assert.rejects(gateway.register({ ...bot, botId, enabled, credentials() { accesses++; } }, agent), /BOT_ID_REQUIRED/);
      }
    }
    assert.equal(accesses, 0);
  } finally { await gateway.close(); }
});

test("removed material APIs cannot run callbacks or leak into execution", async () => {
  const gateway = new ChannelGateway({ kernel: {} });
  try {
    for (const [key, value] of [["loadMaterials", () => { throw Error("must not run"); }], ["materials", []], ["materialLoading", {}]]) {
      await assert.rejects(gateway.register({ ...bot, [key]: value }, agent), /API_REMOVED/);
      assert.throws(() => validateImConfig({ bot_id: bot.botId, api_url: bot.apiUrl, agent, [key]: typeof value === "function" ? "removed callback" : value }), /MATERIAL_API_REMOVED/);
    }
  } finally { await gateway.close(); }
});

const schema = "octo.context-envelope/v3";
function prepare(items, text = "原始问题：今天处理什么？") {
  const { request } = createImInvocation(
    { bot_id: bot.botId, api_url: bot.apiUrl, agent },
    { messageId: "m", senderId: "sender", conversationId: "group", conversationKind: "group", text },
    { schema, items }, "scope", { id: "session", generation: 1, providerSession: { sessionId: "provider", resumable: true } },
    new AbortController().signal,
  );
  return { request, ...prepareKernelInput(request) };
}

test("channel-selected event facts form a separate XML part and never carry into the next message", () => {
  const facts = { namespace: "extra.business", name: "mention-event", payload: { data_format: "text", text: "只属于本次@Bot事件" } };
  const original = structuredClone(facts);
  const first = prepare([facts]);
  assert.equal(first.inputs.prompt, "原始问题：今天处理什么？");
  assert.deepEqual(first.inputs.parts.at(-1), { type: "text", text: first.inputs.prompt });
  assert.ok(first.inputs.parts.slice(0, -1).some((part) => part.type === "text" && part.text.includes('<context namespace="extra.business" name="mention-event">') && part.text.includes(original.payload.text)));
  assert.ok(!JSON.stringify(first.agentEnv).includes(original.payload.text));
  facts.payload.text = "after preparation";
  assert.ok(JSON.stringify(first.inputs).includes(original.payload.text));
  const next = prepare([], "下一条普通问题");
  assert.ok(!JSON.stringify(next.inputs).includes("mention-event"));
  assert.deepEqual(next.inputs.parts.at(-1), { type: "text", text: "下一条普通问题" });
});

test("all 13 adapter extraset examples save valid isolated configurations and match both languages", async (t) => {
  const root = resolve(import.meta.dirname, "..");
  const home = await mkdtemp(join(tmpdir(), "gateway-protocol-docs-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  const en = await readFile(join(root, "docs/en/guides/adapter-extraset.md"), "utf8");
  const zh = await readFile(join(root, "docs/zh-CN/guides/adapter-extraset.md"), "utf8");
  const configs = (text) => [...text.matchAll(/octo-channel-gateway extraset <<'JSON'\n([\s\S]*?)\nJSON/g)].map((match) => JSON.parse(match[1]));
  const examples = configs(en);
  assert.deepEqual(examples, configs(zh));
  // 固定已核对的公开 Runtime 1.1.14 清单；不读取 Runtime checkout 或执行外部 Provider。
  assert.deepEqual(examples.map((config) => config.bots[0].agent.adapter_type), ["dsh", "codex", "claude-code", "codebuddy", "grok-build", "hermes", "kimi-code", "mcode", "opencode", "openclaw", "qodercli", "qoderclicn", "antigravity"]);
  for (const config of examples) {
    const result = spawnSync(process.execPath, [join(root, "dist/apps/cli/src/index.js"), "--home", home, "extraset"], { encoding: "utf8", input: JSON.stringify(config) });
    assert.equal(result.status, 0, `${config.bots[0].agent.adapter_type}: ${result.stderr}`);
    assert.deepEqual(JSON.parse(await readFile(join(home, "config.json"), "utf8")), config);
  }
  const rejected = spawnSync(process.execPath, [join(root, "dist/apps/cli/src/index.js"), "--home", home, "extraset"], { encoding: "utf8", input: JSON.stringify({ bots: [], material_loading: {} }) });
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stdout + rejected.stderr, /IM_MATERIAL_API_REMOVED/);
  assert.deepEqual(JSON.parse(await readFile(join(home, "config.json"), "utf8")), examples.at(-1));
});
