---
type: Validation
title: client-release-version 实际验证
description: 记录成功检查和未完成的外部发布条件。
tags: [validation, release]
---

# 实测与边界

2026-11-08：生产 client 和测试 Runtime 约束改为 ^1.1.12，安装提示、双语说明、CLI 断言与当前架构规则同步。候选锁工具不再硬编码 2.0.0，要求稳定非零版本及 Runtime/client 同版本。执行协议保持 IPC v2；没有旧接口兼容层。

Runtime 独立 worktree 的真实发行脚本生成两个 1.1.12 tgz，Gateway 锁工具读取真实元数据/sha512，经 pnpm 更新锁，未伪造 integrity。用这两个归档安装后，build/typecheck/docs 通过；16 对双语页面、168 链接、2 项示例；完整回归 573 项，572 通过、1 跳过。真实 Gateway tgz 与 Runtime/client 三归档隔离消费者验证通过。

1.1.12 仍未在 npm 发布。本地归档与未来正式 CI 归档可能因 commit/build metadata 不同而字节不同；合并前必须用正式发布的 registry 元数据重新生成锁，并运行冻结安装及 CI，不能把本地候选 hash 当作正式发行证据。本 PR 保留为 draft，不发布、不合并。

## 2026-11-09 正式发行包复验

基线 PR #17 `03c8551998189c3d30c91396e2dbdca224bda4ed`。npm 已发布 Runtime/client 1.1.12；package.json 的两个约束均为 `^1.1.12`，实际安装均为 1.1.12。首次冻结安装发现候选 integrity 与正式包不符，同时受到 pnpm 默认新包等待期限制。从官方 registry 执行定向 lockfile-only update，仅替换两项发行元数据；命令级 `--config.minimum-release-age=0` 后冻结安装成功，未修改全局安装策略。

`npm run build`、`npm run typecheck`、`npm run docs:check` 成功；直接运行 `node --test test/*.test.js` 为 562 项、561 通过、1 跳过、0 失败。使用 npm 启动脚本避开 pnpm run 自动安装重新套用默认等待期。文档检查覆盖 16 对页面、168 本地链接和 2 项示例。

`node scripts/verify-pr17-local.mjs` 通过：附着用户已启动的 `/Users/lvsijia/.octo-runtime/executor-kernel.sock`，IPC v2、execution_ready=true。Gateway ImRuntime 消息处理调用真实 Codex，回复 `PR17_CLIENT_1_1_12_OK`，展示终态 completed；注册重复 close 返回同一 Promise，调用登记排空。关闭后 Kernel instance 保持 `22c5d926-5624-4552-ac13-54712f37b468`、PID 34196。渠道传输使用本地回调替身，未发送外部 IM 消息，因此这不是远端 IM/WebSocket 端到端验收。

Gateway 打包配合从 npm 下载的正式 Runtime/client tgz，运行既有 `scripts/verify-package.mjs` 通过：独立目录 npm 安装、CLI bin/配置/日志、公开 SDK 类型、client IPC 互通与共享 Kernel 保留均通过。

相对 origin/main 的 `.github` diff 为空。GitHub 实际检查仅有 `code-review`，当前为 FAILURE；本地验证不代表该状态已通过。本次未提交、推送或合并。
