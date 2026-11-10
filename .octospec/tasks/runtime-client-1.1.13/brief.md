---
type: Task
title: Gateway 适配 Runtime/client 1.1.13
description: 基于正式上游接口规划依赖升级、AgentEnv 透传及输入和工作目录迁移。
tags: [architecture, channel, context, lifecycle, dependency, planning]
---

# 目标与当前授权

用户已确认规划并要求开始实施，另建 `gateway-runtime-1-1-13-impl` worktree，分支 `fix/runtime-client-1.1.13`。实现直接采用新合同，不做兼容层；同步梳理相关测试、双语文档、验证脚本和现有 CI。2026-11-10 完成 PR 前 review 和两项修复后，用户授权提交、推送并创建目标为 main 的 PR；合并及发布不在本轮授权范围。

- Gateway 基线：`a6e661b9c81826b56e79c333949bb1e470dd4d17`。
- 上游比较：`v1.1.12` → `v1.1.13`，后者指向 `7892ebdf2ed9b1fa859bd51f15da6d7f03c247e2`。
- 目标生产依赖：`@mininglamp-oss/octo-runtime-client: ^1.1.13`。
- 开发集成测试使用的完整 Runtime 同步到 `^1.1.13`，不成为生产依赖。
- npm 官方 registry 已分别返回两个包的正式 `1.1.13` 元数据；本 worktree 已安装并锁定正式包，干净目录 frozen install 通过。

## 承重合同

1. Gateway 通过公开 client 连接已有 Kernel，保留四参数 invoke 和按 invocationId interrupt；不创建或关闭共享 Kernel/Codex Engine。
2. 保留 `ImAgentConfig`/`bot.agent` 作为 Gateway 面向业务的配置；Gateway 统一编译为仅含 schema/items 的上游 AgentEnv。业务不需要构造信封，Gateway 不恢复上游已删除的 AgentConfig/ExecutionPlan，不向公共协议添加 Provider 私有 schema。
3. 模型材料、人格和渠道说明由 Gateway 编译进 inputs；执行环境及凭据不得进入模型正文。
4. 上游只消费调用方准备好的目录；Gateway 作为调用方维护自己的默认目录策略，不把该责任重新交给 Runtime。
5. 会话代次、reset、准入、历史预算、图片、冻结重试、恢复输入、投递及四秒关闭边界保持。
6. 绝不扩大 CI：不改 workflow/job/matrix/触发条件、必需状态、CI Gate 或默认测试入口；专项仅显式本地运行。

## 范围与决策

接口差异与证据见 [设计](design.md)，分步工作与验收见 [计划](plan.md)，准备度见 [评估](assessment.md)，实际已做检查见 [验证记录](validation.md)，测试、文档、脚本与 CI 清单见 [影响清单](impact.md)。

D01 已确认（2026-11-10）：`bot.agent` 是业务配置对象，保留现有 SDK 入口和业务字段，由 Channel Gateway 转换为 `AgentEnv.items`。SDK/CLI 调用方不必了解信封协议，不新增并行的 `bot.agentEnv` 配置来源。上游删除内部模型不要求删除 Gateway 自己的业务配置。

D02 用户追加（2026-11-10）：在 `bot.agent` 增加可选 `instruction?: string`，主要用于新会话首轮前置提示词。它属于模型材料，由 Gateway 放在输入前面，不映射为 AgentEnv item；首轮、续聊与恢复规则见设计。

D03 用户追加并明确（2026-11-10）：模型 Context 输出改为注释边界和逐项 `<context namespace="..." name="...">`，取消固定 `<contexts>/<context-item>` 列表外壳；内部 guidance/data 的现有表示保留。哪些项注入、哪些项不注入，规则与之前完全一致；只改外层表示，不扩大 namespace/name 匹配范围。

D04 用户追加（2026-11-10）：进程环境变量 `OCO_CHANNEL_GATEWAY_DEUBG` 严格等于 `1` 时，在调用公开 client 前，以 debug 日志记录最终完整 inputs 和 agentEnv。保留图片 part 的完整 base64、类型与元数据及 fallback parts，不转占位文本、不截断。只记录到既有渠道日志或宿主日志端口，不进入状态镜像。该显式开关允许记录凭据；默认日志继续脱敏。沿用日志容量和关闭边界，日志故障不得阻断或修改执行；SDK 未配置日志端口时保持静默。

## 非目标

不修改上游 Runtime、Provider 协议、账号认证、用户现有配置文件、运行中服务或工作目录数据。不替 OctoBuddy 实现 Adapter，不在 Gateway 增加 Engine 管理平台。不批量修改历史任务或把任意 `1.1.12` 测试样本替换成新版本。

## 验收摘要

- 正式 registry 锁住 1.1.13 的 Runtime/client，生产仅 client，干净 frozen install 成功。
- 不发送旧 instructions、顶层 agentSource/approvalMode 或 workspace.mode。
- 业务仅提供 bot.agent，Gateway 完成通用及已约定私有选项到 item 的映射；SDK/CLI 无需调用方提供 AgentEnv。
- 自定义 Adapter 私有 item 内容与相对顺序经过真实 client/Kernel 后保持，模型正文不含私有执行配置和凭据。
- 人格/渠道说明在主输入及恢复输入各出现预期次数；冻结重试不重复追加。
- bot.agent.instruction 在新 Provider 会话首轮作为最前面的文本 part；正常续聊不重复，fresh fallback 的完整恢复输入携带同轮冻结 instruction。
- 模型材料使用注释与 context 标签，内部原文、JSON、CDATA 及条目顺序保持；执行私有项和凭据不因放开业务格式进入正文。
- 本地目录已存在且可访问，错误路径在执行前明确失败，OpenClaw 无本地目录要求。
- 既有生命周期与业务回归、双语文档、发行物消费者验证通过；真实 Provider/IM 与平台未验范围单独记录。
