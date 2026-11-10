---
type: Rule
title: Channel Gateway 独立 SDK 边界
description: 渠道业务独立管理，通过公开 Runtime client 调用已有执行服务。
tags: [architecture, channel, lifecycle]
id: gateway-architecture
tier: repo
priority: 100
load_bearing: true
inject_when:
  paths: ["**"]
  touches: [architecture, channel, lifecycle]
source: self
supersedes: []
---

# 架构

独立渠道仓库，源自 octo-runtime Issue 328。执行只依赖公开 `@mininglamp-oss/octo-runtime-client`，协议从 `/protocol` 导入，不依赖完整 Runtime、私有 Core/Kernel/Host/Adapter SDK 或 `/internal`。

公开入口为 `ChannelGateway`：它连接 Bot 与 Agent、转发消息并管理所属连接的生命周期；`Registry` 只适合作为内部注册集合的名称。业务定义、函数、凭据、会话、准入和投递由 Gateway/应用管理，不实现 Extra、通用 JSON/schema、插件发现或 Kernel 渠道注册 RPC。

## SDK 与宿主范围

公开 API 为实例方法 `await gateway.register(bot, agent): Promise<void>` 和 `await gateway.close(): Promise<void>`。一个 Gateway 可在循环中注册多组 Bot ↔ Agent 绑定；不向业务方暴露独立 registration/close 句柄。Bot 与 Agent 是两个参数；Bot 提供平台连接与认证信息，Agent 提供 adapter、模型、instruction、MCP 等执行定义。Agent 参数使用 ImAgentConfig；Bot 使用 GatewayBot，内部与 CLI 配置继续采用 ImBotConfig。

宿主负责 Runtime 接入，向 `new ChannelGateway({ kernel })` 注入公开 `KernelClient`。`attachKernel()` 返回 client；自建模式使用完整 Runtime 的 `createKernelService()`，初始化后传入 service.client。SDK 只依赖公开 client 类型，不创建 Kernel，也不接管注入 client 的所有权。Agent 是每个绑定的执行定义，不再承担 Runtime endpoint 选择。Gateway 拥有 Manager 和自建渠道资源，不拥有共享 client、Kernel、宿主 Engine/Agent 或数据库。

### register：动态添加与去重覆盖

`register()` 必须保留为统一入口，可在 Gateway 运行中多次调用；成功即本次绑定初始化完成并开始工作，无需额外 start，也无需先关闭整个 Gateway。IM 去重键沿用渠道类型、规范化平台 API 地址、经认证确认的 Bot ID；不使用 bfToken、Bot 名称或 Agent 配置作为身份。只提供 apiUrl/bfToken 时，须先认证取得稳定 Bot ID；token 轮换不能生成重复绑定。

不同身份新增，同一身份覆盖完整绑定配置。同一身份的操作串行，按调用顺序处理，不允许迟到初始化覆盖后一次操作；实现可以采用已有 Manager 的全局串行队列。覆盖先校验配置和认证身份，再停止旧绑定接纳并完成旧资源清理，之后启动新绑定；不得双连接同时接纳。相同配置重复注册也不得累积连接、监听器或定时器，不要求对包含函数的配置做深比较。

校验失败不得拆除旧绑定；旧资源清理失败则不启动替代绑定，保留未清理资源的跟踪并报告失败。旧绑定清理后新绑定启动失败，清理本次取得的全部资源，该身份保持未运行，不承诺无缝切换或自动恢复旧配置。其他身份不受单次失败影响。宿主若要求整批失败即退出，在自己的 finally 中 await gateway.close；SDK 不以清空引用代替回滚。

### close：宿主可等待的资源清理边界

`close()` 由宿主调用，是整个 Gateway 的终止操作。它统一停止全部绑定的新消息/执行接纳，在共享截止内取消并消费所属执行、收尾投递和回调，最后释放自建连接。开始关闭后拒绝新注册，取消排队注册并协调进行中的初始化/覆盖；异步创建晚到的资源仍须纳入清理，不能在关闭后重新加入。关闭后的实例不可重启，重新运行须创建新实例。重复 close 复用相同 Promise 与结果。

