import type { KernelClient } from "@mininglamp-oss/octo-runtime-client";
export type JsonValue =
  null | boolean | number | string | JsonValue[] | JsonObject;
export interface JsonObject {
  [key: string]: JsonValue;
}
export type RuntimeLogLevel = "debug" | "info" | "warn" | "error";
export type RuntimeLog = (
  level: RuntimeLogLevel,
  event: string,
  data?: Readonly<Record<string, unknown>>,
) => void;
export type GatewayExecutionContext = Pick<
  KernelClient,
  "invoke" | "interrupt" | "respondInteraction"
>;
