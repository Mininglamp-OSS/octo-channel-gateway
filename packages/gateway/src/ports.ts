/**
 * 宿主依赖入口：注入执行能力、凭据来源和脱敏诊断。
 * SDK 应用自行决定账号目录和凭据生命周期，通道无需依赖 CLI 或具体 Provider。
 */
import type { GatewayExecutionContext } from "./support/types.js";
import type { ImBotConfig } from "./contracts.js";
import type { ImSessionStore } from "./application/session-store.js";
import type {
  RuntimeLog,
  JsonObject,
  ChannelDependencies,
} from "./support/types.js";
import type { BusinessMaterial } from "./materials.js";

export type ImCredentialSource = (
  config: ImBotConfig,
  signal: AbortSignal,
) => Promise<string | undefined>;

/** 根据可信 Bot 配置的独立快照同步创建句柄；数据库及其迁移仍归宿主所有。 */
export type CreateSessionStore = (config: JsonObject) => ImSessionStore;

/** Gateway 专属业务依赖，在调用进程原生注入。 */
export interface GatewayDependencies extends ChannelDependencies {
  createSessionStore?: CreateSessionStore;
}

/** Manager 额外拥有工厂句柄；直接 sessions 仍为借用，不能与工厂同时配置。 */
export interface ImChannelManagerDependencies extends ImModuleDependencies {
  createSessionStore?: CreateSessionStore;
}
export interface ImModuleDependencies {
  prepareMaterials?: (
    config: JsonObject,
    signal: AbortSignal,
  ) => Promise<BusinessMaterial[]>;
  log?: RuntimeLog;
  kernel: Pick<
    GatewayExecutionContext,
    "invoke" | "interrupt" | "respondInteraction"
  >;
  /** 注册或 Manager 的生命周期，撤销连接、执行和投递权限。 */
  signal?: AbortSignal;
  authorizeSpace?: (spaceId: string) => void;
  credentials?: ImCredentialSource;
  sessions?: ImSessionStore;
  onDiagnostic?: (
    code: string,
    identity: { endpointId: string; runId?: string },
  ) => void;
}
