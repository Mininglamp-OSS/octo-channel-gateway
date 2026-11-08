---
type: Task
title: Gateway 中英文开发者文档
description: 参照 Runtime 的双语目录与共享示例验证方式建立独立渠道文档。
tags: [docs, architecture, channel, lifecycle, session, context]
---

# 目标与授权

用户要求按 octo-runtime 的中英文文档组织，为独立 Gateway 写一套 docs。延续当前工作树；本次只调整文档、共享示例、显式文档验证及必要入口。用户指令已明确授权，无额外需求决策。

# 承重范围

- docs/en 与 docs/zh-CN 同路径、同主题、互相切换；共用 docs/examples，保持代码块一致。
- 从 CLI/SDK 两条入门路线，进入架构、输入/执行环境、会话/身份、材料、生命周期/投递、排障、迁移和依赖升级；提供 SDK、CLI、配置参考及维护记录。
- 以当前公开源码为准；不复制 Runtime 旧 Extra 架构。说明残留 CLI 兼容和内部草稿，不宣称已彻底消除。
- SDK 仅连接已有 Kernel；凭据、回调、同步会话句柄及关闭所有权可核对。区分回调取消 signal 与 KernelClient.invoke 不接受 signal。
- 中英文文档是本次用户明确要求，优先于本仓默认中文文档约定；过程记录仍中文。

# 可执行性

规划准备评分 96/100：文档组织 25/25（已读 Runtime 双语目录和检查脚本）；API 来源 25/25（registry/ports/contracts/CLI）；验证 24/25（类型、双语代码一致、链接、真实 Kernel fixture）；范围控制 22/25（尚未发布候选和真实平台明确单列）。评分不替代验证结果。

# 验收与范围外

两语言主题一一对应；页面都有对应语言及目录链接；本地链接有效；共享 TypeScript 示例类型检查及受控运行通过；CLI 文档与 help 对齐。根 README 提供入口，维护页记录实际日期和范围。不得改业务行为、新增兼容层、改服务、发布包或扩大 CI。文档检查作为显式脚本运行。

# 追加授权：Runtime 前置依赖

用户要求 CLI 与 SDK 模式都说明 Runtime 依赖，CLI start 时提示 Runtime 安装和启动。纳入 start/restart/run 只读就绪检查：缺 endpoint 或 Kernel 未就绪时，在 Gateway 服务变更前失败，普通/JSON 输出都有安装、启动、诊断和 endpoint 指引。不把完整 Runtime 自动装进生产依赖，不接管共享 Kernel。加入启动回归验证；此项是用户追加的行为变更，替代原纯文档范围限制。

## 2026-11-08 追加交付授权

用户要求完成 Runtime 后，将 octo-channel-gateway 也提交 PR 并合并 main。授权覆盖当前工作树的独立 SDK/CLI、agentEnv 适配、双语文档和 Runtime 前置提示；替代此前不提交/不推送的范围限制。不发布 npm/tag，不修改仓库保护或代替他人批准。
