/** IM上下文清单：每块独立决定适用条件；只在Gateway内组织，最终转为inputs文本。 */
import { assertContextEnvelope, CONTEXT_SCHEMA, type ContextItem } from "@mininglamp-oss/octo-runtime-client/protocol";
import type { ScopedOctoBotConfig } from "../../contracts.js";
import type { ImMessage } from "../wukong.js";
import { createImContextBuildScope, type ImContextBuildOptions } from "./scope.js";
import { buildMessageTrigger } from "./trigger.js";
import { buildReplyContext } from "./reply.js";
import { buildResourcesContext } from "./resources.js";
import { buildMessageContentContext } from "./message-content.js";
import { buildChannelRules } from "./rules.js";
import { buildHistoryContext } from "./history.js";
import { buildHistoryGapContext } from "./history-gap.js";

export async function buildImContexts(
  config: ScopedOctoBotConfig,
  message: ImMessage,
  botToken: string,
  signal: AbortSignal,
  options: ImContextBuildOptions = { initialSession: false },
): Promise<ContextItem[]> {
  const scope = createImContextBuildScope(config, message, botToken, signal, options);
  const items: ContextItem[] = structuredClone((options.configuredItems ?? []).filter((item) => item.namespace !== "extra.im"));
  const append = (item: ContextItem | undefined) => { if (item) items.push(item); };

  // 先获取当前消息事实，预算为它预留空间；保持既有输出顺序，最后追加。
  const currentMessage = await buildMessageTrigger(scope);        // message-trigger：消息/会话/身份/@对象
  const trigger = currentMessage ? [currentMessage] : [];
  append(buildReplyContext(scope));                              // reply：引用的文字
  append(buildResourcesContext(scope));                          // resources：附件/文档/网盘地址
  append(buildMessageContentContext(scope));                     // message-content：富文本/合并转发
  items.push(...await buildChannelRules(scope));                 // group-rules/topic-rules：群/子区规则
  const history = await buildHistoryContext(scope, items, trigger); // history：有界历史与恢复材料
  append(history.item);
  if (history.gap) options.onHistoryGapPrepared?.(history.gap);
  append(buildHistoryGapContext(scope, history.gap, items, trigger)); // history-gap：缺失/省略事实
  items.push(...trigger);

  signal.throwIfAborted();
  assertContextEnvelope({ schema: CONTEXT_SCHEMA, items });
  return items;
}
