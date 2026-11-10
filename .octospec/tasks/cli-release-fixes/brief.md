---
type: Task
title: CLI 实例归属与发布完成合同
description: 在同一独立 worktree 处理 Issue 30、31、32，保留既有 CI 范围。
tags: [lifecycle, release, docs]
slug: cli-release-fixes
upstream: Mininglamp-OSS/octo-channel-gateway#30,#31,#32
source: self
---

# 目标与确认

用户 2026-11-10 明确要求新建一个 worktree，同时处理发布体验两项及 #30；该指令确认本次实施范围。基线 main beb8049，分支 fix/cli-ownership-and-release。

# 承重合同

- CLI 管理动作只管理 Gateway，不接管 Runtime 或自动终止前台进程。锁的原子获取、存活判断和失效回收规则不变。
- 启动前检查 Home 占用；就绪必须关联 manager、lock、IPC PID，重启必须观察替代实例。缺失 manager PID 不伪造成功。
- npm 版本不可变；已验证安装包 SHA-512 是发布和 Release 附件的共同依据。上传失败不盲目重传，先确认 registry。
- Release、英文变更说明和 tgz 附件在 registry 确认后创建；全部确认后才晋升 latest，历史恢复不降级。
- 既有工作流的 validate / verify / publish 结构、触发和矩阵不增加；专项验证仅显式本地执行。

# 设计与实施

1. CLI 增加只读锁快照和归属关联；start/restart/install 在后端变更前阻止无关存活实例，竞争后仅停止本次启动的托管服务；status/doctor 和 stop/uninstall 说明实际归属与配置未确认状态。
2. 在现有 publish job 使用独立可测试脚本：预检查、上传、有限 registry 轮询、Release/附件校验、latest 协调。网络暂态重试，认证及摘要冲突立即失败。
3. 手动 recover_existing 显式下载原 npm 包，验证包名、版本、tag commit、dirty=false 和摘要，补齐 Release，不重建冒充原包、不改 tag、不重复发布。dry_run 不修改远端。
4. 更新双语 CLI/发布文档；专项脚本置于 scripts/，不进入既有默认测试 glob；适配既有 fake backend 的真实归属信息。

# 排除范围

不改变消息准入、投递、WebSocket 和 Runtime 生命周期；不实际发布或创建 tag；不新增 workflow/job/矩阵/自动触发/门禁。

# 验收

- 隔离测试覆盖前台冲突、管理器匹配/缺失 PID、重启旧 PID、状态无效、失效锁、停止后残留；不访问真实服务。
- 发布故障注入覆盖延迟可见、同摘要重跑、冲突、认证、超时、丢失上传 ACK、Release/附件修复、旧版本与 dry-run。
- 类型、构建、既有测试、双语文档、Octospec、打包与包外消费者检查通过；实际结果单独记录。
- 相对 main 的 CI diff 仅既有 publish job 内实现需求和显式手动恢复参数；实际检查列表保留。

# 实施前评分

设计就绪度 96/100：范围与授权 20/20，所有权 19/20，发布可恢复性 19/20，验证计划 19/20，文档与 CI 边界 19/20。该评分不是测试结果；Windows 原生服务及真实 npm 写入仍须发布环境验证。

# 追加交付要求

用户继续授权 code review、提交并创建面向 main 的 PR，以及统一 Runtime 安装指引。最低要求为 1.1.13（当前支持 1.x）；README、双语入门/依赖/排错和 CLI 错误帮助统一使用 `@mininglamp-oss/octo-runtime@latest`，manifest 依赖范围保持 ^1.1.13。审查完成后提交英文 PR，不合并、不发布。

# 已确认的 SDK 材料接口变更

用户明确要求同时修改 SDK，移除 loadContexts / ContextItem 业务材料入口，并选择 `{ name, parts }` 命名材料：静态 bot.materials；动态 loadMaterials；同名整项替换、保留静态位置，新项按顺序追加。公开配置拒绝旧 bot.context、loadContexts/contextLoading，不做兼容层。材料只进入模型 inputs，包含文本或图片；自动渠道材料注入规则、冻结重试和回调超时/占额/关闭语义不变。执行参数仍由 bot.agent 编译；高级自定义执行项通过 agent.items 进入 AgentEnv.items，不进入业务材料正文。同步更新 README、双语 docs、共享示例、既有测试与手动验证脚本；专项新增案例仍显式本地执行。内部渠道历史/规则准备表示不作为宿主材料 API。

追加设计就绪度 96/100：已确认数据形状、覆盖语义与无兼容层；模型 parts 与执行 items 分开，历史重试复用冻结快照；风险集中在图片 fallback、执行项隔离、旧配置拒绝和受控回调清理，专项逐项验证。原排除项中 SDK/渠道接口限制按这次明确授权更新，其余生命周期与 CI 边界保持。

# 宿主边界规范补充

用户进一步确认一个 Gateway 通过循环 register 多个 Bot ↔ Agent 绑定，register 返回 Promise<void>，仅统一 close；等待退出、CLI online 主循环、Electron 退出事件、PID 和宿主控制 IPC 不进入 SDK。本次将该目标及 ChannelGateway 命名写入架构规则与双语架构文档，明确当前 ChannelRegistry 尚待迁移；不据此提前修改尚未确认具体类型的 Agent 接入参数，不把设计示例伪装成已实现 API。
