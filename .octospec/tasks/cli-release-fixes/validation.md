---
type: Validation
title: CLI 归属与发布流程实际验证
description: Issue 30/31/32 的隔离测试、发布恢复只读验证和 CI 范围核对。
tags: [lifecycle, release, verification]
---

# 验证环境

2026-11-10，macOS，Node 24.22.2，pnpm 11.25.0。独立 worktree `gateway-cli-release-fixes/octo-channel-gateway`，分支 `fix/cli-ownership-and-release`，main 基线 `beb804933ff34e75225645a34b1a7fd038c52ad8`。初次实现阶段未提交或发布；用户随后授权 review、提交和创建 PR，仍不合并或发布。

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

# 审查后扩展与修复

Spec 审查发现 P1：后端启动命令抛错绕过启动竞争后的归属检查。已修复为失败后复查，确认无关 owner 时停止本次托管重试；保留占用 PID/Home、原生失败及清理失败码。专项增加成功清理/失败清理两条分支。

用户继续确认 SDK 业务材料改为 bot.materials / loadMaterials，使用 `{ name, parts }`、动态同名整项覆盖，不留 loadContexts / bot.context 兼容层；执行扩展独立 agent.items。对应接口、共享示例、README、双语入门/参考/迁移文档和既有测试已同步。新增 `scripts/verify-materials.mjs` 5 项显式专项，覆盖文本/图片、旧字段拒绝、私有执行项隔离、fallback 和同代次重试冻结/下轮重读。既有默认测试保持 588 项。完整验证及第二轮独立审查在交付前记录。

最终清空 dist 后重新构建，迁移仍引用旧 loader 的默认测试夹具；没有材料时保留原渠道前缀 parts 布局。完整回归 587 通过/1 跳过；CLI/发布专项 24 项和材料专项 5 项共 29 项通过；Runtime 1.1.13 专项 9 项通过；双语文档、类型、打包及独立消费者安装通过。隐藏 getter 的 P2 在两轴分别复现、修复并定向复核，详见 [审查记录](review.md)。新增专项仍在 scripts/ 显式运行，默认测试 glob、总用例数与 CI 结构保持。

# 嵌入生命周期规范补充验证（2026-11-10）

仅更新架构规则、brief 与中英文架构/SDK 入门/生命周期文档。核对已安装 client 1.1.13 的公开 KernelClient 导出及 v1.1.13 KernelService.client；参照现有 Manager 的稳定身份与串行替换行为拟定目标 register 合同。docs:check 通过：17 对页面、202 个本地链接、共享示例类型检查和 2 项现有用例；Octospec lint 通过（43 单元、4 规则、266 链接），git diff --check 通过。本次没有修改代码、测试或 workflow；文档检查不代表目标 ChannelGateway、共享 client 隔离或无泄漏合同已经实现，相关专项仍须在后续接口迁移时验证。

# ChannelGateway 实施验证（2026-11-10）

用户授权后已实施 register(bot, agent)、宿主 KernelClient 注入、按认证身份覆盖与统一 close；删除 Registry/Definition/Registration，SDK 无兼容层。CLI 明确 attachKernel，关闭 Gateway 后释放自己的 client；单步失败不跳过后续清理。README、双语 docs、共享示例、既有 Registry 测试及包外验证脚本均迁移。

