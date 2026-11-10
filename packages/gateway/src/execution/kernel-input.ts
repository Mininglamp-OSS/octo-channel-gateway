import type {
  AgentEnv,
  ContextEnvsPayload,
  InvocationContent,
} from "@mininglamp-oss/octo-runtime-client/protocol";
import { assertModelInputParts, mergeContext } from "@mininglamp-oss/octo-runtime-client/protocol";
import type { ImInvocationInput } from "./dispatcher.js";
import { isModelContextItem, renderModelContexts } from "./model-input.js";
import { materialParts } from "../materials.js";

/** 渠道材料只在这里渲染；Runtime 收到已经准备好的模型输入和独立执行环境。 */
export function prepareKernelInput(
  request: ImInvocationInput,
  credentials?: ContextEnvsPayload,
): { inputs: InvocationContent & { protocol_mode: "canonical" }; agentEnv: AgentEnv } {
  const { contexts, inputs, instruction, includeInstruction, materials = [], agentItems = [], sessionId: _session,
    providerSession: _provider, ...metadata } = structuredClone(request);
  void _session;
  void _provider;
  const rendered = renderModelContexts(contexts);
  const leading = [
    ...(rendered ? [{ type: "text" as const, text: rendered }] : []),
    ...materialParts(materials),
    ...(rendered || materials.length ? [{ type: "text" as const, text: "\n\n<!-- Query Input -->\n\n" }] : []),
  ];
  const prefix = leading.map((part) => part.type === "text" ? part.text : "[Image]").join("\n\n");
  const instructionParts = instruction?.trim() ? [{ type: "text" as const, text: instruction }] : [];
  const primaryLeading = [...(includeInstruction ? instructionParts : []), ...leading];
  const recoveryLeading = [...instructionParts, ...leading];
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
  const primaryParts = [...primaryLeading, ...inputs];
  const fallbackParts = [...recoveryLeading, ...(metadata.freshFallbackModelInputParts ??
    (metadata.freshFallbackModelInput !== undefined ? [{ type: "text" as const, text: metadata.freshFallbackModelInput }] : inputs))];
  assertModelInputParts(primaryParts);
  assertModelInputParts(fallbackParts);
  return {
    agentEnv,
    inputs: {
      ...metadata,
      prompt: metadata.prompt ?? inputs.map((part) => part.type === "text" ? part.text : "[Image]").join("\n\n"),
      parts: primaryParts,
      ...(metadata.modelInput !== undefined ? { modelInput: (includeInstruction && instruction ? instruction + "\n\n" : "") + prefix + metadata.modelInput } : {}),
      ...(metadata.freshFallbackModelInput !== undefined ? { freshFallbackModelInput: (instruction ? instruction + "\n\n" : "") + prefix + metadata.freshFallbackModelInput } : {}),
      ...(metadata.freshFallbackModelInputParts || materials.length || (instructionParts.length && metadata.freshFallbackModelInput === undefined)
        ? { freshFallbackModelInputParts: fallbackParts } : {}),
    },
  };
}
