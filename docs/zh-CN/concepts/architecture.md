# 架构与所有权

[English](../../en/concepts/architecture.md) | [文档目录](../README.md)

Gateway 的执行依赖只有公开 `@mininglamp-oss/octo-runtime-client`。一个消息先经过平台认证、群/发送者准入和会话定位，再准备业务材料，通过 client 调用 Kernel，最后消费执行事件并向原渠道投递。投递结果不等同于执行结果。

| 层                  | 职责                                                | 生命周期所有者            |
| ------------------- | --------------------------------------------------- | ------------------------- |
| 宿主应用            | 凭据、业务材料、授权策略、自有存储、Kernel 启动     | 应用                      |
| Gateway SDK         | Bot 连接、准入、会话/代次、输入组装、回复和产物投递 | 每次 ChannelRegistry 注册 |
| Gateway CLI         | 配置文件、系统服务、日志、进程信号                  | CLI / 系统服务管理器      |
| Runtime client      | 连接既有 endpoint、执行调用、观察与中断             | 注册独占 client           |
| Kernel/Core/Adapter | 接纳执行、执行信封解析、Provider 调用及原生取消     | Runtime 宿主              |
| Provider            | 模型/工具执行和原生会话                             | Provider                  |

register 不向 Kernel 注册插件或渠道定义，只在当前进程装配本仓对象并连接 Kernel。函数不会序列化到 IPC。close 只关闭自己取得的句柄；共享 Kernel、兄弟注册、宿主数据库不归它所有。

本仓不包含 WebUI/WeCom，不定义 Extra 发现或统一插件 JSON。当前 SDK 仍导出部分高级内部编排类型，例如 ImInvocationInput；常规接入使用 ChannelRegistry，避免自行拼装内部草稿。其 `contexts` 不属于 Runtime 新调用合同，见[输入与执行环境](inputs-and-agent-env.md)。

实现入口：[registry](../../../packages/gateway/src/registry.ts)、[公开导出](../../../packages/gateway/src/index.ts)、[执行输入边界](../../../packages/gateway/src/execution/kernel-input.ts)。

## 目标入口与宿主生命周期

约定的目标名称是 **ChannelGateway**：一个实例持有多组 Bot ↔ Agent 绑定，并在两端之间转发消息。Registry 更适合内部注册集合的名称。目标操作为 `await gateway.register({ bot, agent })`，返回 `Promise<void>`，最后通过幂等的 `await gateway.close()` 统一关闭，不暴露每次注册的独立句柄。Bot 与 Agent 是平级端点；Agent 参数的具体类型留待接口迁移设计明确。

这是架构目标，**不是当前已经导出的 API**。当前实现及前文接入说明仍使用 ChannelRegistry 和注册句柄；本次文档更新不引入 ChannelGateway 实现或宿主控制 RPC。

SDK 负责自建连接、准入、会话映射、Agent 调用、投递及资源清理。单次注册失败只回滚本次资源；若整批注册需要退出，由宿主关闭 Gateway。关闭时停止接纳、协调尚未完成的初始化，在共享截止内收尾所属执行并释放全部绑定；不关闭宿主持有的 Agent/Engine 或共享 Kernel。

进程生命周期属于宿主。CLI 使用已有 online 前台循环和退出处理；Electron 使用自己的事件循环和异步退出协调。SDK 不实现 `waitForShutdown()`、保活主循环、signal/exit handler、Electron app 控制、PID 查找、单实例限制或系统服务管理。真实连接需要的网络观察、重连和心跳仍由 SDK 负责。通过公开 Runtime client 连接执行 IPC 也属于 SDK；用于控制另一个 Gateway 宿主进程的 IPC 属于宿主。
