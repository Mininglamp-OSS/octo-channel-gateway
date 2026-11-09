---
type: Validation
title: Runtime 顶层启动提示验证
description: 配合 Runtime CLI 平铺更新 Gateway 提示及双语文档的实际验证。
tags: [docs, cli, validation]
---

# 变更与验证

配合 Mininglamp-OSS/octo-runtime#331，将 Runtime 未就绪提示、README 与中英文接入/排障页面中的启动命令更新为 `octo-runtime start`，同步两项提示断言。仅修正文案，不改变 Gateway 执行或服务管理行为；按小型文档/提示修正规则豁免独立架构 brief。

2026-11-08，macOS、Node 26.13.0，独立 worktree：

- npm run build、npm run typecheck 通过。
- node --test test/*.test.js：561 通过、1 显式跳过、0 失败。
- npm run docs:check：双语/链接检查及 2 项真实受控 Kernel 示例通过。
- 审查确认全部改动是旧启动命令替换及对应断言，两种语言一致；未增加兼容层或私有 Runtime 依赖。

验证使用既有公开包形态的 Runtime/client 2.0 候选缓存，在独立 node_modules 副本中运行。注册表 2.0.0 尚不可下载；这不证明候选已经发布。没有运行真实模型或系统服务安装。

## 独立审查

- Standards：approve。提示、双语页面、执行边界及候选包验证说明符合现存规则；独立重跑 1 项前置条件提示专项通过。
- Spec：approve。只修改启动说明与对应断言；专项覆盖 start/restart/run 的文本与 JSON 错误、endpoint 缺失/不可连接，并确认失败不访问服务管理器、不写配置。

两轴均未发现 P0/P1/P2，不替代 GitHub 非作者审批与受保护合并条件。
