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

入口 `ChannelRegistry.register(endpoint, definition)`。业务定义、函数、凭据、会话、准入和投递由 Gateway/应用管理，不实现 Extra、通用 JSON/schema、插件发现或 Kernel 渠道注册 RPC。

每次注册拥有独立 client、Manager 和渠道资源，不拥有 Kernel。关闭先停接纳，在共享截止内取消/消费所属执行、完成业务收尾，最后释放 client。失败可见，重复关闭结果相同；初始化失败走相同回滚路径。

保留迁移前准入、身份/代次、重试预算、投递、上下文和会话语义。取消 ACK 不等于终态，终态不等于投递成功，观察中断不自动重放。

工程记录使用中文，docs 开发者文档中英文同步；公开入口和复杂清理逻辑维护中文注释，默认不记录凭据。用户明确启用 `OCO_CHANNEL_GATEWAY_DEUBG=1` 时，允许完整 client 输入仅进入渠道 debug 日志（含图片和凭据），不得进入状态镜像。知识 Markdown 须有 type/title/description/tags。CI 按 ci-release 任务覆盖测试、文档、依赖和打包；真实外部服务专项仍显式运行，不扩大既有 CI 范围。

## agentEnv 合同

公开执行调用固定为 `invoke(inputs, sessionId, providerSession, agentEnv)`，取消为 `interrupt(invocationId, reason?)`。业务只提供 `bot.agent`，Gateway 编译为仅 schema/items 的 AgentEnv；非模型项不透明透传，凭据不进入正文。`agent.instruction` 为新 Provider 会话首轮和 fresh fallback 的普通文本前缀。模型材料选取规则保持，只更改 context 外层表示。使用 1.1.13 起的公开 client 与 IPC v2；不保留旧 request/contexts/signal、instructions 或配置投影兼容层。
