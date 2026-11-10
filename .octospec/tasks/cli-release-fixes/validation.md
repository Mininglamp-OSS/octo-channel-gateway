---
type: Validation
title: CLI 归属与发布流程实际验证
description: Issue 30/31/32 的隔离测试、发布恢复只读验证和 CI 范围核对。
tags: [lifecycle, release, verification]
---

# 验证环境

2026-11-10，macOS，Node 24.22.2，pnpm 11.25.0。独立 worktree `gateway-cli-release-fixes/octo-channel-gateway`，分支 `fix/cli-ownership-and-release`，main 基线 `beb804933ff34e75225645a34b1a7fd038c52ad8`。未提交、推送、创建 tag 或执行远端发布。

# 结果

- 类型与构建通过；既有 `test:ci` 588 项中 587 通过、1 跳过，0 失败。
- 显式本地 `node --test scripts/verify-cli-release.mjs`：23 项通过。覆盖前台占用、start/重复 run、三处 PID 关联、缺失 manager PID、替代进程与交接竞争、停止后残留、坏状态/坏锁和死锁回收；覆盖 registry 延迟/404/网络/认证/摘要冲突/截止、上传 ACK 丢失、dry-run、原包恢复、tag 漂移、latest 陈旧响应及不降级、Release 草稿中断恢复/附件比对/重复执行。
- `docs:check`：双语/链接/共享示例检查通过，2 个受控 Kernel 示例测试通过。
- `pack:release` 与 `test:package`：独立消费者从本地 tgz 安装公开依赖、导入 SDK 和运行 CLI help 通过。
- Octospec lint 和 `git diff --check` 通过。系统 Python 缺 PyYAML，使用 `/tmp/gateway-cli-release-venv` 安装运行，没有修改项目依赖。
- 真实只读查询 npm `@mininglamp-oss/octo-channel-gateway@1.0.0`，下载原始包并验证包名、版本、build-info.commit=基线 SHA、dirty=false 与 registry SHA-512 一致。确认旧版本补 Release 可以使用原 npm 字节；没有写入 npm/GitHub。

# CI 范围核对

相对 origin/main，仅 `.github/workflows/npm-publish.yml` 变化；保留 validate/verify/publish 三个 job、tag push 和 workflow_dispatch 触发、verify 依赖和 concurrency。只在既有 publish 内加入发布脚本、工具源码 checkout、Release 必需 contents:write、确认等待时间，并增加显式手动 recover_existing 输入。`ci.yml`、Dependency Review、矩阵、CI Gate、package.json 测试 glob 均未改。23 项专项留在 scripts/，不会进入现有默认 CI 测试。

已只读核对基线 GitHub check-runs：validate、publish；verify / spec、verify / CI Gate、verify / Check（Ubuntu Node 24/26、macOS Node 24、Windows Node 24）；main 的 spec、CI Gate、四个 Check，均为成功。当前分支尚未推送，不能把基线成功当作当前分支远端验证。

# 承重规则检查与限制

- CLI 只控制 Gateway 原生服务，未改 Runtime、渠道或 SDK；原有锁获取/回收算法保持，仅增加只读检查和明确错误。
- 状态不声称已加载最新配置；没有管理器 PID 时保守报告 unknown，Windows 当前后端因此不能证明 start/restart 就绪，会在截止后返回 UNAVAILABLE。未验证真实 Windows/Linux 原生服务。
- 发布不修改不可变版本，tag 在上传前和 Release 更新前重新核对；恢复使用原包，dry-run 无远端写入，完成前验证 registry 和附件摘要。
- latest 记录本次执行已观察到的最高版本并重新读取指针；两个外部系统没有原子事务，工作流串行及失败后恢复是必要条件。并发手动改指针可能使确认失败，不能承诺跨系统原子性。
- 发布 API 使用模拟故障测试；没有真实执行 npm 上传、GitHub Release 写入或 provenance 签发。合并后的手动 dry-run/实际发布仍需等待 publish job 最终成功。
