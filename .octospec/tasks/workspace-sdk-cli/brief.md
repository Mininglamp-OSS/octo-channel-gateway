---
type: Task
title: "Issue 36：SDK、CLI 与根发行包分层"
description: 建立私有源码工作区包，保持公共发行入口与业务合同。
tags: [architecture, channel, lifecycle, docs]
timestamp: 2026-11-11T00:00:00Z
slug: workspace-sdk-cli
upstream: Mininglamp-OSS/octo-channel-gateway#36
source: self
---

## Goal

按 issue 36 建立 SDK、CLI、cross-service 独立包。根发行包保持名称、SDK 导出和命令；宿主通过 workspace:* 消费同一 SDK。

## Load-bearing list

- architecture：唯一实现、跨包 exports、依赖拓扑、发布闭包。
- channel / lifecycle：注册、Hooks、会话句柄和借用 client 清理合同不变。
- docs：双语说明源码组合、本地 Runtime 选择与发布装配。

## Out of scope

- Runtime 改造、协议变化、SDK 业务变化、下游 submodule 更新、CI 扩围。

## Acceptance

- 唯一包名、独立声明/构建、冻结锁文件安装、拓扑构建与类型检查通过。
- 现有业务回归、文档与 spec 检查通过。
- 本地手动验证独立宿主 workspace 的真实入口、Runtime/client 与 protocol 本地解析，包括 0.0.0 与 semver 不匹配场景。
- 发布包脱离 checkout 安装，SDK/CLI/声明和生产依赖可解析，无 workspace:* 或源码链接。
- 相对 origin/main 无 workflow diff，无新增默认专项验证。

## Plan And Score

1. SDK 目录迁移；三个私有包 manifest、tsconfig、exports 和 workspace 依赖。
2. 根 facade 与私有包发布装配；更新现有验证引用。
3. 双语说明、手动宿主组合验证、现有 gates 和差异审查。

可执行度 97/100（实施前评估，不代替实际验证）。用户已授权超过 95 后实施。
