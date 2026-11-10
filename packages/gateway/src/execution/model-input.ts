import type { ContextEnvelope, ContextItem } from "@mininglamp-oss/octo-runtime-client/protocol";

const MODEL_CONTEXT_PATTERNS = [/^extra\.[^/]+\/[^/]+$/, /^octo\.content\/(inline|references)$/];

export function isModelContextItem(item: ContextItem): boolean {
  return MODEL_CONTEXT_PATTERNS.some((pattern) => pattern.test(item.namespace + "/" + item.name));
}

/** 仅渲染本轮业务 Context；默认完整 JSON，显式文本格式保留原文，不修改输入。 */
export function renderModelContexts(context: ContextEnvelope): string {
  const items = context.items.filter(isModelContextItem);
  if (!items.length) return "";
  return [
    "<!-- Context information begins: the following is the current context -->",
    ...items.map((item) => {
      // 拆分 CDATA 终止符为相邻区段，避免材料中的标记提前结束数据边界；不解析内部内容。
      const data = (
        item.data_format === "text"
          ? String(item.payload.text)
          : JSON.stringify(sorted(item.payload))
      ).replaceAll("]]>", "]]]]><![CDATA[>");
      return [
        `  <context namespace="${item.namespace}" name="${item.name}">`,
        ...(item.guidance ? [`    <guidence>${item.guidance}</guidence>`] : []),
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
