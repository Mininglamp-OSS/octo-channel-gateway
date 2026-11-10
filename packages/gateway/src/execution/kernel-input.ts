import type {
  AgentEnv,
  ContextEnvsPayload,
  InvocationContent,
} from "@mininglamp-oss/octo-runtime-client/protocol";
import type { ImInvocationInput } from "./dispatcher.js";
import { isModelContextItem, renderModelContexts } from "./model-input.js";

/** 渠道材料只在这里渲染；Runtime 收到已经准备好的模型输入和独立执行环境。 */
export function prepareKernelInput(
  request: ImInvocationInput,
  credentials?: ContextEnvsPayload,
): { inputs: InvocationContent & { protocol_mode: "canonical" }; agentEnv: AgentEnv } {
  const { contexts, inputs, instruction, includeInstruction, sessionId: _session,
    providerSession: _provider, ...metadata } = structuredClone(request);
  void _session;
  void _provider;
  const rendered = renderModelContexts(contexts);
  const prefix = rendered ? `${rendered}\n\n<!-- Query Input -->\n\n` : "";
  const leading = prefix ? [{ type: "text" as const, text: prefix }] : [];
  const instructionParts = instruction?.trim() ? [{ type: "text" as const, text: instruction }] : [];
  const primaryLeading = [...(includeInstruction ? instructionParts : []), ...leading];
  const recoveryLeading = [...instructionParts, ...leading];
  const agentEnv: AgentEnv = {
    schema: contexts.schema,
    items: contexts.items.filter((item) => !isModelContextItem(item)),
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
      parts: [...primaryLeading, ...inputs],
      ...(metadata.modelInput !== undefined ? { modelInput: (includeInstruction && instruction ? instruction + "\n\n" : "") + prefix + metadata.modelInput } : {}),
      ...(metadata.freshFallbackModelInput !== undefined ? { freshFallbackModelInput: (instruction ? instruction + "\n\n" : "") + prefix + metadata.freshFallbackModelInput } : {}),
      ...(metadata.freshFallbackModelInputParts ? { freshFallbackModelInputParts: [...recoveryLeading, ...metadata.freshFallbackModelInputParts] } : instructionParts.length && metadata.freshFallbackModelInput === undefined ? { freshFallbackModelInputParts: [...recoveryLeading, ...inputs] } : {}),
    },
  };
}
