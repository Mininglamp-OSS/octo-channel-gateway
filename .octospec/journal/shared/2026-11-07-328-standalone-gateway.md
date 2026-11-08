---
type: Journal
title: Issue 328 独立 Gateway npm SDK 与 CLI
description: 从 Runtime 迁移渠道业务，继承原 octo-spec，以公开 client 接入既有 Kernel。
tags: [architecture, channel, installation]
timestamp: 2026-11-07T00:00:00Z
---

# 决定与验证

用户要求 Gateway 独立仓库，Runtime 不持有 Extra 机制或业务配置合同。新 worktree 完成原 octo-spec 继承、95 分规划后实施。

交付单独 npm SDK、ChannelRegistry 注册入口和 apps/cli 的服务/配置/日志命令。关闭只处理自身注册；Runtime 生命周期独立。业务代码、适用回归、会话/上下文/投递规则迁入本仓。

本地 543 项离线通过、1 项跳过；实际 npm 安装、包外类型及与本次 Runtime/client 归档互操作通过。真实 IM 和各平台原生服务验收仍待独立执行；详见[验证](../../tasks/328-standalone-gateway/validation.md)。未提交或发布。
