import test from "node:test";
import assert from "node:assert/strict";
import { prepareKernelInput } from "../dist/packages/gateway/src/execution/kernel-input.js";
import { sanitizePublicValue } from "../dist/packages/gateway/src/support/public-display.js";
const request = () => ({
  inputs: [{ type: "text", text: "current question" }],
  freshFallbackModelInputParts: [{ type: "text", text: "explicit recovery history" }],
  freshFallbackModelInput: "explicit recovery history",
  contexts: { schema: "octo.context-envelope/v3", items: [
    { namespace: "octo.execution", name: "adapter", payload: { type: "codex" } },
    { namespace: "extra.im", name: "history", payload: { text: "application history" } },
    { namespace: "octo.execution", name: "envs", payload: { env_variables: [
      { key: "OCTO_BOT_TOKEN", value: "old" }, { key: "octo_bot_token", value: "alias" }
    ] } }
  ] },
  agentSource: "provisioned", approvalMode: "ask", sessionId: "business", runId: "run", invocationId: "invocation", protocol_mode: "canonical",
});
test("Gateway compiles history exactly once for primary/recovery and keeps agentEnv out of model text", () => {
  const input = request(), before = structuredClone(input);
  const { inputs, agentEnv } = prepareKernelInput(input, { env_variables: [{ key: "OCTO_BOT_TOKEN", value: "trusted-secret" }] });
  for (const parts of [inputs.parts, inputs.freshFallbackModelInputParts]) {
    const text = parts.map((p) => p.text).join("\n");
    assert.equal(text.split("application history").length - 1, 1);
    assert.doesNotMatch(text, /trusted-secret|OCTO_BOT_TOKEN|octo_bot_token/);
  }
  assert.equal(inputs.parts.at(-1).text, "current question");
  assert.equal(inputs.freshFallbackModelInputParts.at(-1).text, "explicit recovery history");
  assert.equal(inputs.prompt, "current question");
  assert.ok(agentEnv.items.every((item) => !item.namespace.startsWith("extra.")));
  assert.equal("contexts" in inputs, false);
  assert.deepEqual(input, before);
  assert.equal(sanitizePublicValue({ agentEnv }).agentEnv, "[REDACTED]");
});
test("Windows credential merge removes case aliases before appending trusted values", (t) => {
  const original = Object.getOwnPropertyDescriptor(process, "platform");
  Object.defineProperty(process, "platform", { value: "win32", configurable: true });
  t.after(() => Object.defineProperty(process, "platform", original));
  const input = request(), before = structuredClone(input);
  const { agentEnv } = prepareKernelInput(input, { env_variables: [{ key: "OCTO_BOT_TOKEN", value: "current" }] });
  assert.deepEqual(agentEnv.items.find((item) => item.name === "envs").payload.env_variables, [{ key: "OCTO_BOT_TOKEN", value: "current" }]);
  assert.deepEqual(input, before);
});
