---
type: Task
title: 显式 Bot 身份、应用 Hooks 与 CLI 业务策略
description: 删除注册级材料设计，落实双点位 Hooks、CLI 指令日志策略及全部 Adapter 接入文档。
tags: [architecture, channel, lifecycle, docs]
slug: gateway-registration-protocol
source: self
---

# 目标与确认

用户要求在当前 worktree 完成整套注册协议与 Hooks 改造，支持破坏性更新，不提供兼容层。需求已由多轮讨论确认：Bot ID 必填；完全移除 materials/loadMaterials；register 第三个参数为 Hooks 数组；业务决定按轮次加工输入；CLI 自带 instruction/debug 两个基础 Hook，Electron 等 SDK 宿主自行实现。

工作目录为 gateway-registration-protocol/octo-channel-gateway，分支 fix/registration-protocol。固定起点为 `08711719e843617a8bdad11f8dee1637b84f7239`（PR 33 已合并），与本地 origin/main 记录一致。本地 main 分支较旧，不用作本次差异基线。

# 承重合同

- register(bot, agent, hooks?): Promise<void>；botId 在类型和运行时必填，认证只验证一致性。缺失身份或验证失败不得拆除已有绑定。
- 删除静态 materials、BusinessMaterial、loadMaterials、materialLoading/material_loading、加载器、合并和资源池。旧入口明确拒绝，不做兼容转换。
- 现有 channel 的事件信息继续转为独立 XML 文本 part；用户问题和图片保持独立。业务没有附带信息时不创建额外业务材料，不恢复注册级自动拉取列表。
- Hooks 数组每项 {type, hook}，仅 pre_dispatch/pre_invoke；统一 async(ctx, inputs, agentEnv) 返回完整 {inputs, agentEnv}，同点位顺序串联，无 name/隐式合并。
- 同链共享只读 ctx：botId/sessionKey/generation/sessionId/providerSession/messageId/conversation/turn.index/signal。Gateway 维护路由和轮次，业务决定何时 prepend；未知点位 warning 后忽略。
- pre_dispatch 结果随同轮输入冻结，自动和卡片重试不重新采集。pre_invoke 位于实际 client 调用前，冻结重试不得改变已冻结内容。保留既有安全重放、代次隔离、取消及共享关闭期限。
- CLI 的 bot.agent.instruction 仅在 trim 非空且 index===1 时前置为 extra.cli/instruction XML，保留原文与图片；reset/new 后首轮重新生效。配置来自注册时快照。SDK 不自动注入 instruction。
- CLI pre_invoke 仅根据精确 OCTO_CHANNEL_GATEWAY_DEBUG=1 记录完整 inputs/agentEnv（含图片、凭据与会话参数），隔离日志故障且不写状态镜像。旧拼写不兼容；SDK 不读取该开关。
- 删除 SDK 固定刷新周期，旧 stable_context_refresh_interval_turns 明确拒绝。首轮/每20轮等业务策略由宿主 Hook 实现；既有必要渠道规则、历史、认证和恢复边界保持。
- 宿主 KernelClient 所有权、串行覆盖、连接重试和统一 close 保持。未完成或拒绝取消的工作不得伪报清理成功。
- README、双语 Hooks 专题、SDK/CLI 接入、共享示例同步。全部13个 Adapter CLI 示例含 instruction，包括 OpenClaw，并明确 SDK 必须自行实现 Hook。

# Runtime/client 1.1.14 补充确认

用户在整体实施期间要求两依赖升级为 ^1.1.14，并明确 extra.im 只是业务侧复用 namespace/name/payload 组织结构，自行拼接输入；Runtime 不解释渠道语义。公开 npm 已确认两个 1.1.14 版本存在。删除上游已移除的顶层 guidance/data_format 使用；渠道内部排版信息置于 payload，主输入与恢复输入由 Gateway 统一渲染为普通文本。AgentEnv 执行 item 按新协议保持透明，不添加兼容层。更新现有夹具和显式迁移专项，CI 范围不变。

用户追加要求：实现显式 lint-runtime-upgrade.mjs，核对现行文档/版本/删除入口、模块可达性与孤立产物，并验证 invoke 不携带 contexts；禁止任何兼容层。历史验证记录保留原版本，不当作现行要求。

# 排除范围

不新增 Hook 点位、材料框架、Runtime 私有依赖或宿主数据库；不改真实 Bot/用户 Home，不全局安装。用户已追加授权完成code-review与验证后提交commit、推送并创建正式PR到main；不合并或发布。不扩大 GitHub CI（workflow/job/矩阵/自动触发/必需检查/Gate/默认专项均不增加）；专项显式本地执行。

# 验收

- 身份缺失在凭据或 Kernel 访问前失败；旧材料入口不能执行回调或进入请求。
- Hook 参数/返回值、顺序、只读 ctx、未知点位、业务首轮/周期、Bot/会话隔离、图片、重试、reset、准备失败和关闭均有本地证据。
- CLI 首轮 XML 与完整日志仅由 CLI Hook 提供，SDK 空 Hooks 不执行这些业务策略。
- 13个 Adapter 双语配置一致并通过实际 CLI extraset 临时 Home 保存校验。
- 构建、类型、既有默认测试、双语文档、Octospec、打包及独立消费者通过；产物不含删除模块。
- Standards/Spec 两轴独立检查最终 diff，确认问题修复后记录复验，区分本地验证和外部环境限制。

# 实施与评分

最终实施范围就绪96/100（范围20、接口19、生命周期19、验证19、文档19）。评分不代替运行结果，见[实际验证](validation.md)。[Hooks 设计](hooks-draft.md)记录收敛后的设计，[CLI Hooks 实施](hooks-implementation.md)记录用户补充和分阶段结果。2026-11-11 的整体实施收尾核对全部范围并处理审查发现。


# 渠道上下文分块与本轮共享读取（用户追加）

用户要求一眼可辨识每个注入上下文，拆为独立本地模块，注意性能、相同API不要重复调用；共享对象不复用公开Gateway Hook ctx。将transport/contexts.ts拆到transport/im-context/：入口只列出当前消息、引用、资源、富文本/转发、群/子区规则、历史、缺口。独立ImContextBuildScope持有本轮配置/消息/取消信号及已开始读取，按相同参数复用Promise；身份批量读取复用已查UID（含本轮缺失/失败结果），跨轮沿用既有有界身份缓存，其他API不跨轮缓存。

验收：保持item顺序、条件、字段和预算、权威规则错误、历史降级/恢复及取消行为；本地显式验证同参并发读取去重、身份重叠/缺失不重查、不同轮/Bot隔离。模块使用具名函数，不创建通用插件机制或兼容导出；不新增独立npm包/依赖/CI入口。设计就绪96/100，实际结果单列。

用户已确认实施分块方案：scope深只读，底层请求缓存置于闭包；规则注入判断留在群规则模块，不放入scope。新增channelId/channelType和真实turnIndex供各块读取；读取器绑定本轮渠道。最重要验收：与本次重构前工作区的实际pre_invoke输入（含图片、AgentEnv、主/恢复文本、排序）一致；固定输入下除随机执行标识外做直接对照，不使用旧main作为输出基线。重构前编译产物单独保存在临时目录供对比，不提交旧实现或兼容导出。

并发提议后，用户指出会增加复杂度，最终按串行块组装实施；保留此前当前消息块内既有身份/会话读取并行，不新增块级调度。scope提供只读事实和读取能力；规则读写与版本筛选在rules.ts，游标确认仍由应用执行流程维护。
