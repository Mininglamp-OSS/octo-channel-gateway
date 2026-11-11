# SDK 参考

[English](../../en/reference/sdk.md) | [文档目录](../README.md)

从 `@mininglamp-oss/octo-channel-gateway` 导入入口和类型，从公开 Runtime client 导入 KernelClient。详见[导出](../../../packages/gateway/src/index.ts)与[实现](../../../packages/gateway/src/gateway.ts)。

## ChannelGateway

`new ChannelGateway({ kernel, log?, signal? })` 借用宿主持有的 KernelClient。已撤销的 signal 拒绝构造；后续 abort 发起关闭，但仍须 await close 观察结果。log 接收诊断事件；完整输入日志由宿主 Hook 决定，SDK 不读取 debug 环境变量。 日志同步异常与异步拒绝会被消费，不等待日志 IO，不中断执行或资源清理。

`register(bot: GatewayBot, agent: ImAgentConfig, hooks?: readonly GatewayHook[]): Promise<void>` 复制配置、认证 Bot 身份、检查 Kernel execution_ready，再新增或覆盖绑定，不返回句柄。调用按进入顺序串行。覆盖先校验，再清理旧绑定，最后启动新绑定；失败回滚新资源并保留清理错误。替代启动失败不自动恢复旧绑定，永久启动失败返回 IM_CONNECTION_NOT_READY，并在 error.cause.message 保留脱敏连接错误码，回滚后仍可诊断；其他身份继续运行。 渠道初次连接的暂态失败保留已初始化绑定并进入 retrying；register 成功不等于 socket 当前在线。

| GatewayBot 字段 | 合同 |
| --- | --- |
| apiUrl / bfToken | 平台地址/凭据；也可由 credentials 回调提供 token |
| botId / botName | 必填 Bot 身份 / 可选展示名称；认证结果必须与 botId 一致 |
| enabled | false 记录禁用绑定，不认证、不启动网络连接 |
| credentials | async (config, signal) 返回 token；回调配置仍使用内部 snake_case 字段 |
| authorizeSpace | 同步授权认证所得空间，抛错拒绝 |
| createSessionStore | 同步工厂；Gateway 拥有返回的句柄，宿主拥有数据库 |
| 其他渠道配置 | 沿用配置参考中的 snake_case 选项；agent 独立作为第二个参数 |

status 返回诊断快照。`close(): Promise<void>` 永久停止实例，在共享四秒截止内清理所有绑定；失败拒绝，重复调用返回同一 Promise。关闭后拒绝注册，重新运行须新建实例，可继续复用同一宿主 client。Gateway 不对借用 client 执行全局停止/排空/关闭，也不关闭 Kernel。见[生命周期与投递](../guides/lifecycle-and-delivery.md)。

ChannelRegistry、ChannelDefinition、ChannelRegistration 已移除；不兼容 endpoint/definition 或单个 {bot, agent} 参数。CLI JSON 仍使用 snake_case 和嵌套 bot.agent，由 CLI 映射成公开 API。

## 高级导出

MemoryImSessionStore、ImSessionStore/Binding/Occurrence 用于[会话管理](../guides/sessions.md)。ImRuntime、ImChannelManager、ImInvocationInput、buildImContexts、registerBot、WukongConnection、imApi 等为高级编排入口，不是额外的通用插件协议；直接使用需自行满足所有权和准入合同。

validateImConfig/validateImBots 只校验本地结构，不证明凭据有效或 Provider 就绪。octoCliEnvironment 生成工具环境值，不安装 octo-cli。推荐从[共享 SDK 示例](../../examples/registration.mts)接入。

本次事件信息复用 channel 消息构建通道，渲染为独立 XML 文本输入；没有信息就不附带。见[渠道事件信息](../guides/contexts-and-credentials.md)。

## 应用层 Hooks

register 第三个参数传 [{ type, hook }]。两个点位统一使用 async (ctx, inputs, agentEnv)，返回 { inputs, agentEnv }。inputs 是 GatewayInputs（含 parts 的 canonical InvocationContent），不是裸 parts 数组。pre_dispatch 在每个新逻辑轮次准备时执行；pre_invoke 在 Gateway 每次实际调用 client 前执行。同点位按数组顺序串联，完整返回值替换上一稿，不隐式合并。注册复制数组，覆盖替换全部 Hooks。未知点位 warning 后忽略；没有 name、session_init 或 SDK 固定业务刷新周期。

ctx 是同链共享的只读快照：botId、sessionKey、sessionId、providerSession、generation、messageId、conversation、turn.index 和 signal。Gateway 管理路由与计数，宿主决定首轮或周期 prepend。DM/群/子区分别计数；reset 后 index 从 1 开始，准备失败不消耗轮次，同轮重试不递增。SDK 不自动注入 agent.instruction。Hook 不得改变 inputs 的身份/协议字段及已选 adapter/agent/workspace；模型、私有 items 与内容可以在协议校验范围内加工。

pre_dispatch 输出随本轮冻结。pre_invoke 可加工首次提交，冻结重试时只能观察并原样返回，否则 IM_HOOK_REPLAY_CHANGED 阻止提交。最终输入日志应放在链末尾。非法返回值或回调拒绝使准备失败；纯日志 Hook 应自行隔离故障。回调须响应 ctx.signal，宿主须 await gateway.close；拒绝取消的回调会导致清理失败，不伪报成功。Runtime 内部重试不是 Gateway Hook 事件。

参见[可类型检查的业务 Hook 示例](../../examples/hooks.mts)，通过 gateway.register(bot, agent, createBusinessHooks(readInstruction, shouldPrepend)) 安装，加载时传递 ctx.signal。SDK 不提供指令缓存或持久化。

点位选择、全部 ctx 字段、仅属于 CLI 的默认行为及 Electron 自有策略，见 [Hooks 专题](../guides/hooks.md)。
