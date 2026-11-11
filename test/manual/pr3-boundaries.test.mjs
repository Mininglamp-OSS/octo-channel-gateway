// 显式专项，不扩大默认 CI glob；所有凭据仅运行时生成，系统服务使用 fake runner。
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import extension from "../../apps/cli/dist/commands.js";
import { WindowsUserTaskBackend } from "../../packages/cross-service/dist/windows-task.js";
import {
  ImRunProjector,
  FINAL_OUTPUT_LIMITS,
} from "../../packages/octo-channel-gateway-sdk/dist/presentation/run-projector.js";
import {
  getGroupMd,
  getThreadMd,
  getMentionPref,
} from "../../packages/octo-channel-gateway-sdk/dist/transport/api/rules.js";
import {
  fetchBotGroups,
  fetchUserInfo,
  searchSpaceMembers,
} from "../../packages/octo-channel-gateway-sdk/dist/transport/api/conversations.js";
import { getJson } from "../../packages/octo-channel-gateway-sdk/dist/transport/api/client.js";
import { GatewayTransport } from "../../packages/octo-channel-gateway-sdk/dist/transport/channel.js";
import { WukongConnection } from "../../packages/octo-channel-gateway-sdk/dist/transport/wukong.js";
import { OctoConnector } from "../../packages/octo-channel-gateway-sdk/dist/transport/connector.js";
import { ImRuntime } from "../../packages/octo-channel-gateway-sdk/dist/index.js";
import { kernelMock } from "../../test-support/kernel-mock.js";
import { waitFor } from "../runtime-fixture.js";

test("configure preserves endpoint-scoped identities and never inherits another endpoint's credential", async () => {
  const bot = (api_url) => ({
    bot_id: "same",
    api_url,
    bf_token: `bf_${randomUUID()}`,
    agent: { adapter_type: "codex" },
  });
  let config = {
    bots: [bot("https://one.example/api"), bot("https://two.example/api")],
  };
  const original = structuredClone(config);
  const command = extension.commands.find(
    (entry) => entry.name === "configure",
  );
  const context = {
    async readConfig() {
      return { config: structuredClone(config), revision: "1" };
    },
    async saveConfig(next) {
      config = next;
      return {
        name: "gateway",
        saved: true,
        file: "config",
        reload_required: true,
      };
    },
  };
  const configure = (options) =>
    command.run(context, {
      options: { bot_id: "same", ...options },
      arguments: [],
    });
  await configure({
    api_url: "https://ONE.example:443/api/",
    model: "new-model",
  });
  assert.equal(config.bots.length, 2);
  assert.equal(config.bots[0].bf_token, original.bots[0].bf_token);
  assert.equal(config.bots[0].agent.model, "new-model");
  assert.deepEqual(config.bots[1], original.bots[1]);
  const before = structuredClone(config);
  await assert.rejects(
    configure({ api_url: "https://three.example/api" }),
    /bf_token/,
  );
  assert.deepEqual(config, before);
  const fresh = `bf_${randomUUID()}`;
  await configure({
    api_url: "https://three.example/api",
    bf_token: fresh,
    adapter_type: "codex",
  });
  assert.equal(config.bots.length, 3);
  assert.deepEqual(config.bots.slice(0, 2), before.bots);
  assert.equal(config.bots[2].bf_token, fresh);
  assert.equal(config.bots[2].agent.model, undefined);
});

