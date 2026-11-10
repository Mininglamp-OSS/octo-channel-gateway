---
type: Review
title: CLI 发布与 SDK 材料双轴审查
description: 相对 main 的独立 Standards / Spec 审查发现、修复与定向复核。
tags: [review, lifecycle, release, sdk]
---

基线：`beb804933ff34e75225645a34b1a7fd038c52ad8`。首次审查 `7616f94`；用户确认新增 SDK 命名材料合同后复审 `24cd6b0`，再定向复核修复。使用 code-review 技能的独立双轴审查；仓库无 docs/agents/issue-tracker.md，直接以 #30/#31/#32 与已确认 brief 为依据。

## Standards

首次没有硬性违规，指出 P3：CLI 两处配置保存后的前台重启提示重复。这是非阻塞维护建议，未改变既有提示合同。

第二次发现 P2：材料预检的 for...in 忽略非 enumerable getter，后续读取会执行 getter，复制还可能丢失必需字段。已改用 Reflect.ownKeys 检查所有自有描述符，拒绝 accessor、symbol 和除数组 length 外的非 enumerable 字段。显式专项覆盖 name/parts 的隐藏 getter 和隐藏数据字段。独立复核确认 getter 调用次数为 0，此项解决。

CI 改动仍局限既有 publish 实现和手动恢复参数，未扩大 jobs/矩阵/触发/Gate。SDK 变更有用户追加授权；业务材料与执行配置隔离，双语指引同步。

## Spec

首次发现 P1：原生 install/start/restart 报错后，跳过抢锁竞争复查。已增加后端失败后的归属核对，确认无关 owner 时停止本次托管服务重试，报告 Home/PID、原生失败码及清理失败码；不终止前台进程。专项验证成功清理与失败清理，独立复审确认解决。

第二次独立发现同一 P2 隐藏 getter 问题，验证通过后 structuredClone 丢 parts，违反冻结重试合同。修复后独立复核确认：非法对象被拒绝，合法材料复制保留字段，材料专项 5 项通过。

其余已核对命名材料覆盖/顺序、图片与 fallback、同代重试、下一轮读取、agent.items 不渲染、旧入口拒绝、registry 摘要、Release 原包恢复和 latest 不降级，未发现其他确定性阻塞缺陷。

两轴独立计数：Standards 发现 P2×1（已解决）、P3×1（非阻塞）；Spec 发现 P1×1、P2×1（均已解决）。同一 P2 在两轴分别保留，不合并掩盖来源。当前阻塞发现均已解决；原生 Windows/Linux 服务和真实发布写入仍以实际环境验证为准。

# ChannelGateway 破坏性迁移复审

用户确认 register(bot, agent)、宿主注入 KernelClient、去重覆盖和统一 close 后，对 5188f67 追加独立双轴审查，基线仍为 main beb8049；本轮重点比较 e6fc164..5188f67。

## Standards

发现 P1：首连状态 retrying 被 facade 当作注册失败，取消原重连并可能令 CLI 退出、关闭其他 Bot。已修复为仅永久 failed 回滚，保留 retrying。审查者实测原 5 秒退避后恢复 online，新专项与双语文档同步。此项已定向复核解决，剩余明确违规 0；未扩大 CI、未依赖私有 Runtime 包、未关闭共享 client。

## Spec

无有效发现。核对了注册快照、认证身份覆盖、串行更新、清理回滚、关闭竞争、共享 client 复用、CLI attach、旧 API 删除和文档迁移。对疑似 invocationId 复用的风险使用真实 Kernel 复核，同 ID/不同 runId 被拒绝为 EXECUTION_IDENTITY_CONFLICT，不作为有效 finding。

本轮计数：Standards P1×1 已解决，Spec 0。外部 code-review/审批仍由 GitHub 决定，本地审查不代替合并门槛。

# 同类问题专项质量审查

用户明确要求按已发现问题类别并行专项审查，分别委派重连恢复、超时/资源所有权、API/代码质量三个子 agent，覆盖 f645bc8 及后续修复。

