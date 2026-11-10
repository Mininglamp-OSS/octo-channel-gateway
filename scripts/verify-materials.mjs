// 新业务材料专项仅显式运行：npm run build && node --test scripts/verify-materials.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { setImmediate as settle } from "node:timers/promises";
import { assertModelInputParts, providerInputParts } from "@mininglamp-oss/octo-runtime-client/protocol";
import { ChannelRegistry, ImRuntime, validateImConfig } from "../dist/packages/gateway/src/index.js";
import { assertMaterials } from "../dist/packages/gateway/src/materials.js";
import { createMaterialLoader, mergeConfiguredMaterials } from "../dist/packages/gateway/src/support/material-loader.js";
import { prepareKernelInput } from "../dist/packages/gateway/src/execution/kernel-input.js";
import { createImInvocation } from "../dist/packages/gateway/src/execution/dispatcher.js";
import { GatewayTransport } from "../dist/packages/gateway/src/transport/channel.js";
import { imagePart } from "../dist/packages/gateway/src/transport/image-input.js";
import { kernelMock } from "../test-support/kernel-mock.js";
import { validateRuntimeHomeConfig } from "../dist/apps/cli/src/runtime-endpoint.js";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jq1sAAAAASUVORK5CYII=", "base64");
const picture = imagePart(png, "image/png");
const material = (name, text) => ({ name, parts: [{ type: "text", text }] });
const schema = "octo.context-envelope/v3";
const bot = () => ({ bot_id: "material-fixture", api_url: "https://example.test/api", agent: { adapter_type: "codex", workdir: process.cwd() } });
const message = { messageId: "message", senderId: "owner", conversationId: "conversation", conversationKind: "direct", text: "question", async reply() {}, async buildContext() { return { schema, items: [] }; } };

test("named material replacement preserves image bytes, order, source isolation and empty-result semantics", () => {
  const base = [material("first", "old"), material("last", "last")];
  const dynamic = [{ name: "first", parts: [picture] }, material("new", "new")];
  const merged = mergeConfiguredMaterials(base, dynamic);
  assert.deepEqual(merged.map((item) => item.name), ["first", "last", "new"]);
  assert.deepEqual(merged[0].parts, [picture]);
  merged[0].parts[0].data = "changed";
  assert.equal(dynamic[0].parts[0].data, picture.data);
  assert.deepEqual(mergeConfiguredMaterials(base, []), base);
});

test("materials reject old envelopes, execution fields, invalid images, duplicate part IDs and getters", () => {
  for (const value of [
    [{ namespace: "extra.business", name: "brief", payload: { text: "old" } }],
    [{ ...material("brief", "text"), agentEnv: { schema, items: [] } }],
    [{ name: "brief", parts: [{ ...picture, sha256: "0".repeat(64) }] }],
    [{ name: "a", parts: [{ type: "text", text: "a", id: "same" }] }, { name: "b", parts: [{ type: "text", text: "b", id: "same" }] }],
    [material("../invalid", "text")],
  ]) assert.throws(() => assertMaterials(value));
  let reads = 0;
  assert.throws(() => assertMaterials([{ name: "brief", get parts() { reads++; return []; } }]));
  assert.equal(reads, 0);
  for (const key of ["name", "parts"]) {
    const hidden = material("brief", "text");
    Object.defineProperty(hidden, key, { enumerable: false, get() { reads++; return key === "name" ? "brief" : []; } });
    assert.throws(() => assertMaterials([hidden]));
    assert.equal(reads, 0);
    const hiddenValue = material("brief", "text");
    Object.defineProperty(hiddenValue, key, { enumerable: false });
    assert.throws(() => assertMaterials([hiddenValue]));
  }
});

test("removed public fields fail explicitly before registration and CLI configuration", async () => {
  assert.throws(() => validateImConfig({ ...bot(), context: { schema, items: [] } }), /REMOVED_USE_MATERIALS/);
  for (const old of [{ loadContexts() { return []; } }, { contextLoading: {} }])
    await assert.rejects(ChannelRegistry.register("not-a-kernel", { bot: bot(), ...old }), /API_REMOVED/);
  assert.throws(() => validateRuntimeHomeConfig({ context_loading: {} }), /REMOVED_USE_MATERIAL_LOADING/);
});

