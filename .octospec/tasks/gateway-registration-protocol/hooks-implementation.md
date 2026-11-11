---
type: Task
title: 应用 Hooks 与 CLI 基础策略实施
description: 接通两个 Hook 点位，将 instruction 和完整输入日志策略移到 CLI。
tags: [architecture, channel, lifecycle, session, docs]
---

# 目标与授权

用户确认两个点位和业务策略边界后，要求在 CLI 实现两个基础 Hook，替代旧硬编码。依据 [Hooks 草案](hooks-draft.md)。本轮在当前 worktree 实施和验证，不提交、推送或发布。

# 承重合同

- register(bot, agent, hooks) 数组；每项 type/hook，无 name。统一 async(ctx, inputs, agentEnv)，完整返回 inputs/agentEnv，顺序串联，未知点位 warning 后忽略。
- ctx 为同链共享的只读会话快照，含 sessionId/providerSession、botId/sessionKey/generation、turn.index、消息身份和 signal。路由由 Gateway 管理。
- pre_dispatch 每个新逻辑轮次准备一次；结果冻结供重试。pre_invoke 在真实发送前执行；冻结重试不允许更改已冻结内容。不得改变运行/调用身份或 canonical 协议。
- CLI instruction 采用首轮 prepend（XML 命名 extra.cli/instruction），reset 后重新生效；不再由 SDK 根据 Provider 状态硬编码前置。CLI 使用配置快照，不逐轮重读磁盘。
- CLI pre_invoke 仅在 OCTO_CHANNEL_GATEWAY_DEBUG=1 时记录完整 inputs/agentEnv，包含图片；旧拼写不兼容。日志异常不影响执行，状态镜像不包含完整请求。
- Gateway 不决定业务刷新周期；移除固定周期触发。会话恢复、渠道必要协议材料、去重、准入、投递保持既有正确性边界。
- close 跟踪回调并取消，迟到返回不继续执行；失败或不配合取消不能伪装清理成功。共享 Kernel 所有权不变。

# 排除范围

不新增点位、初始化缓存、材料加载器、逐项 Hook 管理或兼容层。不扩大 GitHub CI（含默认专项测试）；新专项放 scripts 显式本地执行。现有受影响测试和双语 docs 同步迁移。

# 验收与评分

本地验证数组串联、ctx 隔离、首轮/reset/第 20 轮业务选择、图片与 CDATA、开关精确匹配、日志失败、冻结重试、异步取消、未知点位及非法结果。执行构建/类型、既有默认测试、文档、Octospec、打包检查，记录真实结果。

实施就绪 96/100：接口20、生命周期19、重试19、验证19、文档19。评分不代替验证；XML 命名按现有格式选择，不改变用户要求的行为。

# 实施结果

已完成，验证见 [实际验证](validation.md)。CLI 使用 extra.cli/instruction，采用注册时配置快照；仅逻辑轮次1前置。旧固定刷新配置明确拒绝，SDK 不自动注入 instruction；SDK 业务自行提供 Hook。专项在 scripts/ 显式执行，未扩大 CI。

# Hooks 专题文档扩展（2026-11-11）

用户要求将 Hooks 独立成业务宿主接入专题，解释两个点位、ctx 字段、场景和可能用法；追加 instruction 空字符串配置、trim 非空且 index===1 才前置，并明确 Hook 位于业务侧。

范围：双语 guides/hooks.md、共享类型检查示例、README/SDK/配置导航。不修改运行时代码、公开协议或 CI。文档以当前实现为事实依据，分别说明首轮/周期策略、原始问题与图片、完整日志、会话隔离、冻结重试、取消和只读身份。评分97/100：剩余3分为宿主实际存储/日志服务不在示例验证范围。验证使用既有 docs:check 和本地 Octospec/diff 检查，不扩大检查入口。

用户再次明确：instruction 非空且首轮前置，以及 debug 环境开关仅属于 CLI。Electron 等宿主自行实现 Hooks，不继承 CLI 配置字段、注入周期或日志策略。文档与示例不得把 CLI 规则表述为 SDK 默认行为。

# 各 Adapter 的 CLI instruction 文档（2026-11-11）

用户要求所有 Adapter 使用文档说明 instruction 配置，并再次限定仅 CLI 生效、SDK 业务自行实现 Hook。中英文13个 extraset 示例均加入 agent.instruction 空字符串，包括 OpenClaw；README、CLI 入门、配置参考和共享 JSON 同步。各处明确 trim 非空且 index===1 才由 CLI Hook 注入，SDK 仅填写字段不生效。不改运行时代码或 CI。
