/**
 * 公共入口：向 SDK/Daemon 暴露接入能力和协议类型。
 * 装配由宿主显式完成；导入本包不会读配置目录、建立连接或启动 AgentRun。
 */
export { ImRuntime } from "./application/im-channel.js";
export { octoCliEnvironment } from "./execution/tool-environment.js";
export { ChannelGateway } from "./gateway.js";
export type { GatewayBot, ChannelGatewayOptions } from "./gateway.js";
export { ImChannelManager } from "./lifecycle/manager.js";
export { MemoryImSessionStore } from "./application/session-store.js";
export type {
  ImSessionStore,
  ImSessionBinding,
  ImSessionOccurrence,
} from "./application/session-store.js";
export type {
  ImGapMetadata,
  ImGapTurnToken,
} from "./application/context-gap.js";
export type {
  ImRulesContext,
  ImRulesVersions,
} from "./application/rules-context.js";
export type { ImInvocationInput } from "./execution/dispatcher.js";
export {
  validateImConfig,
  validateImBots,
  configuredCredential,
  imBotIdentity,
} from "./lifecycle/configuration.js";
export { buildImContexts } from "./transport/im-context/index.js";
export { registerBot, WukongConnection } from "./transport/wukong.js";
export type { ImMessage, BotRegistration } from "./transport/wukong.js";
export type * from "./contracts.js";
export type * from "./ports.js";
export * as imApi from "./transport/api/index.js";

export type { GatewayHook, GatewayHookContext, GatewayHookResult, GatewayInputs } from "./hooks.js";