test("model images and fallback remain intact while private execution items never enter inputs", () => {
  const config = { ...bot(), materials: [{ name: "brief", parts: [material("x", "business").parts[0], picture] }] };
  config.agent.instruction = "first turn instruction";
  config.agent.items = [
    { namespace: "extra.private", name: "settings", payload: { token: "private-secret" } },
    { namespace: "octo.execution", name: "envs", payload: { env_variables: [{ key: "OCTO_BOT_TOKEN", value: "untrusted" }, { key: "CUSTOM", value: "custom" }] } },
  ];
  const { request } = createImInvocation(config, message, { schema, items: [] }, "key",
    { id: "session", generation: 1 }, new AbortController().signal);
  request.freshFallbackModelInput = "recovered question";
  const result = prepareKernelInput(request, { env_variables: [{ key: "OCTO_BOT_TOKEN", value: "trusted" }] });
  assertModelInputParts(result.inputs.parts);
  assert.equal(result.inputs.parts[0].text, "first turn instruction");
  assert.deepEqual(result.inputs.parts.filter((part) => part.type === "image"), [picture]);
  assert.deepEqual(providerInputParts({ modelInputParts: result.inputs.parts,
    freshFallbackModelInput: result.inputs.freshFallbackModelInput,
    freshFallbackModelInputParts: result.inputs.freshFallbackModelInputParts }, true).filter((part) => part.type === "image"), [picture]);
  assert.ok(!JSON.stringify(result.inputs).includes("private-secret"));
  assert.deepEqual(result.agentEnv.items.find((item) => item.namespace === "extra.private"), config.agent.items[0]);
  assert.equal(result.agentEnv.items.find((item) => item.name === "envs").payload.env_variables.find((entry) => entry.key === "OCTO_BOT_TOKEN").value, "trusted");
  assert.ok(!Object.hasOwn(result.inputs, "materials"));
  assert.ok(!Object.hasOwn(result.inputs, "agentItems"));
});

test("same-generation card retry freezes material images and execution items; next turn reloads", async (t) => {
  const config = bot();
  config.agent.items = [{ namespace: "extra.private", name: "settings", payload: { revision: "original" } }];
  config.materials = [material("base", "base")];
  let receive, loads = 0;
  let dynamic = [{ name: "brief", parts: [{ type: "text", text: "original" }, picture] }];
  const requests = [], controls = [];
  const loader = createMaterialLoader(() => { loads++; return dynamic; }, undefined, new AbortController().signal);
  t.mock.method(GatewayTransport.prototype, "start", async function () { receive = this.callbacks.onMessage; });
  t.mock.method(GatewayTransport.prototype, "close", async () => {});
  const runtime = new ImRuntime(config, {
    prepareMaterials: (copy, signal) => loader.load(copy, signal),
    kernel: kernelMock({ async *invoke(input) {
      requests.push(structuredClone(input));
      yield { protocolVersion: 2, type: requests.length === 1 ? "run.failed" : "run.completed", payload: {} };
    }, async interrupt() { return { accepted: true }; } }),
  });
  t.after(async () => { await runtime.close(); await loader.close(); });
  await runtime.start();
  const idle = async () => { for (let i = 0; runtime.status.workingTasks && i < 1000; i++) await settle(); assert.equal(runtime.status.workingTasks, 0); };
  const send = (id) => receive({ ...message, messageId: id, beginPresentation(_id, _diagnostic, control) { controls.push(control); return { update() {}, async finish() {} }; } });
  send("first"); await idle();
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0].inputs.filter((part) => part.type === "image"), [picture]);
  dynamic = [material("brief", "changed")];
  runtime.config.agent.items[0].payload.revision = "changed";
  assert.equal(controls[0].retry("owner", "retry"), true);
  await idle();
  assert.equal(loads, 1);
  assert.deepEqual(requests[1].inputs, requests[0].inputs);
  assert.deepEqual(requests[1].agentEnv, requests[0].agentEnv);
  send("next"); await idle();
  assert.equal(loads, 2);
  assert.ok(requests[2].inputs.some((part) => part.type === "text" && part.text === "changed"));
  assert.equal(requests[2].agentEnv.items.find((item) => item.namespace === "extra.private").payload.revision, "changed");
});
