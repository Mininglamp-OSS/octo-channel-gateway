import { createCliHooks } from "../apps/cli/dist/hooks.js";
import { runHooks, hookContext } from "../packages/octo-channel-gateway-sdk/dist/hooks.js";
// 显式本地专项；不加入默认测试或 CI glob。
import assert from "node:assert/strict";
import test from "node:test";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { attachKernel } from "@mininglamp-oss/octo-runtime-client";
import { createKernelService, componentEndpoint } from "@mininglamp-oss/octo-runtime/host";
import { createImInvocation } from "../packages/octo-channel-gateway-sdk/dist/execution/dispatcher.js";
import { prepareKernelInput } from "../packages/octo-channel-gateway-sdk/dist/execution/kernel-input.js";
import { ImTask } from "../packages/octo-channel-gateway-sdk/dist/execution/task.js";
import { ImRuntime, validateImConfig } from "../packages/octo-channel-gateway-sdk/dist/index.js";
import { RuntimeLogging } from "../packages/octo-channel-gateway-sdk/dist/support/runtime-log.js";
import { GatewayTransport } from "../packages/octo-channel-gateway-sdk/dist/transport/channel.js";
import { renderModelContexts } from "../packages/octo-channel-gateway-sdk/dist/execution/model-input.js";
import { kernelMock } from "../test-support/kernel-mock.js";
import { waitFor } from "../test/runtime-fixture.js";
import { createVerificationKernel } from "../test-support/verification-kernel.mjs";
import { fileURLToPath } from "node:url";

const schema = "octo.context-envelope/v3";
const bot = { bot_id: "runtime-114", api_url: "https://example.test/api",
  agent: { adapter_type: "codex", workdir: process.cwd(), instruction: "  frozen instruction\n" } };
const message = { messageId: "m", conversationId: "owner", senderId: "owner", text: "question" };
const draft = (providerSession, refresh, config = bot, items = []) => createImInvocation(config, message,
  { schema, items }, "key", { id: "session", generation: 1, ...(providerSession ? { providerSession } : {}) },
  new AbortController().signal, "m", refresh).request;
const resumed = { sessionId: "provider", resumable: true };
const invokeHooks = (log) => (request, prepared, signal) => runHooks(createCliHooks({}, log), "pre_invoke", hookContext({
  botId: bot.bot_id, sessionKey: "key", sessionId: request.sessionId, providerSession: request.providerSession,
  generation: 1, messageId: "m", conversation: { kind: "direct", id: "owner" }, turn: { index: 1 }, signal,
}), prepared);

test("SDK compilation does not inject CLI instruction, including explicit recovery", () => {
  for (const [provider, refresh, expected] of [[undefined, true, true], [resumed, false, false],
    [resumed, true, false], [{ ...resumed, resumable: false }, true, true]]) {
    const input = draft(provider, refresh);
    input.freshFallbackModelInputParts = [{ type: "text", text: "recovery history" }];
    const compiled = prepareKernelInput(input);
    assert.equal(compiled.inputs.parts[0].text === bot.agent.instruction, false);
    assert.equal(compiled.inputs.parts.at(-1).text, "question");
    assert.notEqual(compiled.inputs.freshFallbackModelInputParts[0].text, bot.agent.instruction);
    assert.equal(compiled.inputs.freshFallbackModelInputParts.at(-1).text, "recovery history");
    assert.ok(!JSON.stringify(compiled.agentEnv).includes("frozen instruction"));
    assert.deepEqual(Object.keys(compiled.agentEnv).sort(), ["items", "schema"]);
    for (const removed of ["agentSource", "approvalMode", "contexts", "instruction", "includeInstruction"])
      assert.ok(!(removed in compiled.inputs));
  }
  const textRecovery = draft(resumed, false);
  textRecovery.freshFallbackModelInput = "explicit text recovery";
  const compiled = prepareKernelInput(textRecovery).inputs;
  assert.ok(!compiled.freshFallbackModelInput.startsWith(bot.agent.instruction));
  assert.ok(compiled.freshFallbackModelInput.endsWith("explicit text recovery"));
  assert.equal(compiled.freshFallbackModelInputParts, undefined);
});

test("instruction empty values, invalid types and configuration byte budget", () => {
  for (const instruction of [undefined, "", " \n\t"]) {
    const compiled = prepareKernelInput(draft(undefined, true, { ...bot, agent: { ...bot.agent, instruction } }));
    assert.equal(compiled.inputs.parts.length, 2);
    assert.equal(compiled.inputs.freshFallbackModelInputParts, undefined);
  }
  for (const instruction of [1, {}, [], null])
    assert.throws(() => validateImConfig({ ...bot, agent: { ...bot.agent, instruction } }), /IM_AGENT_INSTRUCTION_INVALID/);
  assert.throws(() => validateImConfig({ ...bot, agent: { ...bot.agent, instruction: "x".repeat(300000) } }), /IM_CONFIG_TOO_LARGE/);
});