- 清空 dist 后构建与类型检查通过；既有默认回归仍为 588 项（587 通过、1 跳过），CI workflow/job/matrix/默认测试入口未改动。
- Gateway 生命周期专项共 13 项通过，覆盖认证/覆盖/串行顺序/回滚/旧清理失败/关闭竞争/共享 client 复用/不合作回调/迟到凭据/旧 API 拒绝/首连暂态重连。新增已上线后反复断网、快速重试及关闭后旧回调不能重连的专项已单独运行通过。新增案例仅 scripts/verify-gateway-lifecycle.mjs 显式本地运行。
- 原 CLI/发布专项 24、材料专项 5、Runtime 1.1.13 专项 9 项通过。审查修复后重跑既有 CLI/Registry 测试 15 项通过。
- docs:check 通过：17 对页面、204 个本地链接、共享示例类型与 2 项示例测试；Octospec 和 git diff --check 通过。
- pack:release/test:package 通过；verify-package.mjs 使用本地 Gateway 包与公开 Runtime/client 1.1.13 归档，在独立消费者验证类型、CLI、真实 Kernel 调用和 Kernel 保留。没有写入用户全局安装或真实 IM 服务。
- 双轴审查：Spec 无有效发现；Standards 复现首连 retrying 被当失败导致宿主退出的 P1，修复为保留既有重连，并实际等待原 5 秒退避验证恢复 online。没有扩大 CI。Electron 实机退出、真实 IM/Provider 集成及强杀恢复未在本地验证。

# 同类问题修复后验证（2026-11-10）

最终默认回归 587 通过/1 跳过（总数仍 588）；显式 Gateway 生命周期专项 14/14、Runtime 1.1.13 专项 9/9 通过。类型检查、构建、双语文档与两个共享示例、Octospec、git diff --check 通过。新增strict Node子进程验证日志故障（包括独立imApi）不导致退出，覆盖同步/异步/thenable/then getter和挂起日志；永久失败案例确认回滚后cause仍可诊断。三名专项reviewer对原复现及同类路径独立复核通过，详情见审查记录。验证采用受控网络响应，不将其当作真实IM/Provider或Electron实机验证。


# PR 33 外部意见修复后验证（2026-11-10）

以 `25c6462` 为本轮增量基线，fetch 后 main 仍为 `beb8049`。本节更新早期关于 Windows 缺少 PID、锁算法未变化和 pnpm 打包验证不足的记录。

- 构建、typecheck 通过；最终既有 `pnpm run test:ci` 仍是 588 项（587 通过、1 跳过），无默认用例增量。
- 显式专项：Windows 进程关联与清理 27/27、既有 CLI/发布 24/24、PID 启动标记 6/6、发布入口 3/3、服务串行化 2/2，共 62 项通过。覆盖启动失败后尚无锁、查询异常、就绪查询失败、原实例保留和已 ready 新实例不误停。
- 发布入口专项真实执行 npm 12.2.1 与声明的 pnpm 11.25.0：相同暂存版本归档解包后全部文件字节一致，源码版本仍为 0.0.0。非 main 手动校验通过子进程证明在 git fetch 前明确失败；main 与 push tag 校验允许继续。
- npm 与 pnpm 的 pack:release/test:package 均通过公开 registry 的隔离消费者安装；最终 pnpm 重新打包并安装验证 0.0.0 归档成功。没有全局安装或修改用户真实 Home。
- 双语 docs、共享示例、Octospec、相对 main 的 whitespace 检查通过。去掉旧 material-loader 文件末尾多余空行。
- 相对 main 的 workflow diff 仅 npm-publish.yml：保留已有 validate/verify/publish、tag push/manual 触发、四项验证矩阵和 Gate 依赖；本轮只移除 validate 的静默跳过，改由既有校验脚本拒绝非 main 手动 ref。既有 publish 的 35 分钟覆盖 registry 最多等待 20 分钟，validate 仍为 5 分钟。package.json 和默认测试入口未变。

限制：Windows Task Scheduler/COM/CIM 和 Linux 进程标记未在原生系统执行；Windows 测试使用受控 native runner 结果，macOS 启动标记实测但只到秒级；旧记录与查询失败仍可能需要人工核对。无法读取新状态且之前有已知原 PID 时，不贸然停止原实例，明确报告清理未确认。未真实 dispatch 发布工作流、写 npm 或创建 GitHub Release。GitHub 当前修复提交的检查结果另行确认，不能用旧 head 的绿色检查代替。
