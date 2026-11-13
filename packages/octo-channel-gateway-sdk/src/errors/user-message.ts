import type { GatewayErrorCode } from "./gateway-error.js";

const messages = {
  preparation: "部分附件未能发送",
  cardFailed: "附件卡片未能发送",
  cardUnknown: "附件卡片发送未确认",
} as const;

/** 文案与稳定 code 分离；有限注册表的去重摘要不包含诊断 cause。 */
export function gatewayFailureMessage(codes: readonly GatewayErrorCode[], kind: keyof typeof messages = "preparation"): string {
  return codes.length ? `${messages[kind]}（${[...new Set(codes)].join("、")}）。` : "";
}