test("CLI extraset/extraget preserves the business instruction without an AgentEnv envelope", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "gateway-config-113-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const cli = join(process.cwd(), "apps/cli/dist/index.js");
  execFileSync(process.execPath, [cli, "extraset", "--home", directory], {
    input: JSON.stringify({ enabled: false, bots: [{ ...bot, enabled: false }] }), encoding: "utf8",
  });
  const saved = JSON.parse(execFileSync(process.execPath, [cli, "extraget", "--home", directory], { encoding: "utf8" }));
  assert.equal(saved.bots[0].agent.instruction, bot.agent.instruction);
  assert.equal(saved.bots[0].agentEnv, undefined);
});

test("renderer keeps the previous selection rules and private data out of model input", () => {
  const names = ["extra.business/brief", "octo.content/inline", "octo.content/references", "im/project",
    "octo.content/continuity", "adapter.octobuddy/options", "business.private/options"];
  const items = names.map((key, index) => { const [namespace, name] = key.split("/");
    return { namespace, name, payload: { index, nested: { z: "]]>", a: true } } }; });
  const rendered = renderModelContexts({ schema, items });
  names.forEach((key, index) => { const [namespace, name] = key.split("/");
    assert.equal(rendered.includes(`<context namespace="${namespace}" name="${name}">`), index < 3); });
  assert.doesNotMatch(rendered, /<contexts>|<context-item/);
  const env = prepareKernelInput(draft(undefined, true, bot, items)).agentEnv;
  assert.deepEqual(env.items.filter((item) => names.slice(3).includes(item.namespace + "/" + item.name)), items.slice(3));
});

test("workspace preparation rejects missing directories and removed mode; OpenClaw needs no local path", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "gateway-workdir-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, "file"), "fixture");
  for (const workdir of [join(directory, "missing"), join(directory, "file")])
    assert.throws(() => draft(undefined, true, { ...bot, agent: { ...bot.agent, workdir } }), /IM_AGENT_WORKDIR_UNAVAILABLE/);
  assert.throws(() => draft(undefined, true, bot, [{ namespace: "octo.execution", name: "workspace",
    payload: { path: process.cwd(), mode: "fixed" } }]), /IM_AGENT_WORKSPACE_INVALID/);
  const env = prepareKernelInput(draft(undefined, true, { ...bot,
    agent: { adapter_type: "openclaw", provider_agent_id: "my-agent" } })).agentEnv;
  assert.equal(env.items.some((item) => item.name === "workspace"), false);
  assert.deepEqual(env.items.find((item) => item.namespace === "adapter.openclaw").payload, { agentId: "my-agent" });
});

test("Runtime session lifecycle freezes instruction on card retry and reinjects after reset", async (t) => {
  let receive;
  const calls = [], controls = [];
  t.mock.method(GatewayTransport.prototype, "start", async function () { receive = (value) => this.callbacks.onMessage(value); });
  t.mock.method(GatewayTransport.prototype, "close", async () => {});
  const runtime = new ImRuntime({ ...bot, codex_retry: { enabled: false } }, {
    hooks: createCliHooks(bot.agent, () => {}),
    kernel: kernelMock({ async *invoke(input) {
      calls.push(input);
      yield { protocolVersion: 2, type: "session.update", payload: { providerSession: resumed } };
      yield { protocolVersion: 2, type: calls.length === 2 ? "run.failed" : "run.completed", payload: {} };
    }, async interrupt() { return { accepted: false }; }, async respondInteraction() {} }),
  });
  await runtime.start();
  t.after(() => runtime.close());
  const send = async (text, messageId) => {
    receive({ ...message, text, messageId, conversationKind: "direct", async reply() {},
      async buildContext() { return { schema, items: [] }; },
      beginPresentation(_run, _diagnostic, control) { controls.push(control); return { update() {}, async finish() {} }; } });
    await waitFor(() => runtime.status.sessions.length === 0);
  };
  await send("first", "first");
  await waitFor(() => calls.length === 1);
  await send("second", "second");
  await waitFor(() => calls.length === 2);
  runtime.config.agent.instruction = "changed instruction";
  assert.equal(controls[1].retry("owner", "retry"), true);
  await waitFor(() => calls.length === 3 && runtime.status.sessions.length === 0);
  assert.match(calls[0].inputs[0].text, /frozen instruction/);
  for (const input of calls.slice(1)) {
    assert.notEqual(input.inputs[0].text, bot.agent.instruction);
    assert.doesNotMatch(JSON.stringify(input.inputs), /frozen instruction/);
  }
  await send("/reset", "reset");
  await send("after reset", "next");
  await waitFor(() => calls.length === 4);
  assert.match(calls[3].inputs[0].text, /frozen instruction/); // CLI uses the registration config snapshot.
});

