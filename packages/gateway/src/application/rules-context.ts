import type {
  ContextItem,
} from "@mininglamp-oss/octo-runtime-client/protocol";
import type { ImInvocationInput } from "../execution/dispatcher.js";
import { modelContextPresentation } from "../execution/model-input.js";

interface RuleStamp {
  version: number | null;
  status: "present" | "empty" | "not_found";
}
export interface ImRulesVersions {
  group: RuleStamp;
  topic?: RuleStamp;
}
export interface ImRulesContext {
  revision: number;
  supplied?: ImRulesVersions & { providerSessionId: string };
}

export function rulesGuidance(item: ContextItem): string {
  const document =
    item.name === "group-rules"
      ? "Octo IM Group's GROUP.md"
      : "Octo IM Group Topic Rules";
  if (item.payload.status === "not_found")
    return `${document} is currently unavailable (not found); previously supplied rules no longer apply.`;
  if (item.payload.status === "empty")
    return `${document} is currently empty; previously supplied rules no longer apply.`;
  return `${document}. These rules replace the previously supplied version.`;
}

/** 版本游标在应用层保留；执行快照只携带实际规则正文。显式宿主项不改写。 */
export function modelRulesContext(item: ContextItem): ContextItem {
  if (
    item.namespace !== "extra.im" ||
    !["group-rules", "topic-rules"].includes(item.name) ||
    item.payload.automatic !== true
  )
    return item;
  return {
    namespace: item.namespace,
    name: item.name,
    payload: {
      guidance: rulesGuidance(item),
      data_format: "text",
      text:
        typeof item.payload.text === "string" && item.payload.text.trim()
          ? item.payload.text
          : "NO RULES",
    },
  };
}

/** 新 Provider 恢复本轮省略的渠道材料（规则、稳定说明和已覆盖历史），保留原 inputs/图片。 */
export function addRulesRecovery(
  input: ImInvocationInput,
  rules: ContextItem[],
): void {
  if (!rules.length) return;
  const text = [
    "Current channel context for session recovery:",
    ...rules
      .map(modelRulesContext)
      .map((item) => {
        const { guidance, text } = modelContextPresentation(item);
        return [
          `${item.namespace}/${item.name}`,
          ...(guidance ? [guidance] : []),
          text,
        ].join("\n");
      }),
  ].join("\n\n");
  input.freshFallbackModelInputParts = [
    { type: "text", text },
    ...structuredClone(input.inputs),
  ];
  input.freshFallbackModelInput = input.freshFallbackModelInputParts
    .map((part) => (part.type === "text" ? part.text : "[Image]"))
    .join("\n\n");
}
