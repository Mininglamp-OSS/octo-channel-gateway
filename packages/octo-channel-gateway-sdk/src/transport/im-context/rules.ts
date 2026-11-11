import type { ContextEnvelope, ContextItem, ProviderSession } from "@mininglamp-oss/octo-runtime-client/protocol";
import type { RuleDocument } from "../api/rules.js";
import { OctoApiError } from "../api/errors.js";
import { rulesGuidance, type ImRulesContext, type ImRulesVersions } from "../../application/rules-context.js";
import type { ImContextBuildScope } from "./scope.js";

/** extra.im/group-rules、topic-rules：私聊不查询；群与子区每轮读取权威版本。 */
export async function buildChannelRules(scope: ImContextBuildScope): Promise<ContextItem[]> {
  if (!scope.isGroup) return [];
  const { group, readers, source } = scope;
  const read = async (name: string, load: () => Promise<Readonly<RuleDocument>>): Promise<ContextItem> => {
    let payload: Record<string, unknown>;
    try {
      const doc = await load();
      if (typeof doc.content !== "string" || !Number.isSafeInteger(doc.version))
        throw new Error("IM_RULE_PROTOCOL_INVALID");
      payload = { source, ...group, text: doc.content, version: doc.version,
        ...(doc.updated_at !== undefined ? { updatedAt: doc.updated_at } : {}),
        status: doc.content.trim() ? "present" : "empty", automatic: true };
    } catch (error) {
      // 404明确撤销旧规则；403/网络/协议错误不能伪装成空规则继续执行。
      if (!(error instanceof OctoApiError) || error.status !== 404) throw error;
      payload = { source, ...group, status: "not_found", automatic: true };
    }
    const item = { namespace: "extra.im", name, payload };
    payload.guidance = rulesGuidance(item);
    return item;
  };
  const items = [await read("group-rules", readers.groupRules)];
  if (scope.channelType === 5 && group.shortId)
    items.push(await read("topic-rules", readers.topicRules));
  return items;
}

/** 仅选择 Gateway 自动读取的规则；宿主显式提交的 Context 不参与省略。 */
export function selectRulesContext(
  context: ContextEnvelope,
  cursor: ImRulesContext | undefined,
  provider: ProviderSession | undefined,
  refresh = false,
): {
  context: ContextEnvelope;
  versions?: ImRulesVersions;
  omitted: ContextItem[];
} {
  const rules = context.items.filter(
    (item) =>
      item.namespace === "extra.im" &&
      ["group-rules", "topic-rules"].includes(item.name) &&
      item.payload.automatic === true,
  );
  const stamp = (item: ContextItem): ImRulesVersions["group"] => ({
    version:
      typeof item.payload.version === "number" ? item.payload.version : null,
    status: item.payload.status as ImRulesVersions["group"]["status"],
  });
  const group = rules.find((item) => item.name === "group-rules");
  if (!group) return { context, omitted: [] };
  const topic = rules.find((item) => item.name === "topic-rules");
  const versions = {
    group: stamp(group),
    ...(topic ? { topic: stamp(topic) } : {}),
  };
  const supplied = cursor?.supplied;
  const same = (
    left: ImRulesVersions["group"] | undefined,
    right: ImRulesVersions["group"] | undefined,
  ): boolean =>
    left?.version === right?.version && left?.status === right?.status;
  if (
    refresh ||
    !provider?.sessionId ||
    provider.resumable === false ||
    !supplied ||
    supplied.providerSessionId !== provider.sessionId ||
    !same(supplied.group, versions.group) ||
    !same(supplied.topic, versions.topic)
  )
    return { context, versions, omitted: [] };
  return {
    context: {
      ...context,
      items: context.items.filter((item) => !rules.includes(item)),
    },
    versions,
    omitted: rules,
  };
}
