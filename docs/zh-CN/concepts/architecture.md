# 架构与所有权

[English](../../en/concepts/architecture.md) | [文档目录](../README.md)

Gateway 的执行依赖只有公开 `@mininglamp-oss/octo-runtime-client`。一个消息先经过平台认证、群/发送者准入和会话定位，再准备业务材料，通过 client 调用 Kernel，最后消费执行事件并向原渠道投递。投递结果不等同于执行结果。

| 层                  | 职责                                                | 生命周期所有者            |
| ------------------- | --------------------------------------------------- | ------------------------- |
| 宿主应用            | 凭据、业务材料、授权策略、自有存储、Kernel 启动     | 应用                      |
| Gateway SDK         | Bot 连接、准入、会话/代次、输入组装、回复和产物投递 | ChannelGateway 实例 |
| Gateway CLI         | 配置文件、系统服务、日志、进程信号                  | CLI / 系统服务管理器      |
| Runtime client      | 连接既有 endpoint、执行调用、观察与中断             | 宿主应用           |
| Kernel/Core/Adapter | 接纳执行、执行信封解析、Provider 调用及原生取消     | Runtime 宿主              |
| Provider            | 模型/工具执行和原生会话                             | Provider                  |

register 不向 Kernel 注册插件或渠道定义，只在当前进程装配本仓对象并借用宿主提供的 client。函数不会序列化到 IPC。close 只关闭自己取得的句柄；共享 Kernel、其他 Gateway 实例、宿主数据库不归它所有。

本仓不包含 WebUI/WeCom，不定义 Extra 发现或统一插件 JSON。当前 SDK 仍导出部分高级内部编排类型，例如 ImInvocationInput；常规接入使用 ChannelGateway，避免自行拼装内部草稿。其 `contexts` 不属于 Runtime 新调用合同，见[输入与执行环境](inputs-and-agent-env.md)。

实现入口：[ChannelGateway](../../../packages/octo-channel-gateway-sdk/src/gateway.ts)、[公开导出](../../../packages/octo-channel-gateway-sdk/src/index.ts)、[执行输入边界](../../../packages/octo-channel-gateway-sdk/src/execution/kernel-input.ts)。

## 公开入口与宿主生命周期

公开入口是 **ChannelGateway**：一个实例持有多组 Bot ↔ Agent 绑定，并在两端之间转发消息。Registry 更适合内部注册集合的名称。操作为 `await gateway.register(bot, agent)`，返回 `Promise<void>`，最后通过幂等的 `await gateway.close()` 统一关闭，不暴露每次注册的独立句柄。Bot 与 Agent 是两个参数，Agent 使用 ImAgentConfig。

ChannelRegistry 和独立注册句柄已移除，不提供兼容包装。CLI 宿主负责将配置文件映射到 SDK 接口。

SDK 负责自建连接、准入、会话映射、Agent 调用、投递及资源清理。单次注册失败只回滚本次资源；若整批注册需要退出，由宿主关闭 Gateway。关闭时停止接纳、协调尚未完成的初始化，在共享截止内收尾所属执行并释放全部绑定；不关闭宿主持有的 Agent/Engine 或共享 Kernel。

构造方式为 `new ChannelGateway({ kernel })`，其中 kernel 是宿主注入的公开 `KernelClient`。`@mininglamp-oss/octo-runtime-client@1.1.14` 已导出该类型；宿主可用 attachKernel 连接既有服务，或用完整 Runtime 的 createKernelService 初始化服务后传入 service.client。Runtime 接入和 client 所有权属于宿主，Agent 配置属于每个 Bot 绑定。Gateway 不能关闭借用 client，也不能调用其全局 invocations.stopAdmission()/drain()；必须独立跟踪、取消和收尾自己的执行。

register 的语义是动态添加或去重覆盖：运行中可继续注册，新身份添加，同身份更新整个绑定，无需全局 close/start。IM 身份由渠道类型、规范化 API 地址和显式传入且经认证校验的 Bot ID 确定，token 轮换不改变身份。同身份操作按调用顺序串行处理；先校验配置与身份，再清理旧绑定，最后启动新绑定，不同时运行两套接纳连接。校验失败保留旧绑定；旧资源清理失败禁止启动新绑定；旧绑定关闭后新绑定启动失败，则清理新资源并明确报告未运行，不承诺自动恢复旧配置。其他身份不受影响。

close 是整个实例的终止操作，成功才表示全部所属资源已清理；失败或超时必须可观察，关闭后不可继续注册。详细的资源清单、并发与宿主退出要求见[嵌入与关闭合同](../guides/lifecycle-and-delivery.md)。

进程生命周期属于宿主。CLI 使用已有 online 前台循环和退出处理；Electron 使用自己的事件循环和异步退出协调。SDK 不实现 `waitForShutdown()`、保活主循环、signal/exit handler、Electron app 控制、PID 查找、单实例限制或系统服务管理。真实连接需要的网络观察、重连和心跳仍由 SDK 负责。通过公开 Runtime client 连接执行 IPC 也属于 SDK；用于控制另一个 Gateway 宿主进程的 IPC 属于宿主。

[Hooks 专题](../guides/hooks.md) 区分了 CLI 的 instruction/debug 行为与 Electron 等应用宿主自行实现的业务策略。
