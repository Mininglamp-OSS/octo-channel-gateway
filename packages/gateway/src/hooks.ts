import { isDeepStrictEqual } from "node:util";
import { assertInvokeInput, type AgentEnv, type InvocationContent, type ProviderSession } from "@mininglamp-oss/octo-runtime-client/protocol";
import type { RuntimeLog } from "./support/types.js";
import { runDiagnostic } from "./support/diagnostics.js";

export type GatewayInputs = InvocationContent & { protocol_mode: "canonical" };
export interface GatewayHookContext {
  readonly botId: string;
  readonly sessionKey: string;
  readonly generation: number;
  readonly sessionId: string;
  readonly providerSession: Readonly<ProviderSession> | undefined;
  readonly messageId: string;
  readonly conversation: Readonly<{ kind: "direct" | "group" | "thread"; id: string }>;
  readonly turn: Readonly<{ index: number }>;
  readonly signal: AbortSignal;
}
export interface GatewayHookResult { inputs: GatewayInputs; agentEnv: AgentEnv }
export interface GatewayHook {
  type: "pre_dispatch" | "pre_invoke";
  hook: (ctx: GatewayHookContext, inputs: GatewayInputs, agentEnv: AgentEnv) => Promise<GatewayHookResult>;
}

/** 注册数组由绑定拥有；未知点位只告警，函数和业务内容不进入日志。 */
export function normalizeHooks(hooks: readonly GatewayHook[] = [], log?: RuntimeLog): readonly GatewayHook[] {
  if (!Array.isArray(hooks)) throw new Error("IM_HOOKS_INVALID");
  const result: GatewayHook[] = [];
  for (const [index, entry] of hooks.entries()) {
    if (!entry || typeof entry !== "object") throw new Error("IM_HOOK_INVALID");
    if (entry.type !== "pre_dispatch" && entry.type !== "pre_invoke") {
      runDiagnostic(() => log?.("warn", "channel.hook_ignored", { code: "IM_HOOK_UNKNOWN", hook_index: index }));
      continue;
    }
    if (typeof entry.hook !== "function") throw new Error("IM_HOOK_INVALID");
    result.push(Object.freeze({ type: entry.type, hook: entry.hook }));
  }
  return Object.freeze(result);
}
function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
export function hookContext(value: GatewayHookContext): GatewayHookContext {
  const { signal, ...snapshot } = value;
  return Object.freeze({ ...freeze(structuredClone(snapshot)), signal });
}

/** 每个点位共用只读 ctx，业务返回值替换当前稿；原稿始终隔离保存供重试。 */
export async function runHooks(
  hooks: readonly GatewayHook[], type: GatewayHook["type"], ctx: GatewayHookContext,
  initial: GatewayHookResult, frozen = false,
): Promise<GatewayHookResult> {
  let current = structuredClone(initial);
  for (const entry of hooks) {
    if (entry.type !== type) continue;
    ctx.signal.throwIfAborted();
    const result = await entry.hook(ctx, current.inputs, current.agentEnv);
    ctx.signal.throwIfAborted();
    if (!result || typeof result !== "object" || !result.inputs || !result.agentEnv)
      throw new Error("IM_HOOK_RESULT_INVALID");
    current = structuredClone(result);
    // 身份、追踪和协议由 Gateway 管理，不能经 inputs 旁路改写。
    for (const key of ["protocol_mode", "invocationId", "runId", "sessionGeneration", "providerEpoch", "sessionName", "runMetadata"] as const)
      if (!isDeepStrictEqual(current.inputs[key], initial.inputs[key])) throw new Error("IM_HOOK_IDENTITY_CHANGED");
    if (Object.hasOwn(current.inputs, "sessionId") || Object.hasOwn(current.inputs, "providerSession") || Object.hasOwn(current.inputs, "agentEnv"))
      throw new Error("IM_HOOK_IDENTITY_CHANGED");
    for (const name of ["adapter", "agent", "workspace"]) {
      const select = (env: AgentEnv) => env.items.find(item => item.namespace === "octo.execution" && item.name === name);
      if (!isDeepStrictEqual(select(current.agentEnv), select(initial.agentEnv))) throw new Error("IM_HOOK_EXECUTION_TARGET_CHANGED");
    }
    const { parts, ...metadata } = current.inputs;
    assertInvokeInput({ ...metadata, inputs: parts, agentEnv: current.agentEnv, sessionId: ctx.sessionId, ...(ctx.providerSession ? { providerSession: ctx.providerSession } : {}) });
    if (frozen && !isDeepStrictEqual(current, initial)) throw new Error("IM_HOOK_REPLAY_CHANGED");
  }
  ctx.signal.throwIfAborted();
  return current;
}