- 重连专项：未发现新增有效缺陷。六项验证覆盖初次 retrying、已上线反复断网、覆盖后旧五秒定时器、旧回调、认证预检失败保留已有绑定及兄弟、永久拒绝不继续重连。真实 Gateway/Kernel 配合受控 transport；没有连接外部 IM。
- 超时/所有权专项发现 P1：ImRuntime 普通 info/warn 和 onDiagnostic 仅捕同步错误，异步日志拒绝能在 close 成功后令 Node 退出。追查同类到 imApi.fetchBotGroups/fetchUserInfo/getMentionPref，六种同步/异步失败组合均破坏回退或令进程退出。统一接入 runDiagnostic，执行 debug 也复用同一边界；不等待日志 IO，不改变 HTTP/权限/回退行为。
- Quality 专项发现 P2：永久连接失败回滚后丢失具体故障码。已在 IM_CONNECTION_NOT_READY.cause 中保留只含安全 IM_* 的 Error；不匹配的原始文本归一为 IM_CONNECTION_FAILED。
- 独立复核：Gateway 原 strict Node 复现由 exit1 变为 exit0；三个 imApi 的六组合均 exit0 且保留原回退，fetchBotGroups 网络异常仍正常拒绝。Quality 复核保留具体 WS 错误码，并验证模拟凭据/响应文本不会透出。日志同步throw/async拒绝/thenable/then getter/永不resolve均验证不阻塞或改变清理。

专项结果：重连 0；超时/所有权 P1×1 同类修复已解决；Quality P2×1 已解决。剩余有效阻断发现 0。未增加默认测试或 GitHub CI 范围。


# PR 33 外部审查意见逐类复核（2026-11-10）

此前 SDK 局部审查通过不等于外部 CLI/发布意见全部解决。本轮以 `25c6462` 为修复前基线，分别安排 Windows、PID 锁、发布工具、原生并发专项；实施后由未实现对应代码的 agent 交叉复审。

- Windows：有效 P1。缺失 manager PID 使正常 start/restart 无法完成三方就绪关联；unknown 超时又留下任务。增加 Task Scheduler 当前实例与 Exec 进程唯一关联；未确认启动清理不再只处理 unmanaged。原生命令使用受控结果测试，不能等同实机通过。
- PID 复用：缺陷确实存在，但源于 main 已有逻辑，条件为异常退出留锁、PID 被无关存活进程复用。本轮按 P2 边缘恢复问题记录，不使用“永久”或正常路径 P1 描述。新增系统启动标记；死亡/明确不等才回收，旧记录/查询失败/macOS 秒级同值保守拒绝。不增加 IPC 锁服务。
- pnpm 打包：已真实复现声明入口失败、npm 入口成功。共享精简 npm CLI 定位后，两种入口都调用相同 npm 参数合同；包外安装入口同类误用一并修复。
- 手动发布：非 main workflow ref 原先使整个依赖链静默跳过；保留 main-only 约定，在原 validate 路径显式失败。正常 tag push 与 main+tag 输入不改变。没有新增 CI 专项。
- 并发：直接调用内部后端可复现多步操作竞争，但 CLI 早已有跨进程 `withConfigLock` 覆盖动作、就绪和清理；未找到当前公开 SDK 暴露路径。故不作为新增 CLI P1 修补；补充内部单写者文档和隔离验证，见 [并发复核](concurrency-review.md)。

## Standards 轴

独立 reviewer 在 PID/发布增量未发现确认问题。核对启动标记保守回收、重复 npm 入口收敛、双语文档和 CI 范围；未将尚未实机验证的 Windows 分支推断为失败。

## Spec 轴

交叉复审发现一类 P2：原生命令已启动进程后报错，若尚无 lock/IPC（ownership=none），或随后状态查询抛错，仍遗漏清理。已统一启动后的观测失败处理：无原实例时清理本次启动；已有原 PID 而新状态不可读时保留并明确报告清理未确认；已经确认 ready 的新实例不误停。显式专项扩展覆盖这些失败路径和原实例保留，不修改默认测试总数。

修复后 Spec reviewer 独立重跑原始三条复现：无锁/IPC、原生命令报错后的查询异常、readiness 查询异常，均返回失败、停止次数 1、本次进程未残留；Windows 显式专项 27/27 通过。本轮 Standards 0 个确认问题；Spec 曾发现 1 类有效 P2，修复并复核后 0 个未解决发现。该结论不替代 GitHub 外部批准。
