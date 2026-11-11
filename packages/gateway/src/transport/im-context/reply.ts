import type { ContextItem } from "@mininglamp-oss/octo-runtime-client/protocol";
import type { ImContextBuildScope } from "./scope.js";

/** extra.im/reply：本条消息引用的文字；无引用则省略，不解引用或补抓历史。 */
export function buildReplyContext(scope: ImContextBuildScope): ContextItem | undefined {
  const reply = scope.message.payload?.reply;
  if (!reply || typeof reply !== "object" || Array.isArray(reply)) return undefined;
  const quoted = reply as Record<string, unknown>;
  const payload = quoted.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return undefined;
  const content = payload as Record<string, unknown>;
  if ((content.type !== undefined && content.type !== 1) ||
      typeof content.content !== "string" || !content.content.trim()) return undefined;

  const text = Array.from(content.content);
  const sender = typeof quoted.from_name === "string" && quoted.from_name.trim()
    ? quoted.from_name
    : typeof quoted.from_uid === "string" && quoted.from_uid.trim() ? quoted.from_uid : "未知来源";
  return {
    namespace: "extra.im",
    name: "reply",
    payload: {
      source: scope.source,
      text: `引用来源：${Array.from(sender).slice(0, 120).join("")}\n引用正文：\n${text.slice(0, 4000).join("")}${text.length > 4000 ? "\n<引用已截断>" : ""}`,
      status: text.length > 4000 ? "truncated" : "present",
    },
  };
}