test("actual client/Kernel preserves private items, ordered images and complete debug log", { timeout: 10000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "gateway-client-113-"));
  const previous = process.env.OCTO_CHANNEL_GATEWAY_DEBUG;
  t.after(() => { if (previous === undefined) delete process.env.OCTO_CHANNEL_GATEWAY_DEBUG;
    else process.env.OCTO_CHANNEL_GATEWAY_DEBUG = previous; });
  const seen = [], sdkLogs = [], statuses = [];
  const kernel = createKernelService({ home: directory, endpoint: componentEndpoint(directory), adapters: [{
    metadata: { type: "octobuddy", agentSources: ["provisioned"], protocolSupport: { protocol: "fixture", modes: ["canonical"], nativeMethods: [] } },
    async *invoke(request) { seen.push(request); yield { protocolVersion: 2, type: "run.completed", payload: {} }; },
  }] });
  await kernel.initialize();
  const client = attachKernel({ endpoint: componentEndpoint(directory) });
  const logging = new RuntimeLogging({ directory: join(directory, "logs"), statusOutput: (record) => statuses.push(record) });
  t.after(async () => { client.close(); await logging.close();
    try { assert.equal((await kernel.close()).complete, true); }
    finally { await rm(directory, { recursive: true, force: true }); } });
  const bytes = Buffer.alloc(1024 * 1024, 7);
  Buffer.from("89504e470d0a1a0a", "hex").copy(bytes);
  const image = { type: "image", mimeType: "image/png", data: bytes.toString("base64"), byteSize: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex") };
  const privateItems = [{ namespace: "adapter.octobuddy", name: "options", payload: { nested: { z: [1, "kept"], a: true } } },
    { namespace: "business.private", name: "connection", payload: { secret: "private connection" } }];
  const input = draft(undefined, true, { ...bot, agent: { ...bot.agent, adapter_type: "octobuddy" } }, privateItems);
  input.inputs = [image];
  input.freshFallbackModelInputParts = [structuredClone(image)];
  const before = structuredClone(input);
  const log = logging.channel("channel-gateway");
  for (const setting of [undefined, "0", "true", "01", "1"]) {
    if (setting === undefined) delete process.env.OCTO_CHANNEL_GATEWAY_DEBUG;
    else process.env.OCTO_CHANNEL_GATEWAY_DEBUG = setting;
    const task = new ImTask(client, { ...input, runId: randomUUID(), invocationId: randomUUID() }, "octobuddy", bot, {
      executionEnvOverrides: { env_variables: [{ key: "TOKEN", value: "full-debug-credential" }] },
    }, () => {}, undefined, invokeHooks((level, event, data) => { sdkLogs.push({ level, event, data }); log(level, event, data); }));
    assert.equal((await Array.fromAsync(task.events())).at(-1).type, "run.completed");
  }
  assert.deepEqual(input, before);
  assert.equal(sdkLogs.length, 1);
  const record = sdkLogs[0];
  assert.equal(record.level, "debug");
  assert.deepEqual(record.data.inputs.parts.at(-1), image);
  assert.deepEqual(record.data.inputs.freshFallbackModelInputParts.at(-1), image);
  assert.deepEqual(record.data.agentEnv.items.filter((item) => privateItems.some((p) => p.namespace === item.namespace)), privateItems);
  assert.deepEqual(seen.at(-1).modelInputParts, record.data.inputs.parts);
  assert.deepEqual(seen.at(-1).agentEnv, record.data.agentEnv);
  assert.doesNotMatch(JSON.stringify(record.data.inputs), /private connection|full-debug-credential/);
  await logging.close();
  const files = await readdir(join(directory, "logs/channels"));
  const records = (await Promise.all(files.filter((file) => /^channel-gateway-\d/.test(file)).map((file) =>
    readFile(join(directory, "logs/channels", file), "utf8")))).join("").trim().split("\n").map(JSON.parse);
  assert.equal(records.length, 1);
  assert.deepEqual(records[0].data, JSON.parse(JSON.stringify(record.data)));
  assert.equal(statuses.length, 0);
  for (const sink of [
    () => { throw new Error("sync log failure"); },
    async () => { throw new Error("async log failure"); },
    () => ({ then(_resolve, reject) { reject(new Error("thenable log failure")); } }),
    () => new Promise(() => {}),
  ]) {
    const faulty = new ImTask(client, { ...input, runId: randomUUID(), invocationId: randomUUID() }, "octobuddy", bot, {}, () => {}, undefined, invokeHooks(sink));
    assert.equal((await Array.fromAsync(faulty.events())).at(-1).type, "run.completed");
    // 让未处理拒绝有机会触发；node:test 会将其判为失败，不安装吞错监听器。
    await new Promise((resolve) => setImmediate(resolve));
  }
});

