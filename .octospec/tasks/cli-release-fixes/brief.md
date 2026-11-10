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

- CLI 管理动作只管理 Gateway，不接管 Runtime 或自动终止前台进程。锁仍原子获取；失效回收的补充范围见下方 PR 33 审查修复。
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

用户继续明确宿主负责 Runtime 接入，并要求文档约束嵌入资源清理、保留 register 且去重覆盖。目标构造改为借用公开 KernelClient，覆盖之前“Gateway 自建 client”的目标所有权；当前实现不在此次文档补充中修改。沿用平台地址与稳定 Bot ID 的身份，认证后串行替换：校验、清理旧绑定、启动新绑定；不承诺自动恢复旧配置。close 是终止边界，清理全部自建资源和自身执行，不操作共享 client 全局生命周期；失败继续清理并汇总，超时不伪装成功。新增/覆盖、并发注册关闭、晚到资源、清理失败和共享 client 隔离作为后续迁移的本地验收项，不扩大 CI。

# ChannelGateway 实施确认

用户明确开始实施上述合同，并将最终签名定为 `new ChannelGateway({ kernel })`、`await gateway.register(bot, agent): Promise<void>`、`await gateway.close()`；移除 ChannelRegistry/ChannelDefinition/ChannelRegistration，不设兼容入口。CLI 显式 attachKernel 并持有 client，finally 中先关闭 Gateway 再释放 client；SDK 不关闭借用 client。Bot 接入用 apiUrl/bfToken，botId 可选且须与认证身份匹配；禁用绑定须显式 botId。材料、凭据及存储工厂随 Bot 绑定注册，日志及宿主 signal 在 Gateway 构造时提供；Agent 继续使用现有业务执行定义。

实施沿用内部 Manager、调度、重试和投递合同，为每绑定分配受控材料池及执行身份集合，串行认证/去重覆盖，清理失败不遗失资源。新增专项显式本地运行，迁移既有测试、验证脚本、包外消费者、README 和双语 docs，不扩大 CI。验收包括共享 client 继续执行、其他使用者不被取消、失败回滚、并发关闭、覆盖与全部资源清理。实施准备评分 96/100；此评分不替代运行结果，验证单独记录。


# PR 33 外部审查修复确认

用户要求按问题类别开子 agent 核查并处理，随后确认采用最小改动，并明确包含 Windows start 修复。此次以 `25c6462` 为修复前基线；之前 SDK 专项通过不能代替对 CLI/发布历史审查意见的处理。

- Windows 正常启动：从 Task Scheduler 的当前实例与实际 Exec 进程关联管理器 PID，保留 manager/lock/IPC 就绪合同。关联不明时不伪造成功；清理本次未确认的托管启动，保留已确认未替换的原实例。
- PID 复用按 P2 边缘恢复问题处理：锁记录增加可选的系统进程启动标记，明确不同时允许回收；旧记录、查询失败与 macOS 秒级相同标记均保守拒绝。复用原有回收互斥和删除前重读，不增加 TCP/IPC 锁服务，不承诺覆盖所有极端情况。
- 手动发布保留从 main 运行、tag 输入决定发行源码的约定。移除静默跳过条件，在既有 validate 路径明确拒绝非 main 手动运行；不新增触发、job 或检查。
- 修复声明支持的 pnpm 脚本入口误把 pnpm 当 npm 调用的问题，复用已安装 npm 的 pack/install 合同，不新增依赖。
- 原生后端直接并发复现与 CLI 可达性分开：CLI 已有跨进程配置锁覆盖生命周期动作，不再新增内存队列。用显式本地验证和内部文档记录单写者要求。

设计就绪度 96/100：已确认最小范围、失败行为、保守回收与 CI 边界；Windows 原生命令测试采用受控结果，实机行为仍是验证限制。新增专项保持显式手动执行，默认测试只迁移既有夹具，不扩充 CI。更新双语文档、记录验证并推送已有 PR；不合并、不发布。
