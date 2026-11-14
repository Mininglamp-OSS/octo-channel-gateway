// 显式本地专项，不匹配默认测试/CI glob。可用 OCTO_VERIFY_RUNTIME_ROOT 指定已构建的 Runtime main。
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { attachKernel } from "@mininglamp-oss/octo-runtime-client";
import { ImRunProjector } from "../packages/octo-channel-gateway-sdk/dist/presentation/run-projector.js";
import { buildReasoningFrame } from "../packages/octo-channel-gateway-sdk/dist/transport/reasoning-frame.js";
import { GatewayTransport } from "../packages/octo-channel-gateway-sdk/dist/transport/channel.js";
import { ImRuntime } from "../packages/octo-channel-gateway-sdk/dist/index.js";
import { CardSession } from "../packages/octo-channel-gateway-sdk/dist/transport/card-session.js";
import { ImDeliveryDispatcher } from "../packages/octo-channel-gateway-sdk/dist/delivery/dispatcher.js";
import { ImTask } from "../packages/octo-channel-gateway-sdk/dist/execution/task.js";
import { createImInvocation } from "../packages/octo-channel-gateway-sdk/dist/execution/dispatcher.js";
import { kernelMock } from "../test-support/kernel-mock.js";
import { runtimeModule } from "../test-support/runtime-module.mjs";

const event = (type, payload = {}) => ({ protocolVersion: 2, type, payload });
const idle = (silenceMs) => event("run.notice", {
  noticeId: `idle-${silenceMs}`, code: "model_output_idle", severity: "info",
  params: { silenceMs, message: `${Math.floor(silenceMs / 1000)}s no LLM output` },
});
const template = { ref: { id: "ai.reasoning-process", version: "0.4.0" }, maxPayloadBytes: 16384 };
const bot = { bot_id: "idle-fixture", api_url: "https://example.invalid/api", agent: { adapter_type: "codex", workdir: process.cwd() }, codex_retry: { enabled: false } };

test("ordinary CardSession creates once, edits each source duration and fences late frames", async () => {
  const delivered = [];
  const connector = { config: bot, reasoningTemplate: async () => template,
    async card(_address, _template, frame, _effect, messageId, seq) {
      delivered.push({ frame, messageId, seq });
      return "card-message";
    },
  };
  const delivery = new ImDeliveryDispatcher(new AbortController().signal);
  const card = new CardSession(connector, delivery, { channelId: "peer", channelType: 1 }, "card-run", () => {}, () => assert.fail());
  const p = new ImRunProjector("card-run");
  p.accept(event("run.started"));
  try {
    for (const ms of [60000, 120000, 180000]) {
      p.accept(idle(ms));
      card.update(p.snapshot());
      await card.finish();
    }
    assert.deepEqual(delivered.map(item => item.messageId), [undefined, "card-message", "card-message"]);
    assert.deepEqual(delivered.map(item => item.seq), [1, 2, 3]);
    assert.deepEqual(delivered.map(item => item.frame.progressText.match(/模型已 \d+ 秒无输出/)[0]), ["模型已 60 秒无输出", "模型已 120 秒无输出", "模型已 180 秒无输出"]);
    p.accept(event("run.completed"));
    card.update(p.snapshot());
    await card.finish();
    card.update({ ...p.snapshot(), terminal: undefined, label: "模型已 240 秒无输出" });
    await card.finish();
    assert.equal(delivered.length, 4);
    assert.equal(delivered.at(-1).frame.progressText, undefined);
  } finally { card.release(); }
});

test("source durations replace the existing label without extrapolation; terminal seals it", () => {
  const p = new ImRunProjector("run");
  p.accept(event("run.started"), 0);
  for (const ms of [60000, 120000, 180000, 65432, 60000]) {
    p.accept(idle(ms), ms + 900000);
    const label = `模型已 ${Math.floor(ms / 1000)} 秒无输出`;
    assert.equal(p.snapshot(ms + 3600000).label, label);
    assert.ok(JSON.stringify(buildReasoningFrame(p.snapshot(), template)).includes(label));
    assert.equal(p.snapshot().terminal, undefined);
  }
  p.accept(event("run.completed"));
  p.accept(idle(240000));
  assert.equal(p.snapshot().label, undefined);
  assert.equal(p.snapshot().terminal, "completed");
});

