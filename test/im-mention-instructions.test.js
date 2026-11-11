import { modelItems } from "../test-support/kernel-mock.js";
import { gatewayWire } from "../test-support/kernel-mock.js";
import { kernelMock } from "../test-support/kernel-mock.js";
import assert from "node:assert/strict";
import test from "node:test";
import { createImInvocation } from "../packages/octo-channel-gateway-sdk/dist/execution/dispatcher.js";
import { ImRuntime } from "../packages/octo-channel-gateway-sdk/dist/index.js";
import { GatewayTransport } from "../packages/octo-channel-gateway-sdk/dist/transport/channel.js";
import { buildImContexts } from "../packages/octo-channel-gateway-sdk/dist/transport/im-context/index.js";
import { MENTION_GUIDANCE } from "../packages/octo-channel-gateway-sdk/dist/transport/mentions.js";
import { waitFor } from "./runtime-fixture.js";

const schema = "octo.context-envelope/v3";
const config = {
  bot_id: "bot",
  api_url: "https://im-test.deepminer.com.cn/api",
  spaceId: "space",
  agent: { adapter_type: "codex", workdir: process.cwd() },
};
const control = (...texts) => ({
  namespace: "extra.persona",
  name: "instructions",
  payload: { entries: texts.map((text) => ({ text })) },
});
const signal = new AbortController().signal;
const invoke = (context, providerSession) =>
  createImInvocation(
    config,
    {
      messageId: "m",
      senderId: "owner",
      conversationId: "group",
      text: "task",
    },
    context,
    "scope",
    {
      id: "session",
      generation: 1,
      ...(providerSession ? { providerSession } : {}),
    },
    signal,
  ).request;

test("Gateway supplies English stable instructions on fresh sessions, including empty host entries", () => {
  for (const items of [[], [control()]]) {
    const request = invoke({ schema, items });
    assert.equal(
      modelItems(gatewayWire(request)).find((item) => item.name === "mention-guidance").payload.text,
      MENTION_GUIDANCE,
    );
    assert.equal(
      request.contexts.items.filter((item) => item.name === "mention-guidance")
        .length,
      1,
    );
  }
  assert.match(MENTION_GUIDANCE, /^\[OCTO_CHANNEL_MENTION_RULES_V1\]\n/);
  assert.match(MENTION_GUIDANCE, /preserve this entire block verbatim/);
  assert.match(MENTION_GUIDANCE, /task handoff to a bot/);
  assert.match(MENTION_GUIDANCE, /\n\[\/OCTO_CHANNEL_MENTION_RULES_V1\]$/);
  assert.match(MENTION_GUIDANCE, /^[\x00-\x7f]+$/);
});

test("Gateway appends defaults after effective host entries without deduplication or caller mutation", () => {
  const context = {
    schema,
    items: [
      { namespace: "extra.business", name: "first", payload: { text: "keep" } },
      control("persona", "persona", "  keep\nwhitespace  "),
      { namespace: "extra.business", name: "last", payload: {} },
    ],
  };
  const original = structuredClone(context);
  const resumed = { sessionId: "existing-provider", resumable: true };
  for (const providerSession of [undefined, resumed]) {
    const request = invoke(context, providerSession);
    const instructions = request.contexts.items.find(
      (item) => item.namespace === "extra.persona",
    );
    assert.deepEqual(instructions.payload.entries, [
      ...original.items[1].payload.entries,
    ]);
    assert.equal(
      modelItems(gatewayWire(request)).filter((item) => item.name === "mention-guidance").length,
      providerSession ? 0 : 1,
    );
    assert.equal(
      request.providerSession?.sessionId,
      providerSession?.sessionId,
    );
    const business = request.contexts.items.filter(
      (item) => item.namespace === "extra.business",
    );
    assert.deepEqual(business, [original.items[0], original.items[2]]);
    instructions.payload.entries[1].text = "changed snapshot";
  }
  assert.deepEqual(context, original);
});

test("required instructions and explicit host material are never silently dropped to fit the budget", () => {
  assert.throws(
    () => invoke({ schema, items: [control("x".repeat(64000))] }),
    /CONTEXT_BUDGET_EXCEEDED/,
  );
  assert.throws(
    () =>
      invoke({
        schema,
        items: Array.from({ length: 32 }, (_, i) => ({
          namespace: "extra.business",
          name: `item-${i}`,
          payload: {},
        })),
      }),
    /CONTEXT_BUDGET_EXCEEDED/,
  );
});

test("an existing provider session receives compact current trigger facts separately from rules", async (t) => {
  t.mock.method(globalThis, "fetch", async (url) => {
    assert.ok(
      !url.endsWith("/messages/sync"),
      "continuation must not fetch bootstrap history",
    );
    return Response.json({}, { status: 404 });
  });
  const items = await buildImContexts(
    config,
    {
      channelId: "group____topic",
      channelType: 5,
      messageId: "m",
      fromUid: "current-user",
    },
    "bf_fixture",
    signal,
    { initialSession: false },
  );
  assert.equal(
    items.some((item) => item.name === "mention-instructions"),
    false,
  );
  const reminder = items.find((item) => item.name === "message-trigger");
  assert.equal(reminder.payload.guidance.split("\n").length, 1);
  assert.equal(reminder.payload.sender.uid, "current-user");
  assert.equal(reminder.payload.conversation.id, "group____topic");
  assert.equal(reminder.payload.conversation.type, "group_topic");
});

test("application omits stable instructions on ordinary resumed turns and refreshes after reset", async (t) => {
  let receive;
  const optionsSeen = [],
    requests = [];
  t.mock.method(GatewayTransport.prototype, "start", async function () {
    receive = (message) => this.callbacks.onMessage(message);
  });
  t.mock.method(GatewayTransport.prototype, "close", async () => {});
  const runtime = new ImRuntime(config, {
    kernel: kernelMock({
      async *invoke(input) {
        requests.push(input);
        yield {
          protocolVersion: 2,
          type: "session.update",
          payload: {
            providerSession: { sessionId: "provider", resumable: true },
          },
        };
        yield { protocolVersion: 2, type: "run.completed", payload: {} };
      },
      async interrupt() {
        return { accepted: false };
      },
      async respondInteraction() {},
    }),
  });
  await runtime.start();
  t.after(() => runtime.close());
  const send = (text, id) =>
    receive({
      messageId: id,
      senderId: "owner",
      conversationId: "owner",
      conversationKind: "direct",
      text,
      async buildContext(_signal, options) {
        optionsSeen.push(options);
        return { schema, items: [control("host persona")] };
      },
      async reply() {},
    });
  for (let i = 0; i < 2; i++) {
    send("task", `turn-${i}`);
    await waitFor(
      () => requests.length === i + 1 && runtime.status.sessions.length === 0,
    );
  }
  assert.equal(optionsSeen[1].initialSession, false);
  assert.equal(requests[1].providerSession.sessionId, "provider");
  send("/reset", "reset");
  send("task", "after-reset");
  await waitFor(
    () => requests.length === 3 && runtime.status.sessions.length === 0,
  );
  assert.equal(optionsSeen[2].initialSession, true);
  assert.equal(requests[2].providerSession, undefined);
  for (const index of [0, 2])
    assert.equal(
      modelItems(requests[index]).find((item) => item.name === "mention-guidance").payload.text,
      MENTION_GUIDANCE,
    );
  assert.equal(
    modelItems(requests[1]).some((item) => item.name === "mention-guidance"),
    false,
  );
  assert.equal(
    modelItems(requests[1]).some(
      (item) => item.name === "artifact-delivery",
    ),
    false,
  );
});
