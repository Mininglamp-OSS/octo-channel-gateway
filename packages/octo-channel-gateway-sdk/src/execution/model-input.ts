import type { ContextEnvelope, ContextItem } from "@mininglamp-oss/octo-runtime-client/protocol";

const MODEL_CONTEXT_PATTERNS = [/^extra\.[^/]+\/[^/]+$/, /^octo\.content\/(inline|references)$/];

export function isModelContextItem(item: ContextItem): boolean {
  return MODEL_CONTEXT_PATTERNS.some((pattern) => pattern.test(item.namespace + "/" + item.name));
}

/** 渠道 payload 的本地排版字段在渲染时消费，不进入数据正文或 Runtime 协议。 */
export function modelContextPresentation(item: ContextItem): { guidance?: string; text: string } {
  const { guidance, data_format, ...payload } = item.payload;
  if (guidance !== undefined && typeof guidance !== "string")
    throw new TypeError("IM_MODEL_CONTEXT_INVALID");
  if (data_format !== undefined && data_format !== "text")
    throw new TypeError("IM_MODEL_CONTEXT_INVALID");
  if (data_format === "text" && typeof payload.text !== "string")
    throw new TypeError("IM_MODEL_CONTEXT_INVALID");
  return {
    ...(guidance !== undefined ? { guidance } : {}),
    text: data_format === "text" ? String(payload.text) : JSON.stringify(sorted(payload)),
  };
}

/** 仅渲染本轮业务 Context；默认完整 JSON，显式文本格式保留原文，不修改输入。 */
export function renderModelContexts(context: ContextEnvelope): string {
  const items = context.items.filter(isModelContextItem);
  if (!items.length) return "";
  return [
    "<!-- Context information begins: the following is the current context -->",
    ...items.map((item) => {
      const { guidance, text } = modelContextPresentation(item);
      // 拆分 CDATA 终止符为相邻区段，避免材料中的标记提前结束数据边界；不解析内部内容。
      const data = text.replaceAll("]]>", "]]]]><![CDATA[>");
      return [
        `  <context namespace="${item.namespace}" name="${item.name}">`,
        ...(guidance ? [`    <guidence>${guidance}</guidence>`] : []),
        `    <data><![CDATA[${data}]]></data>`,
        "  </context>"
      ].join("\n");
    }),
    "<!-- Context information ends -->"
  ].join("\n");
}

function sorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sorted);
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, child]) => [key, sorted(child)])
    );
  return value;
}