test("only new public text clears silence; repeated, smaller, private and status-only frames do not", () => {
  for (const channel of ["final", "commentary", "analysis"]) {
    const p = new ImRunProjector(channel);
    const payload = { messageId: "m", channel, role: "assistant", text: "hello", ...(channel === "analysis" ? { exposure: "public_summary" } : {}) };
    p.accept(event("message.update", payload));
    p.accept(idle(60000));
    for (const frame of [
      event("message.update", payload),
      event("message.update", { ...payload, text: "he" }),
      event("message.update", { ...payload, text: "hello" }),
      event("message.update", { messageId: "m", channel, status: "completed" }),
      event("message.delta", { messageId: "m", channel, text: "   " }),
      event("usage.update"),
      event("message.delta", { messageId: "private", channel: "analysis", exposure: "private_reasoning", text: "hidden" }),
    ]) {
      p.accept(frame);
      assert.equal(p.snapshot().label, "模型已 60 秒无输出", JSON.stringify(frame));
    }
    p.accept(event("message.delta", { ...payload, text: " more" }));
    assert.equal(p.snapshot().label, undefined);
    p.accept(idle(120000));
    p.accept(event("message.update", { ...payload, text: "hello more and more" }));
    assert.equal(p.snapshot().label, undefined);
  }
});

test("tools and approval follow normal phases; source cancellation and failures stay truthful", () => {
  const p = new ImRunProjector("phases");
  p.accept(idle(60000));
  p.accept(event("tool_call.create", { id: "tool", name: "exec", args: {} }));
  assert.equal(p.snapshot().phase, "tool");
  assert.equal(p.snapshot().label, undefined);
  p.accept(event("interaction.requested", { interactionId: "approval" }));
  assert.equal(p.snapshot().phase, "waiting");
  assert.equal(p.snapshot().label, "等待你的确认或输入");
  p.accept(event("interaction.resolved", { interactionId: "approval" }));
  assert.equal(p.snapshot().label, undefined);
  p.accept(event("run.cancelled"));
  assert.equal(p.snapshot().terminal, "cancelled");
  assert.doesNotMatch(JSON.stringify(buildReasoningFrame(p.snapshot(), template)), /静默超时|300 秒/);
});

test("Gateway has only its total task timer, never cancels a quiet stream at 300 seconds", async () => {
  let now = 0;
  const timers = new Map(), cancellations = [], observed = [];
  const time = { now: () => now, random: () => 0, wait: async () => {}, schedule(fn, ms) { const key = {}; timers.set(key, { fn, at: now + ms }); return () => timers.delete(key); } };
  const request = createImInvocation(bot, { messageId: "m", senderId: "u", conversationId: "chat", text: "work" }, { schema: "octo.context-envelope/v3", items: [] }, "key", { id: "session", generation: 1 }, new AbortController().signal).request;
  const kernel = kernelMock({
    async *invoke() {
      yield event("run.started");
      assert.equal(timers.size, 1);
      assert.equal([...timers.values()][0].at, 86400000);
      for (const ms of [60000, 120000, 180000, 300000, 900000]) {
        now = ms;
        yield idle(ms);
        assert.deepEqual(cancellations, []);
        assert.equal(timers.size, 1);
      }
      yield event("run.completed");
    },
    async interrupt(id) { cancellations.push(id); return { accepted: true }; },
  });
  const task = new ImTask(kernel, request, "codex", bot, {}, () => {}, time);
  for await (const frame of task.events()) observed.push(frame);
  assert.equal(observed.at(-1).type, "run.completed");
  assert.deepEqual(cancellations, []);
  assert.equal(timers.size, 0);
});

test("Runtime defaults to enforce and its configurable idle budget aborts execution", async () => {
  const { InvocationWatchdog, normalizeRuntimeLimits } = await runtimeModule("executor-core", "watchdog.js");
  const defaults = normalizeRuntimeLimits();
  assert.equal(defaults.modelIdlePolicy, "enforce");
  assert.equal(defaults.modelIdleTimeoutMs, 300000);
  assert.equal(defaults.firstFrameTimeoutMs, 60000);
  let now = 0;
  const timers = new Map();
  const controller = new AbortController();
  const watchdog = new InvocationWatchdog({ modelIdleTimeoutMs: 1000, modelIdleWarningMs: 500 }, controller, () => {}, {
    now: () => now,
    schedule(callback, ms) { const key = {}; timers.set(key, { callback, at: now + ms }); return () => timers.delete(key); },
  });
  watchdog.canonical(event("model_step.started", { stepId: "step" }));
  while (!controller.signal.aborted) {
    const [key, next] = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
    now = next.at;
    timers.delete(key);
    next.callback();
  }
  assert.equal(now, 1000);
  watchdog.finish();
  assert.equal(timers.size, 0);
});

