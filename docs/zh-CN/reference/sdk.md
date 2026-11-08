# SDK 参考

[English](../../en/reference/sdk.md) | [文档目录](../README.md)

主入口从 `@mininglamp-oss/octo-channel-gateway` 导入。协议类型从公开 client 的 `/protocol` 导入，不依赖 Runtime 私有包。完整类型以[导出](../../../packages/gateway/src/index.ts)和[注册合同](../../../packages/gateway/src/registry.ts)为准。

## ChannelRegistry.register

`register(endpoint: string, definition: ChannelDefinition): Promise<ChannelRegistration>`。校验 Bot，复制配置、创建独立 client 与 Manager，检查 Kernel execution_ready 后启动 Bot。已 abort 的 signal 会拒绝；任何中途失败都回滚取得的资源，回滚失败以 AggregateError 保留。

| ChannelDefinition 字段 | 合同                                                                 |
| ---------------------- | -------------------------------------------------------------------- |
| bot                    | 必填 ImBotConfig，一个注册一个 Bot，见配置参考                       |
| loadContexts           | 可选，每轮 (config, {signal}) 返回 readonly ContextItem[] 或 Promise |
| contextLoading         | 可选 timeout_ms / max_in_flight；默认 5000 / 8                       |
| credentials            | 可选 async (config, signal) → string 或 undefined；省略时读 bf_token |
| authorizeSpace         | 可选同步 (spaceId) → void；不允许时抛错，spaceId 来自认证结果        |
| createSessionStore     | 可选同步 (config) → ImSessionStore；宿主拥有数据库，注册拥有返回句柄 |
| log                    | 可选 (level, message, fields?)；处理脱敏事件，勿自行加入秘密         |
| signal                 | 可选，撤销整个注册生命周期，不是 invoke 参数                         |

## ChannelRegistration

| 成员     | 含义                                                                |
| -------- | ------------------------------------------------------------------- |
| endpoint | 本次注册连接的执行端点                                              |
| status   | 只读 Bot 状态快照数组，供诊断；不是事件订阅                         |
| close()  | Promise<void>；停接纳并关闭所属资源，重复返回同一 Promise，失败拒绝 |

SDK 不直接返回某轮 invocation handle；渠道内部管理调用与 /stop。直接使用 client 的应用自行保管 handle.invocationId 并调用 interrupt。

## 高级导出

MemoryImSessionStore、ImSessionStore/Binding/Occurrence 用于[会话管理](../guides/sessions.md)。ImRuntime、ImChannelManager、ImInvocationInput、build_im_contexts、registerBot、WukongConnection、imApi 等为高级编排入口，不是额外的通用插件协议；直接使用需自行满足所有权和准入合同。

validateImConfig/validateImBots 只校验本地结构，不证明凭据有效或 Provider 就绪。octoCliEnvironment 生成工具环境值，不安装 octo-cli。推荐从[共享 SDK 示例](../../examples/registration.mts)接入。
