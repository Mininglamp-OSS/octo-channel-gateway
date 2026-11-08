import type {
  AgentEnv,
  ContextEnvsPayload,
  InvocationContent,
} from "@mininglamp-oss/octo-runtime-client/protocol";
import type { ImInvocationInput } from "./dispatcher.js";
import { renderModelContexts } from "./model-input.js";

/** 渠道材料只在这里渲染；Runtime 收到已经准备好的模型输入和独立执行环境。 */
export function prepareKernelInput(
  request: ImInvocationInput,
  credentials?: ContextEnvsPayload,
): { inputs: InvocationContent & { protocol_mode: "canonical" }; agentEnv: AgentEnv } {
  const { contexts, inputs, agentSource, approvalMode, sessionId: _session,
    providerSession: _provider, ...metadata } = structuredClone(request);
  void _session;
  void _provider;
  const rendered = renderModelContexts(contexts);
  const prefix = rendered ? `${rendered}\n\n<!-- Query Input -->\n\n` : "";
  const leading = prefix ? [{ type: "text" as const, text: prefix }] : [];
  const agentEnv: AgentEnv = {
    schema: contexts.schema,
    items: contexts.items.filter((item) =>
      item.namespace === "octo.execution" ||
      (item.namespace === "octo.security" && item.name === "approval_policy") ||
      (item.namespace === "octo.control" && item.name === "instructions")),
    agentSource,
    approvalMode,
  };
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
  return {
    agentEnv,
    inputs: {
      ...metadata,
      prompt: metadata.prompt ?? inputs.map((part) => part.type === "text" ? part.text : "[Image]").join("\n\n"),
      parts: [...leading, ...inputs],
      ...(metadata.modelInput !== undefined ? { modelInput: prefix + metadata.modelInput } : {}),
      ...(metadata.freshFallbackModelInput !== undefined ? { freshFallbackModelInput: prefix + metadata.freshFallbackModelInput } : {}),
      ...(metadata.freshFallbackModelInputParts ? { freshFallbackModelInputParts: [...leading, ...metadata.freshFallbackModelInputParts] } : {}),
    },
  };
}
