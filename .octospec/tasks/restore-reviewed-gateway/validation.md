---
type: Validation
title: Gateway 恢复与审批保护实测
description: 记录恢复来源、GitHub 保护回读、本地检查和外部审批边界。
tags: [review, governance, validation]
---

# 2026-11-08 实际结果

规划准备评分 97/100 见 brief，不代表外部审查通过。

## 原因核实

PR #1 合并时 reviews 为空，code-review 为 PENDING，合并者为当前使用的 superalsrk。此次查询 main protection 返回 Branch not protected，rulesets 返回空列表。普通合并无需管理员绕过即可成功；这是仓库缺少保护且执行者未等待外部审批导致的流程问题。

## 恢复与验证

- 用户在 PR #2 回退为 main@41cc842。本轮新分支从该 main 出发，反向撤销回退，恢复原 PR #1。
- 与原功能提交 d430cea 对照，packages/apps/docs/package.json/pnpm-lock.yaml 无差异；新增仅为本轮任务与审批工程规则、索引。
- `npm run build`、`npm run typecheck` 均成功。
- `npm run docs:check`：16 对页面、34 Markdown、168 本地链接及 2 项可执行示例均通过。
- `node --test --test-concurrency=4 --test-timeout=20000 test/*.test.js`：562 项，561 通过、1 跳过、0 失败。
- 通过 GitHub API 配置并回读 main：required_approving_review_count=1、dismiss_stale_reviews=true、enforce_admins=true、required_conversation_resolution=true、strict=true；必需状态为 code-review；禁止强推和删除。

## 审查与限制

恢复保留原双轴/五轴本地审查证据，但这些不能替代 GitHub 非作者审批。新 PR 等待外部审查，不执行合并。Gateway 尚无自有 CI workflow，不报告不存在的 CI Gate；本轮测试是本地 macOS 验证。依赖使用现有安装候选，Runtime/client 2.0.0 尚未发布，不代表全新 npm registry 安装可用。未发布 npm/tag，未修改 Runtime 或用户系统服务。
