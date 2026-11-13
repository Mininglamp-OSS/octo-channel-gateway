import { createHash, randomUUID } from "node:crypto";
import type { RuntimeLog } from "../support/runtime-log.js";

export type GatewayErrorDomain = "CONFIG" | "CONNECTION" | "TRANSPORT" | "EXECUTION" | "DELIVERY";
export type GatewayErrorCategory = "validation" | "permission" | "io" | "network" | "timeout" | "limit" | "protocol" | "unknown";

/** Gateway 共享错误注册表；已发布的 code 不得改义，文案由独立展示表维护。 */
export const GATEWAY_ERROR_CODES = {
  OV_DELIVERY_PATH_INVALID: "validation",
  OV_DELIVERY_READ_FAILED: "io",
  OV_DELIVERY_POLICY_DENIED: "permission",
  OV_DELIVERY_FILE_COUNT_LIMIT: "limit",
  OV_DELIVERY_FILE_SIZE_LIMIT: "limit",
  OV_DELIVERY_TOTAL_SIZE_LIMIT: "limit",
  OV_DELIVERY_TIMEOUT: "timeout",
  OV_DELIVERY_UPLOAD_FAILED: "network",
  OV_DELIVERY_CARD_FAILED: "network",
  OV_DELIVERY_CARD_UNCONFIRMED: "unknown",
} as const satisfies Record<`OV_${GatewayErrorDomain}_${string}`, GatewayErrorCategory>;

export type GatewayErrorCode = keyof typeof GATEWAY_ERROR_CODES;
export type GatewayErrorStage = "reference" | "read" | "upload" | "card";

export class GatewayError extends Error {
  readonly category: GatewayErrorCategory;
  readonly diagnosticId = `diag_${randomUUID().replaceAll("-", "")}`;
  constructor(
    readonly code: GatewayErrorCode,
    readonly stage: GatewayErrorStage,
    options?: { cause?: unknown; deliveryState?: "failed" | "unknown" },
  ) {
    super(code, { cause: options?.cause });
    this.name = "GatewayError";
    this.category = GATEWAY_ERROR_CODES[code];
    this.deliveryState = options?.deliveryState;
  }
  readonly deliveryState?: "failed" | "unknown";
}

/** 只在日志出口提取受控事实，Error/cause/路径和自由文本从不进入用户文案。 */
export function logGatewayError(log: RuntimeLog | undefined, failure: GatewayError, effectKey?: string): void {
  if (!log) return;
  try {
    const cause = failure.cause as { code?: unknown; status?: unknown } | undefined;
    const nativeCode = cause?.code;
    const status = cause?.status;
    const result: unknown = log("warn", "delivery.failure", {
      code: failure.code,
      stage: failure.stage,
      diagnostic_id: failure.diagnosticId,
      ...(typeof nativeCode === "string" && /^(?:E[A-Z0-9_]{1,31}|IM_[A-Z0-9_]{1,96})$/.test(nativeCode)
        ? { native_code: nativeCode } : {}),
      ...(typeof status === "number" && Number.isInteger(status) && status >= 100 && status <= 599
        ? { http_status: status } : {}),
      ...(failure.deliveryState ? { state: failure.deliveryState } : {}),
      ...(effectKey ? { effect_id: createHash("sha256").update(effectKey).digest("hex") } : {}),
    });
    // 宿主允许返回 Promise；诊断拒绝不能变为未处理异常或改变投递结果。
    if (result && typeof (result as PromiseLike<unknown>).then === "function")
      void Promise.resolve(result).catch(() => undefined);
  } catch {
    /* 诊断 getter 或宿主日志故障不影响执行。 */
  }
}
