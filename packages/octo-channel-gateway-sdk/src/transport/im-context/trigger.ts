import type { ContextItem } from "@mininglamp-oss/octo-runtime-client/protocol";
import type { ImContextBuildScope } from "./scope.js";
import { messageSentAt } from "../message-time.js";
import { unknownIdentity } from "../message-identities.js";

/** extra.im/message-trigger：当前消息、发送者、会话和实际@对象；补查失败保留未知值。 */
type ObjectData = Record<string, unknown>;
function object(value: unknown): ObjectData {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as ObjectData)
    : {};
}

function name(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

/** 返回模型可读 JSON；外部取消继续传播，补充信息失败只留下真实 ID 和未知值。 */
export async function buildMessageTrigger(scope: ImContextBuildScope): Promise<ContextItem | undefined> {
  const { message, signal, botId, group, isGroup, readers } = scope;
  if (
    typeof message.channelId !== "string" ||
    typeof message.messageId !== "string"
  )
    return undefined;
  signal.throwIfAborted();
  const mention = object(message.payload?.mention);
  const targets = [
    ...new Set(
      Array.isArray(mention.uids)
        ? mention.uids.filter(
            (uid): uid is string => typeof uid === "string" && !!uid,
          )
        : [],
    ),
  ];
  const senderUid = typeof message.fromUid === "string" ? message.fromUid : "";
  // 批量 API 上限 200；超过查询上限的 @ 目标仍保留 UID，名称和类型标未知。
  const uids = [...new Set([senderUid, botId, ...targets])].filter(
    (uid) => uid && Buffer.byteLength(uid) <= 64,
  );
  const inGroup = isGroup;
  const inTopic = message.channelType === 5 && !!group.shortId;
  const optional = async <T>(
    read: () => Promise<T>,
  ): Promise<T | undefined> => {
    try {
      return await read();
    } catch {
      signal.throwIfAborted();
      return undefined;
    }
  };
  const [users, detail] = await Promise.all([
    readers.identities(uids),
    inGroup ? optional(readers.conversation) : undefined,
  ]);
  signal.throwIfAborted();
  const data = object(detail);
  const matchingGroup = data.group_no === group.groupNo;
  const matchingTopic = matchingGroup && data.short_id === group.shortId;
  const known = (uid: string) => users[uid] ?? unknownIdentity(uid);
  const sentAt = messageSentAt(message.timestamp, "seconds");
  const enabled = (value: unknown): boolean => value === true || value === 1;
  return {
    namespace: "extra.im",
    name: "message-trigger",
    payload: {
      guidance:
        "Current message: conversation=channel ID/type, sender=actor, recipient=this Bot, sentAt=system-zone time, mentions=actual @ targets; null=unknown.",
      messageId: message.messageId,
      sentAt,
      conversation: {
        id: message.channelId,
        type: inTopic ? "group_topic" : inGroup ? "group" : "dm",
        ...(inGroup
          ? {
              group: {
                id: group.groupNo,
                name: matchingGroup
                  ? name(inTopic ? data.group_name : data.name)
                  : null,
              },
            }
          : {}),
        ...(inTopic
          ? {
              topic: {
                id: group.shortId,
                name: matchingTopic ? name(data.name) : null,
              },
            }
          : {}),
      },
      sender: senderUid
        ? known(senderUid)
        : { uid: null, name: null, type: "unknown" },
      recipient: { botId: botId, name: known(botId).name },
      mentions: {
        targets: targets.map(known),
        ...(enabled(mention.ais) ? { allBots: true } : {}),
        ...(enabled(mention.all) ? { allMembers: true } : {}),
        ...(enabled(mention.humans) ? { allHumans: true } : {}),
      },
    },
  };
}
