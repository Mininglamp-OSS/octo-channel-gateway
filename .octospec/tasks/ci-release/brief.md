---
type: Task
title: Gateway 测试、依赖与 npm 发布 CI
description: 在独立 worktree 建立可验证、默认最小权限的 GitHub Actions 流程。
tags: [ci, release, security, docs]
---

# 目标与授权

用户要求新 worktree 补测试、依赖与 npm 发布 CI。基于已合并 PR 3 的 main@61c25dc，分支 ci/gateway-test-and-release。此授权替代原规则中“不扩大 CI”的历史范围限制。

## 承重合同

- PR/main 自动执行冻结锁文件安装、类型、构建、全量与专项测试、双语 docs、Octospec 和包验证；稳定 CI Gate 汇总所有必需任务。
- Linux Node 24/26 与 macOS Node 24 跑完整回归；Windows Node 24 验证构建、文档和隔离安装 SDK/CLI，不宣称原生服务验收。
- Dependabot 每周维护 npm/Actions；PR 依赖审查以 high 为阈值，只读、不发布评论。
- annotated vX.Y.Z tag 必须来自 main，源码保持 0.0.0；发布构建注入版本。发布先复用 CI，之后只发布同一次运行验证的 tgz，生产凭据只在发布步骤使用。手动 dry-run 为默认；正式发布需显式选择或推送合法 tag。
- 使用 NPM_TOKEN，与 Runtime 发布约定一致，provenance；不在本次任务创建 tag、发布 npm、修改保护或合并 PR。

## 可执行性与验收

规划 96/100：流程边界 25、权限与发布约束 24、复用验证 24、依赖可用性与验收 23。分数与实际验证分别记录。

验证 workflow 静态语法、版本/tag 拒绝路径、tarball 内容、实际 build/type/docs/测试。Runtime/client 2.0.0 目前未发布，冻结安装失败必须真实报告，不降级到不兼容 1.x，不在 CI 借用 Runtime checkout。PR 保留外部审批要求，所有限制写入双语维护指南。