for (const mismatch of ["principal", "trigger", "unknown"]) {
  test(`Windows service mutations reject ${mismatch} identity before changing tasks`, async (t) => {
    const directory = await mkdtemp(join(tmpdir(), "gateway-task-"));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const mutations = [];
    const runner = {
      async run(command, args) {
        const query = /powershell/i.test(command);
        if (!query && args[0] !== "/Query") mutations.push(args);
        return {
          command,
          args,
          exitCode: 0,
          stderr: "",
          stdout: query
            ? JSON.stringify({
                state: "Running",
                enabled: true,
                principal_user_id: "DOMAIN\\owner",
                trigger_user_id: "DOMAIN\\owner",
                principal_user_matches:
                  mismatch === "unknown" ? null : mismatch !== "principal",
                trigger_user_matches:
                  mismatch === "unknown" ? null : mismatch !== "trigger",
                principal_logon_type: "InteractiveToken",
              })
            : "exists",
        };
      },
    };
    const backend = new WindowsUserTaskBackend({
      platform: "win32",
      runner,
      windowsUserId: "DOMAIN\\current",
      homeDirectory: "C:\\Users\\current",
      windowsDefinitionDirectory: directory,
      environment: {},
    });
    const spec = {
      id: "gateway",
      command: "C:\\node.exe",
      workingDirectory: "C:\\gateway",
      restart: { policy: "never" },
    };
    for (const operation of [
      "install",
      "uninstall",
      "enable",
      "disable",
      "start",
      "stop",
      "restart",
    ])
      await assert.rejects(backend[operation](spec), {
        code: "MANAGER_UNAVAILABLE",
      });
    assert.deepEqual(mutations, []);
  });
}

for (const logonType of ["InteractiveToken", "S4U"]) {
  test(`Windows permits repairing a current-user task with ${logonType} and ordinary definition drift`, async (t) => {
    const directory = await mkdtemp(join(tmpdir(), "gateway-owned-task-"));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const mutations = [];
    const backend = new WindowsUserTaskBackend({
      platform: "win32",
      windowsUserId: "DOMAIN\\current",
      homeDirectory: "C:\\Users\\current",
      windowsDefinitionDirectory: directory,
      environment: {},
      runner: {
        async run(command, args) {
          const query = /powershell/i.test(command);
          if (!query && args[0] !== "/Query") mutations.push(args);
          return {
            command,
            args,
            exitCode: 0,
            stderr: "",
            stdout: query
              ? JSON.stringify({
                  state: "Ready",
                  enabled: true,
                  execute: "C:\\old-node.exe",
                  working_directory: "C:\\old-directory",
                  principal_user_id: "DOMAIN\\current",
                  trigger_user_id: "DOMAIN\\current",
                  principal_user_matches: true,
                  trigger_user_matches: true,
                  principal_logon_type: logonType,
                })
              : "exists",
          };
        },
      },
    });
    const spec = {
      id: "gateway",
      command: "C:\\node.exe",
      workingDirectory: "C:\\gateway",
      restart: { policy: "never" },
    };
    await backend.install(spec);
    await backend.enable(spec);
    await backend.disable(spec);
    assert.deepEqual(
      mutations.map((args) => args[0]),
      ["/Create", "/Change", "/Change"],
    );
  });
}

test("final output has separate message and UTF-8 budgets and cannot recover as partial success", () => {
  const event = (type, payload) => ({ protocolVersion: 2, type, payload });
  const projector = new ImRunProjector("count");
  for (let n = 0; n < FINAL_OUTPUT_LIMITS.messages; n++)
    projector.accept(
      event("message.update", {
        messageId: String(n),
        channel: "final",
        text: "full",
      }),
    );
  assert.throws(
    () =>
      projector.accept(
        event("message.update", {
          messageId: "overflow",
          channel: "final",
          text: "[file](/private/file)",
        }),
      ),
    /IM_FINAL_OUTPUT_LIMIT_EXCEEDED/,
  );
  assert.equal(projector.finalText, "");
  assert.throws(
    () => projector.accept(event("run.completed", {})),
    /IM_FINAL_OUTPUT_LIMIT_EXCEEDED/,
  );
  assert.notEqual(projector.snapshot().terminal, "completed");
  const bytes = new ImRunProjector("bytes");
  bytes.accept(
    event("message.update", {
      messageId: "one",
      channel: "final",
      text: "a".repeat(FINAL_OUTPUT_LIMITS.bytes),
    }),
  );
  assert.throws(
    () =>
      bytes.accept(
        event("message.delta", {
          messageId: "one",
          channel: "final",
          text: "中",
        }),
      ),
    /IM_FINAL_OUTPUT_LIMIT_EXCEEDED/,
  );
  assert.equal(bytes.finalText, "");
});

