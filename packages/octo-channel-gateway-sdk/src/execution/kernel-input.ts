import type {
  AgentEnv,
  ContextEnvsPayload,
  InvocationContent,
} from "@mininglamp-oss/octo-runtime-client/protocol";
import { assertModelInputParts, mergeContext } from "@mininglamp-oss/octo-runtime-client/protocol";
import type { ImInvocationInput } from "./dispatcher.js";
import { isModelContextItem, renderModelContexts } from "./model-input.js";

/** 渠道材料只在这里渲染；Runtime 收到已经准备好的模型输入和独立执行环境。 */
export function prepareKernelInput(
  request: ImInvocationInput,
  credentials?: ContextEnvsPayload,
): { inputs: InvocationContent & { protocol_mode: "canonical" }; agentEnv: AgentEnv } {
  if (request.preparedInput) {
    const frozen = structuredClone(request.preparedInput);
    for (const key of ["invocationId", "runId", "runMetadata"] as const)
      Object.assign(frozen.inputs, { [key]: structuredClone(request[key]) });
    const limit = request.contexts.items.find((item) => item.namespace === "octo.execution" && item.name === "limits")?.payload.run_timeout_ms;
    const item = frozen.agentEnv.items.find((item) => item.namespace === "octo.execution" && item.name === "limits");
    if (item && typeof limit === "number") item.payload.run_timeout_ms = Math.min(Number(item.payload.run_timeout_ms ?? limit), limit);
    return frozen;
  }
  const { contexts, inputs, preparedInput: _prepared, hooksInvoked: _hooked, agentItems = [], sessionId: _session,
    providerSession: _provider, ...metadata } = structuredClone(request);
  void _session;
  void _provider;
  const rendered = renderModelContexts(contexts);
  const leading = rendered ? [{ type: "text" as const, text: `${rendered}\n\n<!-- Query Input -->\n\n` }] : [];
  const prefix = leading.map((part) => part.type === "text" ? part.text : "[Image]").join("\n\n");
  const agentEnv: AgentEnv = mergeContext({
    schema: contexts.schema,
    items: contexts.items.filter((item) => !isModelContextItem(item)),
  }, { schema: contexts.schema, items: agentItems });
  if (credentials) {
    const item = agentEnv.items.find((item) => item.namespace === "octo.execution" && item.name === "envs");
    const existing = (item?.payload as ContextEnvsPayload | undefined)?.env_variables ?? [];
    // Kernel 仅为本机 endpoint；Windows 的环境键身份不区分大小写。
    const identity = (key: string) => process.platform === "win32" ? key.toUpperCase() : key;
    const protectedKeys = new Set(credentials.env_variables.map(({ key }) => identity(key)));
    const payload = { env_variables: [
      ...existing.filter(({ key }) => !protectedKeys.has(identity(key))),
      ...credentials.env_variables.map((entry) => ({ ...entry })),
    ] };
    if (item) item.payload = payload;
    else agentEnv.items.push({ namespace: "octo.execution", name: "envs", payload });
  }
  const primaryParts = [...leading, ...inputs];
  const fallbackParts = [...leading, ...(metadata.freshFallbackModelInputParts ??
    (metadata.freshFallbackModelInput !== undefined ? [{ type: "text" as const, text: metadata.freshFallbackModelInput }] : inputs))];
  assertModelInputParts(primaryParts);
  assertModelInputParts(fallbackParts);
  return {
    agentEnv,
    inputs: {
      ...metadata,
      prompt: metadata.prompt ?? inputs.map((part) => part.type === "text" ? part.text : "[Image]").join("\n\n"),
      parts: primaryParts,
      ...(metadata.modelInput !== undefined ? { modelInput: prefix + metadata.modelInput } : {}),
      ...(metadata.freshFallbackModelInput !== undefined ? { freshFallbackModelInput: prefix + metadata.freshFallbackModelInput } : {}),
      ...(metadata.freshFallbackModelInputParts
        ? { freshFallbackModelInputParts: fallbackParts } : {}),
    },
  };
}
