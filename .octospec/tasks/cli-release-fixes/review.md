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