test("retry verification host releases both Engines after cleanup and startup failures", () => {
  const source = `
    import assert from 'node:assert/strict';
    import { registerHooks } from 'node:module';
    const events = [];
    let scenario, created;
    globalThis.retryHostFixture = {
      async codex() {
        const name = created++ === 0 ? 'fault' : 'normal';
        if (scenario === 'normal-startup' && name === 'normal') throw new Error('normal startup');
        return { adapter: { createExecutionScope() {} }, close() {
          events.push(name);
          if (scenario === 'multiple-close') throw new Error(name + ' close');
          return Promise.resolve({ complete: scenario !== 'incomplete' });
        } };
      },
      async kernel() {
        if (scenario === 'kernel-startup') throw new Error('kernel startup');
        return { client: {}, async close() {
          events.push('kernel');
          if (scenario === 'kernel-close' || scenario === 'multiple-close') throw new Error('kernel close');
          return { complete: true };
        } };
      },
    };
    registerHooks({ load(url, context, next) {
      if (url === ${JSON.stringify(new URL("../test-support/verification-kernel.mjs", import.meta.url).href)})
        return { format: 'module', shortCircuit: true, source:
          'export const createVerificationCodex = (...args) => globalThis.retryHostFixture.codex(...args); export const createVerificationKernel = (...args) => globalThis.retryHostFixture.kernel(...args);' };
      return next(url, context);
    } });
    const { createRetryKernel } = await import(${JSON.stringify(new URL("../test-support/im-retry-live-host.mjs", import.meta.url).href)});
    for (scenario of ['success', 'kernel-close', 'multiple-close', 'incomplete', 'normal-startup', 'kernel-startup']) {
      events.length = 0; created = 0;
      if (scenario.endsWith('startup')) {
        await assert.rejects(createRetryKernel({ faultUrl: 'http://fixture.invalid' }), /startup/);
        assert.deepEqual(events, scenario === 'normal-startup' ? ['fault'] : ['fault', 'normal']);
        continue;
      }
      const host = await createRetryKernel({ faultUrl: 'http://fixture.invalid' });
      const closing = host.close();
      assert.equal(host.close(), closing);
      if (scenario === 'success') await closing;
      else await assert.rejects(closing, error => {
        assert.equal(error.message, 'VERIFICATION_CLEANUP_FAILED');
        assert.equal(error.errors.length, scenario === 'multiple-close' ? 3 : scenario === 'incomplete' ? 2 : 1);
        return true;
      });
      assert.deepEqual(events, ['kernel', 'fault', 'normal']);
    }
    console.log('retry host cleanup scenarios passed');
  `;
  assert.match(execFileSync(process.execPath, ["--input-type=module", "-e", source], {
    encoding: "utf8", timeout: 10000,
  }), /retry host cleanup scenarios passed/);
});

test("manual verification host owns its Engine and exposes the public attached client", async () => {
  const directory = await mkdtemp(join(tmpdir(), "gateway-host-113-"));
  const codexHome = join(directory, "codex");
  await mkdir(codexHome);
  let kernel;
  try {
    kernel = await createVerificationKernel({ home: directory, endpoint: componentEndpoint(directory),
      codexOptions: { codexHome, command: process.execPath,
        appServerArgs: [fileURLToPath(new URL("../test-support/fake-codex-diagnostics.mjs", import.meta.url))] } });
    const input = draft(undefined, true);
    input.inputs = [{ type: "text", text: "DIAGNOSTIC_QA:normal" }];
    const task = new ImTask(kernel.client, input, "codex", bot, {}, () => {});
    assert.equal((await Array.fromAsync(task.events())).at(-1).type, "run.completed");
    const closing = kernel.close();
    assert.equal(closing, kernel.close());
    assert.equal((await closing).complete, true);
  } finally {
    await kernel?.close();
    await rm(directory, { recursive: true, force: true });
  }
});
