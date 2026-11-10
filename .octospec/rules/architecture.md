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

公开入口的目标命名为 `ChannelGateway`：它连接 Bot 与 Agent、转发消息并管理所属连接的生命周期；`Registry` 只适合作为内部注册集合的名称。业务定义、函数、凭据、会话、准入和投递由 Gateway/应用管理，不实现 Extra、通用 JSON/schema、插件发现或 Kernel 渠道注册 RPC。

## SDK 与宿主范围

目标公开 API 为实例方法 `await gateway.register({ bot, agent }): Promise<void>` 和 `await gateway.close(): Promise<void>`。一个 Gateway 可在循环中注册多组 Bot ↔ Agent 绑定；不向业务方暴露独立 registration/close 句柄。Bot 与 Agent 是平级端点；Bot 提供平台连接与认证信息，Agent 提供执行连接及模型、instruction、MCP 等执行定义。Agent 参数的具体类型在接口迁移任务中确定，不能把尚未明确的执行对象或连接配置假定为既定合同。

Gateway 内部拥有各注册创建的 client、Manager 和渠道资源，不拥有共享 Kernel、宿主创建的 Engine/Agent 或宿主数据库。`register()` 等待本次初始化完成；失败回滚本次已取得的资源，不自动撤销此前成功的注册。宿主若要求整批注册失败即退出，应在自己的 finally 中调用 `gateway.close()`。

`close()` 由宿主调用，统一停止全部绑定的新消息/执行接纳，在共享截止内取消并消费所属执行、收尾投递和回调，最后释放自建连接。开始关闭后拒绝新注册，等待或撤销进行中的初始化，防止关闭完成后资源重新加入。重复 close 复用相同关闭结果；失败明确可见。释放借用执行连接不等于关闭宿主的 Agent/Engine 或共享 Kernel。

| SDK 负责 | CLI / Electron 等宿主负责 |
| --- | --- |
| Bot 连接、消息转换、准入、会话映射、Agent 调用、结果投递和所属资源清理 | 创建 Gateway、提供 Bot/Agent 定义、决定注册和关闭时机 |
| 已注册连接所需的网络观察、重连、心跳及内部资源取消 | CLI 的 online 前台主循环、Electron 事件循环、等待退出、进程退出策略 |
| 通过公开 Runtime client 进行执行 IPC 通信 | SIGINT/SIGTERM、Electron before-quit、进程 signal/exit handler、PID/单实例检查、系统服务和宿主控制 IPC |

SDK 不提供或调用 `waitForShutdown()`，不启动只为保持进程存活而存在的循环，不接管 `process.exit` 或 Electron app 生命周期，也不要求宿主使用某一种主循环。CLI 已有 online 逻辑时直接复用，并在退出/失败路径 await close；Electron 在自己的异步退出协调中 await close。已有其他 PID 运行时，查找实例、通过控制 IPC 通知它或重启它均由宿主决定；SDK 不跨进程寻找或修改另一实例。此约束不禁止 SDK 用公开 client 连接 Runtime 的执行 IPC。

## 迁移状态

以上是用户确认的目标边界。当前代码仍导出 `ChannelRegistry.register(endpoint, definition)` 并返回注册句柄，尚未迁移成实例级 `ChannelGateway`。架构文档不得把目标示例标成当前可运行 API；此次规范补充本身不新增 wait/online/PID/控制 IPC 功能。已实现的材料接口与执行调用合同继续适用，直到接口迁移同步更新代码、CLI、SDK 示例和验证。

保留迁移前准入、身份/代次、重试预算、投递、上下文和会话语义。取消 ACK 不等于终态，终态不等于投递成功，观察中断不自动重放。

工程记录使用中文，docs 开发者文档中英文同步；公开入口和复杂清理逻辑维护中文注释，默认不记录凭据。用户明确启用 `OCO_CHANNEL_GATEWAY_DEUBG=1` 时，允许完整 client 输入仅进入渠道 debug 日志（含图片和凭据），不得进入状态镜像。知识 Markdown 须有 type/title/description/tags。CI 按 ci-release 任务覆盖测试、文档、依赖和打包；真实外部服务专项仍显式运行，不扩大既有 CI 范围。

## agentEnv 合同

公开执行调用固定为 `invoke(inputs, sessionId, providerSession, agentEnv)`，取消为 `interrupt(invocationId, reason?)`。业务提供 Agent 执行定义（当前实现路径为 `bot.agent`），Gateway 编译为仅 schema/items 的 AgentEnv；执行项不透明透传，凭据不进入正文。`agent.instruction` 为新 Provider 会话首轮和 fresh fallback 的普通文本前缀。业务材料使用已实现的 `{ name, parts }` 合同，文本/图片进入 inputs，执行扩展独立进入 AgentEnv。渠道自动材料的注入/省略规则保持。使用 1.1.13 起的公开 client 与 IPC v2；不保留旧 request/contexts/signal、instructions 或配置投影兼容层。