test("latest Runtime periodic facts cross IPC and refresh one Gateway card", { skip: !process.env.OCTO_VERIFY_RUNTIME_ROOT, timeout: 10000 }, async (t) => {
  const root = process.env.OCTO_VERIFY_RUNTIME_ROOT;
  const load = (path) => import(pathToFileURL(join(root, path)).href);
  const { createKernelService } = await load("packages/octo-runtime-executor-kernel/dist/index.js");
  const { defineAdapter } = await load("packages/octo-runtime-adapter-sdk/dist/index.js");
  const { ModelOutputSilence } = await load("packages/octo-runtime-executor-core/dist/model-output-silence.js");
  const directory = await mkdtemp(join(tmpdir(), "ort93-idle-"));
  let release, receive, elapsed = 0, generated = 0, invocations = 0;
  const gate = new Promise(resolve => { release = resolve; });
  const listen = ModelOutputSilence.prototype.listen;
  // 只加速源端单调时钟；notice 生成、Core 事件、IPC、client 与 Gateway 都运行真实实现。
  t.mock.method(ModelOutputSilence.prototype, "listen", function (wake) {
    this.time = {
      now: () => elapsed,
      schedule(callback, ms) {
        if (generated >= 3) return () => {};
        const timer = setTimeout(() => { elapsed += ms; generated++; callback(); }, 5);
        return () => clearTimeout(timer);
      },
    };
    return listen.call(this, wake);
  });
  const adapter = defineAdapter({ metadata: { type: "codex", workspace: false }, async *invoke(request) {
    invocations++;
    yield event("run.started");
    yield event("model_step.started", { stepId: "step" });
    yield event("message.delta", { messageId: "answer", channel: "final", text: "started" });
    if (invocations === 1) await gate;
    else await new Promise(resolve => {
      if (request.signal.aborted) resolve();
      else request.signal.addEventListener("abort", resolve, { once: true });
    });
    yield event("message.delta", { messageId: "answer", channel: "final", text: " finished" });
    yield event("run.completed");
  } });
  const endpoint = join(directory, "kernel.sock");
  const service = createKernelService({ home: directory, endpoint, adapters: [adapter] });
  const client = attachKernel({ endpoint });
  let runtime;
  t.after(async () => {
    release();
    try { await runtime?.close(); } finally {
      client.close();
      try { await service.close(); } finally { await rm(directory, { recursive: true, force: true }); }
    }
  });
  await service.initialize();
  t.mock.method(GatewayTransport.prototype, "start", async function () { receive = message => this.callbacks.onMessage(message); });
  t.mock.method(GatewayTransport.prototype, "close", async () => {});
  runtime = new ImRuntime(bot, { kernel: client });
  await runtime.start();
  const labels = [], replies = [], cards = [];
  let resolveDone;
  const done = new Promise(resolve => { resolveDone = resolve; });
  receive({ messageId: "m", senderId: "owner", conversationId: "chat", conversationKind: "direct", text: "work",
    async buildContext() { return { schema: "octo.context-envelope/v3", items: [] }; },
    async reply(text) { replies.push(text); resolveDone(); },
    beginPresentation(runId) {
      cards.push(runId);
      return { update(snapshot) {
        if (snapshot.label?.startsWith("模型已")) {
          if (labels.at(-1) !== snapshot.label) labels.push(snapshot.label);
          if (snapshot.label === "模型已 180 秒无输出") release();
        }
      }, async finish() {} };
    },
  });
  await done;
  assert.deepEqual(labels, ["模型已 60 秒无输出", "模型已 120 秒无输出", "模型已 180 秒无输出"]);
  assert.equal(cards.length, 1);
  assert.deepEqual(replies, ["started finished"]);
  assert.equal(generated, 3);
  const timedBot = { ...bot, agent: { ...bot.agent, items: [{ namespace: "octo.execution", name: "limits", payload: { model_idle_timeout_ms: 1000, model_idle_warning_ms: 500, first_frame_timeout_ms: 1000 } }] } };
  const request = createImInvocation(timedBot, { messageId: "timeout", senderId: "u", conversationId: "chat2", text: "timeout" }, { schema: "octo.context-envelope/v3", items: [] }, "key2", { id: "session2", generation: 1 }, new AbortController().signal).request;
  const task = new ImTask(client, request, "codex", timedBot, {}, () => {});
  const terminal = [];
  for await (const frame of task.events()) terminal.push(frame);
  assert.equal(terminal.at(-1).type, "run.failed");
  assert.equal(task.stopReason, undefined, "Runtime, not Gateway's task clock, owns the idle timeout");
  assert.equal(invocations, 2, JSON.stringify(terminal.at(-1)));
  assert.match(JSON.stringify(terminal.at(-1)), /idle|空闲|timeout/i);
});
