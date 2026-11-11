/**
 * 执行请求构造：把本轮 Context、可信发送者和执行配置封装为 InvokeRequest。
 * IM 默认值、业务材料渲染与 prompt 封装均归 Gateway。
 */
import type { GatewayHookResult } from "../hooks.js";
import { randomUUID } from "node:crypto";
import { accessSync, constants, mkdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  assertContextEnvelope,
  mergeContext,
  type ContextEnvelope,
  type ContextItem,
  type InvokeInput,
  type AgentEnv,
} from "@mininglamp-oss/octo-runtime-client/protocol";
import type { ImBotConfig, ImInboundMessage, ImSession } from "../contracts.js";
import { validateImConfig } from "../lifecycle/configuration.js";
import {
  compactHistoryGap,
  historyGapContext,
} from "../application/context-gap.js";
import { MENTION_GUIDANCE } from "../transport/mentions.js";
import { artifactPolicy } from "../delivery/artifact-policy.js";
import type { ImArtifactPolicy } from "../delivery/artifact-policy.js";
import { stableChannelContexts } from "../application/stable-context.js";
import { modelRulesContext } from "../application/rules-context.js";
import { modelHistoryContexts } from "../application/history-context.js";

/** Gateway 内部准备稿，业务 Context 在跨 client 边界前转成模型 parts。 */
export type ImInvocationInput = Omit<InvokeInput, "agentEnv"> & {
  contexts: ContextEnvelope;
  runId: string;
  invocationId: string;
  sessionId: string;
  protocol_mode: "canonical";
  /** 已准备并冻结的 Hook 输出，仅在 Gateway 内部保存。 */
  preparedInput?: GatewayHookResult;
  hooksInvoked?: boolean;
  agentItems?: AgentEnv["items"];
};
export function createImInvocation(
  config: ImBotConfig,
  message: ImInboundMessage,
  context: ContextEnvelope,
  sessionKey: string,
  session: ImSession,
  _signal: AbortSignal,
  occurrenceId = message.messageId,
  refreshStableContext = !session.providerSession?.sessionId ||
    session.providerSession.resumable === false,
): {
  request: ImInvocationInput;
  adapterType: string;
  artifacts: ImArtifactPolicy;
  recoveryContexts: ContextItem[];
  stableContextIncluded: boolean;
  historyContext?: ContextItem;
} {
  validateImConfig(config);
  assertContextEnvelope(context);
  if (!session.id) throw new Error("IM_SESSION_NOT_ALLOCATED");
  const agentItems = message.historyRetry ? message.frozenAgentItems ?? [] : config.agent.items ?? [];
  const selectedAdapter =
    agentItems.find((item) => item.namespace === "octo.execution" && item.name === "adapter")?.payload.type ??
    context.items.find(
      (item) => item.namespace === "octo.execution" && item.name === "adapter",
    )?.payload.type ??
    config.agent.adapter_type ??
    "codex";
  if (typeof selectedAdapter !== "string")
    throw new Error("IM_EXECUTION_CONFIG_INVALID");
  const agentSource = selectedAdapter === "openclaw" ? "preset" : "provisioned";
  const defaultWorkdir = join(
    homedir(),
    "octo-runtime",
    "channels",
    config.bot_id,
  );
  const workdir =
    config.agent.workdir ??
    (agentSource === "provisioned" ? defaultWorkdir : undefined);
  const submittedWorkspace = [...agentItems, ...context.items].find(
    (item) => item.namespace === "octo.execution" && item.name === "workspace",
  );
  if (submittedWorkspace && Object.keys(submittedWorkspace.payload).some((key) => key !== "path"))
    throw new Error("IM_AGENT_WORKSPACE_INVALID");
  if (submittedWorkspace && submittedWorkspace.payload.path !== workdir)
    throw new Error("IM_AGENT_WORKDIR_FIXED");
  const defaults: ContextEnvelope = {
    schema: context.schema,
    items: [
      // 同轮重试只使用已有冻结项，不从更新的 Bot 配置引入新执行设置。
      ...(!message.historyRetry && config.agent.mcp !== undefined
        ? [{ namespace: "octo.execution", name: "mcp", payload: { ...config.agent.mcp } }]
        : []),
      ...(!message.historyRetry && config.agent.envs !== undefined
        ? [{ namespace: "octo.execution", name: "envs", payload: { ...config.agent.envs } }]
        : []),
      {
        namespace: "octo.execution",
        name: "adapter",
        payload: {
          type: config.agent.adapter_type ?? "codex",
        },
      },
      { namespace: "octo.execution", name: "agent", payload: { source: agentSource } },
      ...(selectedAdapter === "openclaw" ? [{
        namespace: "adapter.openclaw", name: "options",
        payload: { agentId: config.agent.provider_agent_id ?? "main" },
      }] : []),
      {
        namespace: "octo.security",
        name: "approval_policy",
        payload: { mode: config.approval_mode ?? "full_access" },
      },
      {
        namespace: "octo.execution",
        name: "limits",
        payload: {
          run_timeout_ms: config.run_timeout_ms ?? 86_400_000,
          // 模型静默由 Gateway 按公开内容计时；Core 保留总期限和工具预算，不抢先触发首帧超时。
          first_frame_timeout_ms: 310_000,
          model_idle_policy: "observe",
          // IM 的长工具可能长时间无输出；业务可通过本轮 limits 显式收紧。
          tool_timeout_ms: 86_400_000,
        },
      },
      ...(workdir
        ? [
            {
              namespace: "octo.execution",
              name: "workspace",
              payload: { path: workdir },
            },
          ]
        : []),
      ...(config.agent.model || config.agent.effort
        ? [
            {
              namespace: "octo.execution",
              name: "model",
              payload: {
                ...(config.agent.model
                  ? { selection: { id: config.agent.model } }
                  : {}),
                ...(config.agent.effort
                  ? { reasoning: { effort: config.agent.effort } }
                  : {}),
              },
            },
          ]
        : []),
    ],
  };
  // Gateway 先冻结内部业务快照，调用前分离执行环境与模型材料。
  // 本轮渠道事实已准备；渠道必要说明作为普通文本材料按既有边界追加。
  let submitted = context;
  // 同代次卡片重试已从 occurrence 取得组合后的冻结快照，不能再次追加或按文本去重。
  if (!message.historyRetry && refreshStableContext) {
    const channelInstructions = {
      namespace: "extra.im",
      name: "mention-guidance",
      payload: { data_format: "text" as const, text: MENTION_GUIDANCE },
    };
    submitted = {
      schema: context.schema,
      items: [...context.items.filter((item) =>
        !(item.namespace === "extra.im" && item.name === "mention-guidance")), channelInstructions],
    };
  }
  submitted = { ...submitted, items: submitted.items.map(modelRulesContext) };
  let snapshot: ContextEnvelope | undefined;
  let artifacts: ImArtifactPolicy | undefined;
  let stable: ContextItem[] = [];
  // 执行默认项也占协议预算；只降级本渠道自动追加的辅助材料，不丢弃显式业务项。
  for (const optional of [
    "history",
    "history-gap-compact",
    "history-gap",
    undefined,
  ]) {
    try {
      snapshot = mergeContext(defaults, {
        ...submitted,
        items: modelHistoryContexts(submitted.items),
      });
      artifacts = structuredClone(
        message.frozenArtifacts ?? artifactPolicy(config, snapshot),
      );
      stable = stableChannelContexts(artifacts);
      // 稳定说明只由渠道按周期生成；已有同名项不能抑制刷新或绕过普通轮省略。
      // 冻结重试复用渠道已生成的完整快照，不重建或再次追加说明。
      if (!message.historyRetry) {
        snapshot.items = snapshot.items.filter(
          (item) =>
            !stable.some(
              (owned) =>
                owned.namespace === item.namespace && owned.name === item.name,
            ),
        );
        if (refreshStableContext) snapshot.items.push(...stable);
      }
      assertContextEnvelope(snapshot);
      break;
    } catch (error) {
      if (
        !(error instanceof Error) ||
        error.message !== "CONTEXT_BUDGET_EXCEEDED" ||
        !optional
      )
        throw error;
      submitted = {
        ...submitted,
        items:
          optional === "history-gap-compact"
            ? submitted.items.flatMap((item) => {
                if (
                  item.namespace !== "extra.im" ||
                  item.name !== "history-gap" ||
                  item.payload.automatic !== true
                )
                  return [item];
                const compact = compactHistoryGap(item);
                return compact ? [compact] : [];
              })
            : submitted.items.filter(
                (item) =>
                  !(
                    item.namespace === "extra.im" &&
                    item.name === optional &&
                    item.payload.automatic === true
                  ),
              ),
      };
      if (optional === "history") {
        const history = context.items.find(
          (item) =>
            item.namespace === "extra.im" &&
            item.name === "history" &&
            item.payload.automatic === true,
        );
        const source = history?.payload.source as
          Record<string, unknown> | undefined;
        if (
          source &&
          [2, 5].includes(Number(source.channelType)) &&
          !submitted.items.some(
            (item) =>
              item.namespace === "extra.im" &&
              item.name === "history-gap" &&
              item.payload.automatic !== true,
          )
        ) {
          const existing = submitted.items.find(
            (item) =>
              item.namespace === "extra.im" && item.name === "history-gap",
          );
          const replacement = existing
            ? {
                ...existing,
                payload: {
                  ...existing.payload,
                  status: "omitted",
                  materialProvided: false,
                  reason: "context-budget",
                },
              }
            : historyGapContext(source, message.messageId, {
                mode: "unavailable",
                beforeSeq: Number(history!.payload.upperMessageSeq),
                retrieval: "omitted",
                reason: "context-budget",
              });
          submitted.items = submitted.items.filter(
            (item) =>
              !(
                item.namespace === "extra.im" &&
                item.name === "history-gap" &&
                item.payload.automatic === true
              ),
          );
          if (replacement) submitted.items.push(replacement);
        }
      }
    }
  }
  if (!snapshot || !artifacts) throw new Error("IM_EXECUTION_CONFIG_INVALID");
  // 仅最终仍提交的自动历史构成交接证据；内部字段不进入模型快照或冻结重试。
  const historyContext = submitted.items.find(
    (item) =>
      item.namespace === "extra.im" &&
      item.name === "history" &&
      item.payload.automatic === true &&
      snapshot.items.some(
        (candidate) =>
          candidate.namespace === item.namespace &&
          candidate.name === item.name,
      ),
  );
  const eventId = `evt_${randomUUID()}`,
    runId = `run_${randomUUID()}`;
  const prompt = message.buildInputs ? "[Image]" : message.text.trim();
  const request: ImInvocationInput = {
    protocol_mode: "canonical",
    invocationId: `invoke_${randomUUID()}`,
    runId,
    sessionId: session.id,
    ...(session.sessionName ? { sessionName: session.sessionName } : {}),
    sessionGeneration: session.generation,
    providerEpoch: session.generation,
    inputs: [{ type: "text", text: prompt }],
    contexts: snapshot,
    ...(!message.historyRetry ? { agentItems: structuredClone(agentItems) } : {}),

    ...(session.providerSession
      ? { providerSession: session.providerSession }
      : {}),
    runMetadata: {
      ...message.runMetadata,
      // 可信身份覆盖可选 metadata，正文或自定义字段不能冒充当前发起人和会话。
      namespace: "im",
      platform: "octo",
      eventId,
      sessionKey,
      actorId: message.senderId,
      channelId: message.conversationId,
      triggerOccurrenceId: occurrenceId,
    },
  };
  if (
    config.agent.workdir === undefined &&
    agentSource === "provisioned" &&
    workdir === defaultWorkdir
  )
    mkdirSync(defaultWorkdir, { recursive: true, mode: 0o700 });
  if (agentSource === "provisioned" && workdir) {
    try {
      if (!statSync(workdir).isDirectory()) throw new Error("not a directory");
      accessSync(workdir, constants.R_OK | constants.W_OK | constants.X_OK);
    } catch {
      throw new Error("IM_AGENT_WORKDIR_UNAVAILABLE");
    }
  }
  session.lastEventId = eventId;
  session.lastRunId = runId;
  return {
    request,
    adapterType: selectedAdapter,
    artifacts,
    historyContext,
    recoveryContexts: stable.filter(
      (item) =>
        !snapshot.items.some(
          (existing) =>
            existing.namespace === item.namespace &&
            existing.name === item.name,
        ),
    ),
    stableContextIncluded: stable.every((item) =>
      snapshot.items.some(
        (existing) =>
          existing.namespace === item.namespace && existing.name === item.name,
      ),
    ),
  };
}
