---
type: Validation
title: Runtime 1.1.13 迁移验证记录
description: 记录本地依赖、业务回归、专项 IPC、发行消费和未验证的外部环境。
tags: [validation, dependency, protocol]
---

# 环境与基线

2026-11-10，macOS，Node v24.22.2、pnpm 11.25.0、TypeScript 7.0.2。

- Gateway 基线 `a6e661b9c81826b56e79c333949bb1e470dd4d17`，新实施 worktree `gateway-runtime-1-1-13-impl/octo-channel-gateway`，分支 `fix/runtime-client-1.1.13`。规划 worktree 保留。
- 生产 client 与开发完整 Runtime 均为官方 registry 的正式 1.1.13，manifest 范围均为 `^1.1.13`；lock 使用官方 SHA-512 integrity。源码版本保持 `0.0.0`。
- 已读取 architecture、channel-behavior、review、documentation 规则；本仓没有 `.octospec/_global`，不声称读取不存在的规则。

## 已执行与结果

| 命令 / 检查 | 真实结果 |
| --- | --- |
| `pnpm install --frozen-lockfile --ignore-scripts` | 本 worktree 成功；另将 package.json、pnpm-lock.yaml、pnpm-workspace.yaml 复制到干净临时目录执行同命令成功，Runtime/client 均安装为 1.1.13。 |
| `pnpm run build`、`pnpm run typecheck` | 通过；生产源码仅使用公开 client/protocol，不导入完整 Runtime 或 Adapter。 |
| `pnpm test` | 574 项：573 通过、1 按原 GC 条件跳过、0 失败。 |
| `pnpm run test:ci` | 原有范围 588 项：587 通过、1 按原 GC 条件跳过、0 失败。 |
| `node --test scripts/verify-runtime-1.1.13.mjs` | review 修复后 9 项通过，位于默认及 CI 测试 glob 之外；详情见下。 |
| `pnpm run docs:check` | 双语 17 对页面、类型示例及文档检查测试通过。 |
| `npm run pack:release` | 通过，生成 0.0.0 归档，不发布。 |
| `npm run test:package` | 独立临时目录从公开 registry 安装 41 个包，公开 SDK 与 CLI smoke 通过。 |
| `node scripts/verify-package.mjs <gateway.tgz> <runtime-1.1.13.tgz> <client-1.1.13.tgz>` | 独立安装、CLI/config/log、SDK、真实 IPC 互通及共享 Kernel 存活六项均 true。两个上游归档由 npm pack 从正式 registry 获取。 |
| 修改过的手动脚本与 fixture 的 `node --check` | 通过；只确认语法，不代表真实 Provider/IM 联调成功。 |
| `uv run --with pyyaml python .octospec/scripts/lint.py` | 通过；临时工具环境提供 PyYAML，不改变项目依赖。 |
| `git diff --check` 与 CI 范围核对 | 通过；相对 origin/main 的 workflow diff 为空，package scripts 与默认 glob 未变。 |

一次干净安装试验只复制 manifest/lock，遗漏既有 pnpm-workspace.yaml 的定向发布年龄配置，因而被 pnpm 拦截；复制完整项目安装配置后通过，未更改或关闭该策略。系统 python3 缺 PyYAML，使用临时工具环境完成 spec lint。`pnpm run pack:release` 因既有脚本把 npm 的 `--ignore-scripts` 传给 pnpm pack 而失败，采用现有 CI 所用 npm 命令打包成功；未修改打包逻辑或扩大 CI。

## 专项覆盖

1. instruction 首轮最前、续聊与周期刷新不重复、不可恢复会话/reset 再注入；fallback parts/text 顺序与优先级正确，无旧协议投影。
2. 空白 instruction 省略、非字符串拒绝、已有配置预算生效。
3. CLI extraset/extraget 保留业务 instruction，调用方无需信封。
4. MODEL_CONTEXT_PATTERNS 保持原集合，私有执行项不进入模型；注释/context 格式及内部 CDATA/顺序由迁移后的现有测试共同覆盖。
5. 显式缺失目录、非目录及旧 workspace.mode 拒绝，OpenClaw 私有 agentId 正确且无本地目录。
6. 真实 ImRuntime 编排配合假传输：首轮、续聊、渠道刷新、配置修改后的冻结卡片重试及 reset。
7. 真实公开 attachKernel + 隔离 Kernel + 假 Adapter：私有嵌套 payload 与顺序保持、1 MiB 图片与恢复稿完整、debug 严格开关、SDK/CLI 文件快照与最终调用相等、无状态镜像、日志异常不影响执行。
8. 人工验证宿主使用显式 Engine 和公开 client，假 Codex 子进程生命周期及幂等关闭正确。
9. 重试验收宿主在 Kernel 关闭拒绝、两个 Engine 同步关闭抛错、关闭返回不完整及启动失败时，仍回收全部已创建资源；关闭 Promise 复用，多个错误汇总保留。

## PR 前 review 修复（2026-11-10）

- 修复 ImTask debug 端口只捕获同步异常的问题：观察 async/thenable 拒绝，但不等待日志完成；挂起的日志回调不能阻塞执行。真实 IPC 专项加入同步异常、async 拒绝、thenable 拒绝及永不完成回调，均收到 run.completed，node:test 未捕获未处理拒绝。
- 修复重试验收宿主在 Kernel close 拒绝后跳过两个 Engine 的问题：Kernel 与每个 Engine 分别收尾，失败汇总为 AggregateError；启动失败同时保留原始错误与回收错误。隔离子进程对真实宿主模块注入故障依赖，覆盖成功、Kernel 失败、多资源失败、不完整和两种启动失败。
- 修复后 build、typecheck、专项 9 项、原 test:ci（587 通过、1 条原条件跳过）及 diff 检查通过。没有修改 workflow、package scripts 或默认测试范围。

## 影响面与边界

已逐项迁移测试、双语文档和人工验证工具，见 [影响清单](impact.md)。A01–A15 的本地证据已覆盖；涉及平台差异的断言只代表本机观察。CLI 使用 attachKernel，生产不创建或接管 Codex Engine。

未执行真实账号的 Codex/OpenCode/CodeBuddy/IM 端到端验证，也未在 Windows/Linux 原生环境运行。人工脚本已适配并检查语法、假宿主已验证，但不据此声明外部服务兼容通过。没有修改或重启用户默认 Runtime/Gateway 服务。

上述验证完成后，用户已授权提交、推送并创建面向 main 的 PR。合并、打 tag 和 npm 发布留待单独授权。此前按用户要求全局安装过本地 0.0.0 构建；本次 review 修复尚未重新全局安装。