宿主只需 await gateway.close，不应枚举内部注册或释放内部资源。成功必须表示所属 Bot socket、重连/心跳定时器、事件监听、执行观察任务、材料回调、会话存储工厂句柄与投递任务均已结束或释放，不再后台重连/投递。SDK 独立跟踪自身 invocation，只取消并收尾这些执行；禁止调用借用 client 的全局 invocations.stopAdmission()/drain()/close()，禁止影响其他使用者。

任一清理失败仍须继续尝试其余资源，最后聚合错误及未完成项。超时只表示等待结束，不表示已释放；不配合取消的宿主回调须报告未完成，不能以静默超时伪造成功。失败不遗失资源身份或启动新的后台重试。宿主在 Gateway 清理后释放自己拥有的 client / Kernel Service / Engine；前一项失败也必须继续尝试后续清理，并保留全部失败结果。借用外部 Kernel 时不得关闭该服务。

迁移验收须本地验证：运行中新增；同身份重复/覆盖和 token 轮换；并发覆盖顺序；校验/初始化/旧资源清理失败；register 与 close 竞争；重复 close；回调拒绝取消；单个清理失败仍继续；共享 client 的其他使用者不受影响。重复注册/关闭后不得有残留连接、计时器、监听器或任务；同时核对实际任务身份，不能只用进程退出或句柄计数证明清理完成。不因此扩大默认测试或 GitHub CI。

| SDK 负责 | CLI / Electron 等宿主负责 |
| --- | --- |
| Bot 连接、消息转换、准入、会话映射、Agent 调用、结果投递和所属资源清理 | 创建 Gateway、提供 Bot/Agent 定义、决定注册和关闭时机 |
| 已注册连接所需的网络观察、重连、心跳及内部资源取消 | CLI 的 online 前台主循环、Electron 事件循环、等待退出、进程退出策略 |
| 通过公开 Runtime client 进行执行 IPC 通信 | SIGINT/SIGTERM、Electron before-quit、进程 signal/exit handler、PID/单实例检查、系统服务和宿主控制 IPC |

SDK 不提供或调用 `waitForShutdown()`，不启动只为保持进程存活而存在的循环，不接管 `process.exit` 或 Electron app 生命周期，也不要求宿主使用某一种主循环。CLI 已有 online 逻辑时直接复用，并在退出/失败路径 await close；Electron 在自己的异步退出协调中 await close。已有其他 PID 运行时，查找实例、通过控制 IPC 通知它或重启它均由宿主决定；SDK 不跨进程寻找或修改另一实例。此约束不禁止 SDK 用公开 client 连接 Runtime 的执行 IPC。

## 迁移状态

ChannelGateway 为当前公开接口，已移除 ChannelRegistry、ChannelDefinition、ChannelRegistration，不设兼容层。CLI 显式 attachKernel，先 await gateway.close 再关闭自己的 client；SDK 接入示例同步反映此所有权。

保留迁移前准入、身份/代次、重试预算、投递、上下文和会话语义。取消 ACK 不等于终态，终态不等于投递成功，观察中断不自动重放。

工程记录使用中文，docs 开发者文档中英文同步；公开入口和复杂清理逻辑维护中文注释，默认不记录凭据。用户明确启用 `OCO_CHANNEL_GATEWAY_DEUBG=1` 时，允许完整 client 输入仅进入渠道 debug 日志（含图片和凭据），不得进入状态镜像。知识 Markdown 须有 type/title/description/tags。CI 按 ci-release 任务覆盖测试、文档、依赖和打包；真实外部服务专项仍显式运行，不扩大既有 CI 范围。

## agentEnv 合同

公开执行调用固定为 `invoke(inputs, sessionId, providerSession, agentEnv)`，取消为 `interrupt(invocationId, reason?)`。业务提供 Agent 执行定义（当前实现路径为 `bot.agent`），Gateway 编译为仅 schema/items 的 AgentEnv；执行项不透明透传，凭据不进入正文。`agent.instruction` 为新 Provider 会话首轮和 fresh fallback 的普通文本前缀。业务材料使用已实现的 `{ name, parts }` 合同，文本/图片进入 inputs，执行扩展独立进入 AgentEnv。渠道自动材料的注入/省略规则保持。使用 1.1.13 起的公开 client 与 IPC v2；不保留旧 request/contexts/signal、instructions 或配置投影兼容层。