test("all authenticated API families reject redirects before contacting the target", async (t) => {
  let targetHits = 0;
  const target = createServer((_req, res) => {
    targetHits++;
    res.end("{}");
  });
  await new Promise((resolve) => target.listen(0, "127.0.0.1", resolve));
  const server = createServer((_req, res) => {
    res.writeHead(302, {
      Location: `http://127.0.0.1:${target.address().port}/changed`,
    });
    res.end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => {
    server.closeAllConnections();
    target.closeAllConnections();
    return Promise.all([
      new Promise((r) => server.close(r)),
      new Promise((r) => target.close(r)),
    ]);
  });
  const params = {
    apiUrl: `http://127.0.0.1:${server.address().port}`,
    botToken: `bf_${randomUUID()}`,
    groupNo: "group",
    shortId: "thread",
    uid: "owner",
    keyword: "owner",
  };
  await assert.rejects(getGroupMd(params));
  await assert.rejects(getThreadMd(params));
  await assert.rejects(fetchBotGroups(params));
  await assert.rejects(searchSpaceMembers(params));
  assert.equal(await fetchUserInfo(params), null);
  assert.equal((await getMentionPref(params)).effective, false);
  await assert.rejects(getJson(params.apiUrl, params.botToken, "/test"));
  assert.equal(targetHits, 0);
});

test("runtime interrupts an overflowing final stream and sends only an unknown-result notice", async (t) => {
  let receive,
    finished = false;
  const interrupted = [],
    diagnostics = [],
    snapshots = [],
    replies = [],
    finals = [];
  t.mock.method(GatewayTransport.prototype, "start", async function () {
    receive = this.callbacks.onMessage;
  });
  t.mock.method(GatewayTransport.prototype, "close", async () => {});
  const runtime = new ImRuntime(
    {
      bot_id: "bot",
      api_url: "https://im.example",
      agent: { adapter_type: "codex" },
    },
    {
      kernel: kernelMock({
        async *invoke() {
          yield {
            protocolVersion: 2,
            type: "message.update",
            payload: {
              channel: "final",
              messageId: "answer",
              text: "[file](/private/partial.txt)",
            },
          };
          yield {
            protocolVersion: 2,
            type: "message.delta",
            payload: {
              channel: "final",
              messageId: "answer",
              text: "a".repeat(FINAL_OUTPUT_LIMITS.bytes),
            },
          };
          yield { protocolVersion: 2, type: "run.completed", payload: {} };
        },
        async interrupt(invocationId) {
          interrupted.push(invocationId);
          return { accepted: true };
        },
      }),
      onDiagnostic: (code) => diagnostics.push(code),
    },
  );
  t.after(() => runtime.close());
  await runtime.start();
  receive({
    messageId: "overflow",
    senderId: "owner",
    conversationId: "owner",
    conversationKind: "direct",
    text: "work",
    async buildContext() {
      return { schema: "octo.context-envelope/v3", items: [] };
    },
    async reply(text) {
      replies.push(text);
    },
    async replyFinal(text) {
      finals.push(text);
    },
    beginPresentation() {
      return {
        update(snapshot) {
          snapshots.push(snapshot);
        },
        async finish() {
          finished = true;
        },
      };
    },
  });
  await waitFor(() => finished && replies.length > 0);
  assert.equal(interrupted.length, 1);
  assert.ok(diagnostics.includes("IM_FINAL_OUTPUT_LIMIT_EXCEEDED"));
  assert.ok(diagnostics.includes("IM_EXECUTION_RESULT_UNKNOWN"));
  assert.equal(snapshots.at(-1).resultUnknown, true);
  assert.notEqual(snapshots.at(-1).terminal, "completed");
  assert.deepEqual(finals, []);
  assert.match(replies.at(-1), /结果未知/);
  assert.equal(
    replies.some((text) => text.includes("/private/partial.txt")),
    false,
  );
});

for (const lostAckId of [1, 2]) {
  test(
    `invalid elicitation is isolated and valid control is not replayed when event ${lostAckId} ACK fails`,
    { timeout: 15000 },
    async (t) => {
      let receive, ready;
      const prepared = new Promise((resolve) => {
        ready = resolve;
      });
      const responses = [],
        acked = [],
        diagnostics = [];
      let firstAck = true;
      const event = (id, answer) => ({
        event_id: id,
        event_type: "card_action",
        event_data: {
          message_id: "interaction-card",
          channel_id: "owner",
          channel_type: 1,
          operator_uid: "owner",
          space_id: "space",
          action_id: "interaction_answered",
          inputs: { answer },
        },
      });
      t.mock.method(globalThis, "fetch", async (url, options) => {
        url = String(url);
        if (url.endsWith("/auth/verify-bot"))
          return Response.json({ bot_uid: "bot", space_id: "space" });
        if (url.endsWith("/bot/register"))
          return Response.json({
            robot_id: "bot",
            im_token: randomUUID(),
            ws_url: "wss://socket.example",
          });
        if (url.endsWith("/bot/events")) {
          await prepared;
          const cursor = JSON.parse(options.body).event_id;
          if (cursor < 2)
            return Response.json({
              results: [
                event(1, "invalid JSON"),
                event(2, '{"ok":true}'),
              ].filter((entry) => entry.event_id > cursor),
            });
          await new Promise((resolve) => {
            if (options.signal.aborted) resolve();
            else
              options.signal.addEventListener("abort", resolve, { once: true });
          });
          options.signal.throwIfAborted();
        }
        if (url.endsWith("/ack")) {
          const id = Number(url.split("/").at(-2));
          if (firstAck && id === lostAckId) {
            firstAck = false;
            return new Response("{}", { status: 500 });
          }
          acked.push(id);
          return Response.json({});
        }
        throw new Error("unexpected API path");
      });
      t.mock.method(WukongConnection.prototype, "connect", async function () {
        receive = this.onMessage;
      });
      t.mock.getter(WukongConnection.prototype, "connected", () => true);
      t.mock.method(WukongConnection.prototype, "close", async () => {});
      t.mock.method(
        OctoConnector.prototype,
        "interactionCard",
        async () => "interaction-card",
      );
      const transport = new GatewayTransport(
        {
          bot_id: "bot",
          api_url: "https://im.example",
          typing: false,
          agent: { adapter_type: "codex" },
        },
        async () => `bf_${randomUUID()}`,
        {
          onDiagnostic: (code) => diagnostics.push(code),
          onMessage(message) {
            receive = message;
          },
        },
      );
      t.after(() => transport.close());
      await transport.start(new AbortController().signal);
      receive({
        messageId: "incoming",
        messageSeq: 1,
        fromUid: "owner",
        channelId: "owner",
        channelType: 1,
        timestamp: Date.now(),
        payload: { type: 1, content: "work" },
      });
      const message = receive;
      const presentation = message.beginPresentation("run", () => {}, {
        async respond(value) {
          responses.push(value);
        },
        async cancel() {},
        retry() {},
      });
      await presentation.interaction({
        interactionId: "ask",
        executionInstanceId: "invocation",
        kind: "elicitation",
        expiresAt: new Date(Date.now() + 60000).toISOString(),
        request: { message: "JSON", requestedSchema: { type: "object" } },
      });
      ready();
      await waitFor(() => acked.includes(2), 10000);
      assert.deepEqual(acked, [1, 2]);
      assert.equal(responses.length, 1);
      assert.deepEqual(responses[0].value, { ok: true });
      assert.equal(
        diagnostics.filter((code) => code === "IM_INTERACTION_INPUT_INVALID")
          .length,
        1,
      );
    },
  );
}
