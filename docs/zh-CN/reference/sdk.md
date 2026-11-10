# SDK 参考

[English](../../en/reference/sdk.md) | [文档目录](../README.md)

从 `@mininglamp-oss/octo-channel-gateway` 导入入口和类型，从公开 Runtime client 导入 KernelClient。详见[导出](../../../packages/gateway/src/index.ts)与[实现](../../../packages/gateway/src/gateway.ts)。

## ChannelGateway

`new ChannelGateway({ kernel, log?, signal? })` 借用宿主持有的 KernelClient。已撤销的 signal 拒绝构造；后续 abort 发起关闭，但仍须 await close 观察结果。log 接收诊断事件；显式启用 debug 时包含图片和凭据等完整输入。

`register(bot: GatewayBot, agent: ImAgentConfig): Promise<void>` 复制配置、认证 Bot 身份、检查 Kernel execution_ready，再新增或覆盖绑定，不返回句柄。调用按进入顺序串行。覆盖先校验，再清理旧绑定，最后启动新绑定；失败回滚新资源并保留清理错误。替代启动失败不自动恢复旧绑定，其他身份继续运行。

| GatewayBot 字段 | 合同 |
| --- | --- |
| apiUrl / bfToken | 平台地址/凭据；也可由 credentials 回调提供 token |
| botId / botName | 可选身份断言/展示名称；禁用绑定必须提供 botId |
| enabled | false 记录禁用绑定，不认证、不启动网络连接 |
| materials / loadMaterials | 静态命名 parts / 每轮动态命名 parts |
| materialLoading | timeout_ms / max_in_flight，默认 5000 / 8 |
| credentials | async (config, signal) 返回 token；回调配置仍使用内部 snake_case 字段 |
| authorizeSpace | 同步授权认证所得空间，抛错拒绝 |
| createSessionStore | 同步工厂；Gateway 拥有返回的句柄，宿主拥有数据库 |
| 其他渠道配置 | 沿用配置参考中的 snake_case 选项；agent 独立作为第二个参数 |

status 返回诊断快照。`close(): Promise<void>` 永久停止实例，在共享四秒截止内清理所有绑定；失败拒绝，重复调用返回同一 Promise。关闭后拒绝注册，重新运行须新建实例，可继续复用同一宿主 client。Gateway 不对借用 client 执行全局停止/排空/关闭，也不关闭 Kernel。见[生命周期与投递](../guides/lifecycle-and-delivery.md)。

ChannelRegistry、ChannelDefinition、ChannelRegistration 已移除；不兼容 endpoint/definition 或单个 {bot, agent} 参数。CLI JSON 仍使用 snake_case 和嵌套 bot.agent，由 CLI 映射成公开 API。

## 高级导出

MemoryImSessionStore、ImSessionStore/Binding/Occurrence 用于[会话管理](../guides/sessions.md)。ImRuntime、ImChannelManager、ImInvocationInput、build_im_contexts、registerBot、WukongConnection、imApi 等为高级编排入口，不是额外的通用插件协议；直接使用需自行满足所有权和准入合同。

validateImConfig/validateImBots 只校验本地结构，不证明凭据有效或 Provider 就绪。octoCliEnvironment 生成工具环境值，不安装 octo-cli。推荐从[共享 SDK 示例](../../examples/registration.mts)接入。

`BusinessMaterial` 为 `{ name: string, parts: ModelInputPart[] }`；静态材料用 `bot.materials`，每轮材料用 `loadMaterials`，均不接收旧 ContextItem 信封。覆盖、预算、图片完整性及迁移见[业务材料](../guides/contexts-and-credentials.md)。
