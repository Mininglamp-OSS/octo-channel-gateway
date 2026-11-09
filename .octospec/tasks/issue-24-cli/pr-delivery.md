---
type: Task
title: 英文 PR 交付与关联问题
description: 用户授权提交并创建 main PR，补齐 issue 23 依赖审计，关联 fixes 23 与 24。
tags: [cli, docs, review]
---

# 授权与范围

2026-11-09 用户明确要求英文 PR 到 main 并 fixes 相关 issue，授权本工作树实现的提交与推送。此授权替代前述任务记录中的“不提交或 PR”，不包含合并和 CI 扩张。

# Issue 23 审计

当前 production 导入只使用公开 client/protocol；完整 Runtime ^1.1.12 留在 devDependencies，用于真实 Kernel、公开 executor-core 归一化和包外验证。逐项核对 test、test-support、scripts 中的完整 Runtime 导入及动态内部解析，双语 dependencies 文档列出实际用途、可使用公开协议或受控夹具替代的部分、保留理由与内部路径风险。runtime-module 从安装发行物定位，不依赖 checkout，但不是公开 API。决策为保留开发依赖，不改锁文件；此追加工作完成了此前仅做 README 的剩余审计要求。

# PR 内容

Fixes Gateway #23、#24。Runtime #334/#335 仅为后续协议工作，本 PR 不声明修复。提交使用英文并保留已配置 author，附 Codex co-author trailer。按仓库模板填写 Linked Spec 与 COMPREHENSION；不执行合并。

# 提交前验证

远端 main API 与 fetch 均确认基线 9ce35ccbc3a8c55abe6890913c295dd622b49170，无上游差异。追加依赖文档后 docs:check（17 对、36 Markdown、182 链接、4 JSON 块、2 执行测试）、spec lint 与 diff --check 通过。CLI 描述同步 start 更新参数和 doctor 实际诊断范围；build 与 CLI 16 项回归通过。功能完整回归和包外证据见各任务 validation，不将此前未提交构建冒称为新提交的构建。

相对 main 的 .github 与 pnpm-lock.yaml diff 为空。远端 main 实际检查包含四个 Check（Ubuntu Node 24/26、macOS Node 24、Windows Node 24）、spec、CI Gate，以及 Dependabot 检查。本 PR 没有新增检查或改变门禁依赖。
