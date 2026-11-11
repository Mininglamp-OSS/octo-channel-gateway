import type {
  JsonObject,
  JsonValue,
} from "@mininglamp-oss/octo-channel-gateway-sdk/host/types";

/** Gateway 自有命令声明；导入模块不初始化服务或访问业务后端。 */
export interface GatewayCommandExtension {
  apiVersion: 1;
  commands: readonly GatewayCommand[];
}
export interface GatewayCommandOption {
  name: string;
  description: string;
  type: "string" | "boolean";
  required?: boolean;
}
export interface GatewayCommand {
  name: string;
  description: string;
  options?: readonly GatewayCommandOption[];
  /** 按顺序消费位置参数；不声明就拒绝额外参数，-- 后的文本仍按此声明校验。 */
  arguments?: readonly { name: string; required?: boolean }[];
  examples?: readonly string[];
  commands?: readonly GatewayCommand[];
  run?: (
    context: GatewayCommandContext,
    input: GatewayCommandInput,
  ) => Promise<GatewayCommandResult | void>;
}
export interface GatewayCommandInput {
  options: Readonly<Record<string, string | boolean>>;
  arguments: readonly string[];
}
export interface GatewayCommandResult {
  /** 可选的普通终端安全提示；--json 时输出 value，不从业务 JSON 字段猜测格式。 */
  message?: string;
  value?: JsonValue;
  exitCode?: number;
}
export interface GatewayConfigSnapshot {
  config: JsonObject;
  /** 宿主生成的不透明修订，用于保存时检查整份声明是否发生并发变化。 */
  revision: string;
}
export interface GatewayConfigSaved {
  saved: true;
  name: string;
  file: string;
  reload_required: true;
}
/**
 * CLI 拥有 Home、IO 与取消信号；业务实现先读快照、在锁外完成交互/校验，再保存。
 * saveConfig 只写 Gateway 配置；冲突须重新读取，不能盲目重试。
 * output/prompt 文本须脱敏；凭据不使用会回显的 prompt。
 */
export interface GatewayCommandContext {
  readonly home: string;
  readonly name: string;
  readonly signal: AbortSignal;
  readonly interactive: boolean;
  readConfig(): Promise<GatewayConfigSnapshot>;
  saveConfig(config: JsonObject, revision: string): Promise<GatewayConfigSaved>;
  readStdin(): Promise<string>;
  output(text: string): void;
  prompt(question: string): Promise<string>;
}
/** 可公开的固定诊断；不得把凭据、用户输入或后端错误正文拼入 code/message。 */
export class GatewayCommandError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "GatewayCommandError";
  }
}

export type {
  JsonObject,
  JsonValue,
} from "@mininglamp-oss/octo-channel-gateway-sdk/host/types";

/** 将宿主保存回执转换为明确的文本/JSON 输出；业务对象不参与回执识别。 */
export function savedConfigResult(
  saved: GatewayConfigSaved,
): GatewayCommandResult {
  return {
    value: { ...saved },
    message: `${saved.name}: configuration saved. Restart the active Gateway to apply it. For a foreground run, stop it in its terminal (Ctrl+C) and run it again; service restart only manages the native service.\nConfig file: ${saved.file}`,
  };
}
