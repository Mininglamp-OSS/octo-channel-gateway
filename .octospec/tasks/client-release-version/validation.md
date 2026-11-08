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
