import { assertContextEnvelope, CONTEXT_SCHEMA, type ContextItem } from "@mininglamp-oss/octo-runtime-client/protocol";
import { historyGapContext, compactHistoryGap, type ImGapPlan } from "../../application/context-gap.js";
import type { ImContextBuildScope } from "./scope.js";

/** extra.im/history-gap：描述缺失/省略事实；超预算先压缩，再按原策略省略。 */
export function buildHistoryGapContext(
  scope: ImContextBuildScope,
  gap: ImGapPlan | undefined,
  items: readonly ContextItem[],
  trigger: readonly ContextItem[],
): ContextItem | undefined {
  if (!gap) return undefined;
  const { source, message } = scope;
  let candidate = historyGapContext(
    source,
    message.messageId,
    gap,
    message.messageSeq,
  );
  if (
    candidate &&
    items.some(
      (item) => item.namespace === "extra.im" && item.name === "history-gap",
    )
  )
    throw new Error("IM_CONTEXT_KEY_CONFLICT");
  if (candidate) {
    try {
      assertContextEnvelope({
        schema: CONTEXT_SCHEMA,
        items: [...items, candidate, ...trigger],
      });
    } catch {
      candidate = compactHistoryGap(candidate);
      try {
        if (candidate)
          assertContextEnvelope({
            schema: CONTEXT_SCHEMA,
            items: [...items, candidate, ...trigger],
          });
      } catch {
        candidate = undefined;
      }
    }
    return candidate;
  }
}
