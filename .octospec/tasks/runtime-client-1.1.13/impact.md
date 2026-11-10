---
type: Reference
title: Runtime 1.1.13 迁移影响清单
description: 对照生产代码、测试、文档、手动验证与既有 CI 的迁移边界。
tags: [migration, validation, documentation, ci]
---

# 逐项清单

| 范围 | 变更与检查 |
| --- | --- |
| 依赖与最低版本 | package.json/lock 两个上游包到 1.1.13；runtime-prerequisite 与 CLI help 同步。源码版本 0.0.0 不变。 |
| 生产调用 | dispatcher、kernel-input、model-input、task、im-channel、配置和日志：新信封、目录准备、OpenClaw 私有项、instruction、完整 debug 输入。CLI 原有 attachKernel 路径核对，无新增 Engine。 |
| 既有单测 | kernel-input/model-context/run-context、mention/context-extension/loader/gap、task/retry/runtime/protocol、CLI、凭据与预算等迁移已有断言；mock/fixture 删除旧投影与内部工厂路径。未增加默认测试入口。 |
| 新功能专项 | scripts/verify-runtime-1.1.13.mjs 显式运行 9 项，覆盖 instruction 生命周期、私有透传、目录、图片 debug、异步日志失败及 Engine 所有权/故障清理，不加入 package scripts 或默认 glob。 |
| 公共发行消费 | 原有 verify-distribution/verify-package 脚本本地运行；独立 registry 安装及三个归档的真实 IPC 消费通过，不增加 CI job。 |
| Engine 测试宿主 | verification-kernel、im-diagnostic-host、im-retry-live-host 显式绑定 executable/Home 并维护 Engine，返回公开 attached client，完整清理资源。仅开发工具使用完整 Runtime。 |
| Provider/IM 手动工具 | features/artifacts/model-wait/opencode/codebuddy/history-intent/retry/diagnostic 脚本迁移到公开四参数调用、显式宿主 Engine；连接脚本只注入 kernel。移除私有 loadCliAdapters、旧聚合 Adapter 导出和旧 runtimeFixtureUrl 翻译器。CodeBuddy 使用公开终态与原有 ACP/native 证据。 |
| 双语文档 | concepts/inputs-and-agent-env、getting-started/cli/sdk、guides/contexts-and-credentials/dependencies/migration/troubleshooting/ci-release、reference/configuration/sdk 同路径中英文同步；共享类型示例增加 instruction。历史版本样本不批量更改。 |
| Octospec | brief/design/plan/assessment/context/validation、规则当前合同与任务目录同步。规划评分与实际验证分别记录。 |
| GitHub CI | 相对 origin/main 没有 workflow diff；未新增 workflow/job/matrix/触发条件/必需状态/Gate 依赖，也未在既有 job 中添加专项步骤。package scripts、test:ci globs 与实际选取范围保持。 |

结果及未验范围见 [验证记录](validation.md)。
