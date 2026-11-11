import { assertContextEnvelope, CONTEXT_SCHEMA, type ContextItem } from "@mininglamp-oss/octo-runtime-client/protocol";
import { IM_HISTORY_MESSAGE_LIMIT, planHistoryGap, validMessageSeq, assistantOutputFingerprint, type ImGapPlan } from "../../application/context-gap.js";
import { modelHistoryContexts } from "../../application/history-context.js";
import { historyMessages } from "../history-messages.js";
import { historySenderUids, supportedHistoryType } from "../history-content.js";
import type { ImContextBuildScope } from "./scope.js";

/** extra.im/history：按原计划读取有界窗口，保留排序、去重、交接排除和恢复材料。 */
export async function buildHistoryContext(
  scope: ImContextBuildScope,
  items: readonly ContextItem[],
  trigger: readonly ContextItem[],
): Promise<{ item?: ContextItem; gap?: ImGapPlan }> {
  const { message, source, signal } = scope;
  // 计算结果在本函数自己的副本上生成，绝不更新只读scope或会话存储。
  let gap = structuredClone(scope.historyPlan) as ImGapPlan | undefined;
  let selected: ContextItem | undefined;
  const historyPlan = scope.initialSession
    ? planHistoryGap(message.messageSeq, undefined, "cold-window")
    : gap;
  if (gap && scope.initialSession) gap = historyPlan;
  if (
    historyPlan &&
    (historyPlan.mode === "bootstrap" || historyPlan.mode === "delta") &&
    validMessageSeq(historyPlan.beforeSeq) &&
    historyPlan.beforeSeq > 1
  ) {
    try {
      const page = await scope.readers.history({
        beforeSeq: historyPlan.beforeSeq,
        afterSeq: historyPlan.afterSeq ?? 0,
        limit: Math.min(IM_HISTORY_MESSAGE_LIMIT, historyPlan.messageLimit!),
      });
      const sequences = new Set<number>();
      const messageIds = new Set<string>();
      const entries = page.messages
        .filter(
          (entry) =>
            entry.message_id !== message.messageId &&
            validMessageSeq(entry.message_seq) &&
            entry.message_seq < historyPlan.beforeSeq! &&
            entry.message_seq > (historyPlan.afterSeq ?? 0),
        )
        .sort((a, b) => b.message_seq! - a.message_seq!)
        .filter((entry) => {
          if (
            sequences.has(entry.message_seq!) ||
            (entry.message_id !== undefined && messageIds.has(entry.message_id))
          )
            return false;
          sequences.add(entry.message_seq!);
          if (entry.message_id !== undefined) messageIds.add(entry.message_id);
          return true;
        })
        .slice(0, IM_HISTORY_MESSAGE_LIMIT);
      const identities = await scope.readers.identities(
        [
          ...entries
            .filter((entry) => supportedHistoryType(entry.type))
            .map((entry) => entry.from_uid),
          ...historySenderUids(entries.map((entry) => entry.payload)),
        ],
      );
      const excludedSeqs =
        scope.initialSession || historyPlan.mode !== "delta"
          ? []
          : entries
              .filter(
                (entry) =>
                  entry.from_uid === scope.botId &&
                  historyPlan.excludedOutputs?.some(
                    (output) =>
                      output.seq === entry.message_seq &&
                      output.fingerprint ===
                        assistantOutputFingerprint({ ...entry.payload }),
                  ),
              )
              .map((entry) => entry.message_seq!);
      const { messages, truncated, recoveryMessages } = historyMessages(
        entries,
        new Map(Object.entries(identities)),
        excludedSeqs,
      );
      if (gap)
        gap = {
          ...historyPlan,
          retrieval:
            messages.length || recoveryMessages?.length ? "omitted" : "empty",
          earlierOmitted:
            (historyPlan.earlierOmitted === true &&
              historyPlan.mode === "delta") ||
            page.more !== false ||
            entries.length !== page.messages.length ||
            entries.some((entry) => !supportedHistoryType(entry.type)) ||
            truncated,
        };
      if (
        (messages.length || recoveryMessages?.length) &&
        !items.some(
          (item) => item.namespace === "extra.im" && item.name === "history",
        )
      ) {
        const history: ContextItem = {
          namespace: "extra.im",
          name: "history",
          payload: {
            guidance:
              "This data contains bounded earlier messages from the current channel.",
            source,
            upperMessageSeq: message.messageSeq,
            range: {
              beforeSeq: historyPlan.beforeSeq,
              ...(historyPlan.afterSeq !== undefined
                ? { afterSeq: historyPlan.afterSeq }
                : {}),
            },
            messages,
            truncated,
            automatic: true,
          },
        };
        try {
          assertContextEnvelope({
            schema: CONTEXT_SCHEMA,
            items: [...items, history, ...trigger],
          });
          selected = history;
          if (gap && recoveryMessages?.length)
            gap.recoveryHistory = modelHistoryContexts([
              {
                ...history,
                payload: { ...history.payload, messages: recoveryMessages },
              },
            ])[0];
          if (gap) gap.retrieval = gap.earlierOmitted ? "partial" : "provided";
        } catch {
          /* 辅助历史超预算时省略，不裁剪调用方材料。 */
        }
      }
    } catch {
      signal.throwIfAborted();
      if (gap)
        gap = {
          ...historyPlan,
          retrieval: "unavailable",
          reason: "history-api-unavailable",
        };
    }
  }
  return { item: selected, gap };
}
