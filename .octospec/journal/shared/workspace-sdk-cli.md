---
type: Journal
title: "Issue 36：SDK 与 CLI 源码包分层"
description: 私有工作区包、根发行装配及宿主源码组合验证。
tags: [architecture, workspace, release]
timestamp: 2026-11-11T09:00:00Z
---

2026-11-11：按 issue 36 拆出 SDK、CLI、cross-service 的依赖与构建边界。78 个 SDK 文件原样迁移，根发行 facade/命令保持。独立宿主验证本地 0.0.0 Runtime Client/protocol 选择，独立归档验证完整生产闭包、声明、worker 和版本；结果见任务 validation。

学习已提升到 architecture 规则：pnpm override 可强制源码选包，但原 semver 与 0.0.0 不匹配时不保证递归构建排序，宿主须先构建 Runtime protocol/Client。专项入口保留手动，本地 CI 按现有步骤复现，不扩围。

同日按用户追加授权完成双轴 code review：Standards 与 Spec 均无待修复问题。另从暂存内容导出干净源码，冻结安装、独立构建/类型检查、文档与根 CLI 入口均通过；按授权提交并创建待审 PR，不执行合并。
