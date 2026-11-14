---
type: Task
title: Gateway 消费 Runtime 静默通知并删除旧静默逻辑
description: 只根据上游事实更新卡片，删除本地静默计时和取消，不保留兼容层。
tags: [channel, lifecycle, architecture, docs]
timestamp: 2026-11-13T15:00:00+08:00
slug: ort-93-runtime-idle-notice
upstream: ORT-93 / Mininglamp-OSS/octo-channel-gateway#34
source: self
---

# Gateway 消费 Runtime 静默通知

## 先看变化

这是一次执行归属修正和卡片展示重构。用户已明确要求直接删除旧业务逻辑，允许破坏性更新，不做任何兼容层。

| 场景 | 变化前 | 变化后 |
| --- | --- | --- |
| Runtime 报告已静默 60 秒，通知在 80 秒时才送达 | Gateway 按自己的到达时间和计时器展示等待 | 卡片显示“模型已 60 秒无输出”，不加上交付延迟 |
| Runtime 连续下发 60/120/180 秒静默通知 | Gateway 仍以本地计时驱动展示 | 每条上游通知驱动原卡片刷新，分别显示源报告时长；需要部署包含周期实现的 Runtime，不能由 Gateway 补发 |
| 通知之后没有新事件 | 每 30 秒更新等待时长 | 卡片保留最后一次上游提示，不自行生成下一次更新 |
| Gateway 观察不到输出超过 300 秒 | Gateway 请求取消，并产生本地超时文案 | 不因本地静默取消；执行是否超时只消费 Runtime 的真实结果 |
| 收到新的公开模型文本或真实终态 | 同时受本地静默状态影响 | 现有事件投影更新卡片，清除过期静默提示 |
| 用户点击 Stop | 通过原 invocation 请求取消 | 保留原调用与终态确认，不把取消 ACK 当完成 |

“不影响现有业务”指保留准入、会话、执行调用、重试、附件交付和取消清理合同；旧静默取消及其派生展示按用户要求删除。用户本次进一步确认默认启用 Runtime 超时控制，因此默认策略调整不再是纯卡片变更；不能继续保留 Gateway 自有静默取消或默认 observe。

## Goal

- Gateway 只消费 Runtime 的模型静默事实，通知只驱动卡片展示。
- 删除静默时钟、周期更新、等待状态机、300 秒取消、10 秒取消确认计时及本地静默超时文案。
- 直接移除旧类、类型、回调、内部字段、测试和文档，不保留空壳、别名、旧事件适配、配置开关或本地计时回退。
- 保留普通卡片渲染、节流、去重、终态屏障和真实终态/清理事实。

## Background

- 来源：[GitHub #34](https://github.com/Mininglamp-OSS/octo-channel-gateway/issues/34)。Loop 分诊评论：`49f8673d-e5ac-46e0-b3c7-41a1b3d48697`。
- 最新 fetch 后基线与 HEAD 相同：`origin/main@1b57f2ae18a22c3766b5eaa17c7b539ac2a1cc76`，无需 rebase。
- Worktree：`/Users/lvsijia/codex.mlamp.cn/dmwork/octo-component/octo-channel-gateway-ort-93`；分支：`ort-93-runtime-idle-notice`。
- 旧逻辑不只在卡片：`im-channel.ts` 使用 timeout 快照覆盖最终回复，并将部分 cancelled 结果解释为可 Retry；必须删除这些派生分支，恢复普通上游结果路径。
- Runtime 在 `c9d3bb6a642abce3177ac28cf9f26993909c3d32` 实现通知；分诊实际下载的 client `1.1.14` 发布包 build-info 指向该提交，并包含通知类型、schema 和校验器。当前 Gateway 已依赖 `^1.1.14`，不需要本地 Runtime 源码覆盖或私有包。
- 连接的 Runtime 服务也必须具备上述通知能力；旧服务没有通知时不显示静默提示，不建立兼容或探测回退层。

## Load-bearing list

- `architecture`：模型静默与预算归 Runtime；只通过公开 client 和 `/protocol` 消费。
- `channel`：卡片投影、流身份/代次、去重、终态屏障、普通最终消息与 Retry 控件。
- `lifecycle`：显式 Stop、取消 ACK、源流耗尽、owner 关闭与清理预算。
- `docs`：中英文同步说明通知、服务版本要求和预算行为。
- 已读仓库规则：`gateway-architecture`、`gateway-channel-behavior`、`gateway-review`、`gateway-documentation`。本 checkout 未携带 `.octospec/_global/`，不为本任务更新规范依赖；实现前再次核对匹配规则。

## 已确认决策

1. 用户本次要求：破坏性删除旧静默逻辑，不做兼容层；新通知只影响卡片推送。
2. 静默通知不得触发 invoke、interrupt、自动重试、最终正文追加、附件上传、会话绑定或执行终态变更。
3. 用户 Stop、展示失败的既有取消策略、显式 deadline、重试恢复预算、close 四秒共享截止、连接心跳等均不属于静默计时器，不得批量删除。
4. 不修改 Runtime 协议、不增加 RPC、不扩大 GitHub CI，也不增加默认专项测试选择。
5. 根据本次四点反馈，默认采用 `enforce`，由 Runtime 执行超时；Gateway 不默认注入 `observe`。用户显式填写 `observe` 不拦截、不替换、不报配置错误，但由此导致的超长模型空闲等待属于本项目超时保障约定中的 invalid 用法，不承诺模型空闲上限保障。其他有效执行预算仍生效。

## 超时归属与默认预算

- Gateway 传递本轮 `agentEnv` 的业务预算，Runtime 负责有效预算解释、单调时钟、超时判断和执行终止。Gateway 不基于静默 notice、接收时间或本地计时器请求取消。
- 删除 dispatcher 的 `model_idle_policy:observe` 和仅用于旧静默计时器的 `first_frame_timeout_ms:310000`。不显式注入策略时采用 Runtime 的 `enforce`；业务显式提供的同名 limits 字段保持已有覆盖优先级。
- 未显式覆盖时，当前 Runtime 首帧预算 60000 ms、模型空闲预算 300000 ms、模型空闲告警预算 120000 ms、取消宽限 1000 ms。Gateway 原有 `run_timeout_ms` 默认 86400000 ms、`tool_timeout_ms` 默认 86400000 ms 保持。工具总耗时预算未设置时不擅自新增。
- 允许业务通过现有 `octo.execution/limits` 控制 `model_idle_timeout_ms` 等合法预算，不新增 Gateway 专用超时配置或第二套校验协议。`enforce` 的空闲判断使用 Runtime 的有效进度口径；不能将它与公开文本静默通知的时钟视为同一时钟。
- 默认首帧超时可能早于静默通知生效；不为保证卡片出现而放宽预算。Runtime 先发真实终态时直接展示终态，不能补发静默卡片。
- invalid 是使用约定，不是协议非法值：Runtime 仍支持 `observe`。Gateway 不为显式 observe 新增禁止、强制 enforce、自动修正或兼容层。
- 用户 Stop、owner 关闭、展示失败等既有非静默取消路径，以及逻辑任务总时限/恢复预算仍保留；本次“Runtime 做超时控制”指执行侧 limits 和静默超时，不顺便重构任务级重试及清理机制。

## 架构与开发者文档交付

实现阶段同步更新以下位置，不能只将架构决定留在本 brief 或 Loop 评论中：

- `.octospec/rules/architecture.md`：写入默认 enforce、Runtime 执行超时、Gateway 不持有静默时钟、显式 observe 的 invalid 使用约定。
- `docs/zh-CN/reference/configuration.md` 与 `docs/en/reference/configuration.md`：说明默认预算、`agentEnv` limits 覆盖、observe 不受模型空闲上限保护以及首帧预算独立生效，给出 enforce 和可调空闲时限示例。
- `docs/zh-CN/guides/lifecycle-and-delivery.md` 与 `docs/en/guides/lifecycle-and-delivery.md`：说明静默通知只刷新原卡片、真实终态与 Stop 语义，以及周期通知的实际上游前提。
- 删除上述文档与源码注释中“Gateway 静默 300 秒取消”及“Gateway 自己每 30 秒更新”等旧承诺；保持其他合法预算和取消说明。

## 通知与卡片合同

- 使用现有 JSON-RPC `agent_run.event` 承载的 canonical `run.notice`：`code=model_output_idle`、`severity=info`、`params={silenceMs, message}`。
- `silenceMs` 为不小于 60000 的整数，message 为上游规定的 `<floor(silenceMs/1000)>s no LLM output`。使用公开 client 的正常校验，不另造宽松旧 payload 适配器。
- 中文卡片文案固定为“模型已 N 秒无输出”，N 仅取 `Math.floor(silenceMs / 1000)`；例如 65432 显示 65 秒。不得用 Date.now、performance.now、事件时间戳或接收时间补算 N。
- 复用现有卡片状态/标签出口及普通渲染调度；不为此创建新卡片，不插入伪造模型文本、工具明细、终态或失败条目。正常卡片总耗时可以继续更新，但不能用它更新静默秒数。
- 只保留当前展示所需的有界字段，不维护 silence start、工具/审批集合、取消状态或静默历史。后续合法 notice 可以替换当前提示，不能用最大秒数把不同静默区间合并。
- 新的非空公开 assistant 文本 delta 或增长的文本快照通过现有文本投影清除静默标签。空白、重复/回退快照、usage、心跳和私有 reasoning 不冒充新模型输出；复用已有消息投影信息，不建立第二个文本增长跟踪器。
- 工具、审批、排队、重试等后续真实阶段事件照现有投影更新卡片，可替换当前标签；Gateway 不根据这些事件启动、暂停或重置任何静默计时，也不在等待结束后自行恢复静默提示。
- `run.completed/run.failed/run.cancelled` 清除静默提示并沿用普通终态展示；迟到/重复事件沿现有身份、代次与终态屏障处理。重连或重放不重启时钟、不新增静默生命周期、不跨 invocation 复用标签。
- 不新增独立 notice 去重历史或重放机制；现有 client 流规则及卡片去重处理重复事件，相同展示不产生额外周期推送。
- 每条通过现有流规则接纳、内容变化的静默 notice 都进入原卡片刷新流程；仍遵循普通渲染节流与终态屏障，不能因“已经展示过静默”而吞掉后续不同秒数通知。不要求重复相同 notice 强制推送相同卡片。

### 每 60 秒刷新的上游前提

用户要求的目标是 Runtime 每隔 60 秒下发静默事实，Gateway 每次刷新卡片。规格阶段核对的 Runtime `8376be62` 和发布版本 `1.1.14` 为每段一次。2026-11-14 实现阶段重新 fetch，Runtime `origin/main@67a44ebc` 已合并 ORT-95 周期通知修复；它沿源端单调时钟在 60/120/180 秒等节点报告实际时长，背压时不补发错过的分钟。client `1.1.14` 的现有 payload 可消费，无需新增 Gateway 协议或兼容层。

本任务 Gateway 部分必须正确处理上游持续下发的多条通知，但不得通过本地计时生成缺失通知。完整“同段静默每 60 秒更新”需要连接已包含周期修复的 Runtime 服务。实现阶段允许以该 main 独立构建的真实 Kernel 验证 A15，并单列源端受控时钟与模拟 IM 接收端的边界；发布版本仍为 `1.1.14`，不能将源码联调等同于已发布或已部署。不修改跨仓 Runtime 实现，不在 Gateway 中补齐能力。

## 删除清单与保留边界

| 位置 | 要求 |
| --- | --- |
| `execution/model-wait.ts` | 整体删除 ImModelWait、ModelWaitSnapshot、MODEL_WAIT_TIMEOUT_MESSAGE |
| `execution/task.ts` | 删除 modelWait 所有生命周期与回调、IM_MODEL_SILENCE_TIMEOUT 分支及相关取消宽限；保留原 invocation、cancel pending、finished 和源流耗尽逻辑 |
| `application/im-channel.ts` | 删除计时触发更新回调、snapshot.modelWait、静默超时驱动的 Retry 与 finalReply 覆盖；使用普通 projector.finalReply 与真实失败控件规则 |
| `presentation/run-projector.ts` | 删除旧快照类型，增加上游通知卡片标签投影；复用既有文本与阶段事实 |
| `transport/reasoning-frame.ts` | 删除本地等待秒数和静默超时状态文案，沿用普通标签/终态渲染 |
| `execution/dispatcher.ts` | 删除 310 秒首帧与 observe 默认覆盖，继承 Runtime 默认 enforce；run_timeout_ms、tool_timeout_ms 与显式输入覆盖优先级保持 |
| 测试/文档 | 删除 im-model-wait 旧专项测试及相关旧断言，更新现有重试、投影、卡片、取消/清理和双语说明 |

## 决策与上游待办

| ID | 已确认方案/待办 | 影响与执行条件 |
| --- | --- | --- |
| D1（已确认） | 删除旧 310 秒首帧和 observe 默认覆盖，采用 Runtime 默认 enforce 和预算控制 | 用户本次明确要求默认超时控制；保留显式 observe 的传递能力并记录 invalid 使用约定，不再等待二选一 |
| U1（部署前提） | 同段静默每隔 60 秒由 Runtime 下发通知，Gateway 每条刷新卡片 | 源码 `67a44ebc` 已实现，可本地联调；部署时必须包含该修复，发布版 `1.1.14` 仍每段一次，不允许 Gateway 本地回退 |

默认策略已决，无需重复确认 enforce 或破坏性删除。U1 是服务部署前提，不是 Gateway 自行补齐的逻辑；本地真实源端验收不替代用户环境的部署确认。

## Out of scope

- 改变准入、会话/reset、Hook、历史材料、Provider binding、附件白名单/投递、结果未知处理或自动重放资格。
- 为没有通知的服务增加本地计时、兼容字段、双轨逻辑、特性开关或启动版本探测。
- 将静默提示变成持久聊天消息、通知历史、独立推送服务或 Runtime 取消策略。
- 新增 workflow/job/矩阵/触发/必需状态/CI Gate 依赖，或通过脚本/默认测试开关扩大专项 CI。
- 未经授权提交、推送、创建 PR、合并、发布或安装全局 CLI。

## Acceptance

| ID | 本地场景 | 通过依据 |
| --- | --- | --- |
| A1 | 静态删除审计 | 生产代码无 ImModelWait、ModelWaitSnapshot、MODEL_WAIT_TIMEOUT_MESSAGE、IM_MODEL_SILENCE_TIMEOUT 及旧接线；相关文件删除，无兼容壳 |
| A2 | 60000/65432 ms 通知晚到 | 分别显示 60/65 秒；到达延迟不进入计算；仅更新卡片 |
| A3 | notice 后推进受控时钟超过 300/310 秒，源流仍可继续且没有其他预算到期 | 无静默驱动的 interrupt、invoke、重试或新增静默秒数更新；普通卡片总耗时不算静默更新 |
| A4 | 新公开文本、空文本、重复/缩短快照、私有 reasoning、usage、心跳 | 真实新公开文本清除提示，其余不伪造输出；下一静默区间 notice 可重新显示较小秒数 |
| A5 | 工具/同步审批/异步问题/排队阶段事件 | 保持既有阶段展示，不自行分类静默、不设置静默计时器、不触发取消 |
| A6 | completed/failed/cancelled 后迟到 notice、旧 invocation/代次、断连与重放 | 服从现有流身份/终态屏障；不复活卡片、不虚构时长、不重复执行或取消 |
| A7 | 用户 Stop，取消拒绝/异常/受理后迟迟无终态，真实终态后源流异常 | 原 invocation 和 ACK/终态/耗尽区别有效；无静默状态改变 Retry/失败判定 |
| A8 | 普通成功/失败最终正文与附件、重试及 reset | notice 不进入 finalReply、不增加最终消息/上传/invoke 次数；旧超时正文覆盖删除，普通业务结果保持 |
| A9 | owner close、展示失败与现有 deadline/恢复预算 | 现有取消、四秒共享清理和失败报告保持；只删除静默专用计时，不删除其他计时 |
| A10 | dispatcher 默认及显式 limits 覆盖 | 默认不注入旧 310 秒/observe 字段，Runtime 有效策略为 enforce；显式 observe 原样生效且不报错；run/tool 预算及显式输入优先级不变 |
| A11 | 不发送新 notice 的源流 | 不显示虚构静默提示、不启用本地回退；其余流处理正常 |
| A12 | CI、文档与依赖审计 | 双语说明一致；无新增协议/私有依赖；workflow、scripts、默认测试选择与实际检查范围不扩大 |
| A13 | 同源合法 notice 依次报告 60000/120000/180000 ms | 原卡片依次展示 60/120/180 秒，后续 notice 不被永久去重；没有源事件时不自行刷新静默秒数，不取消或重新 invoke |
| A14 | 受控 Runtime enforce 的合法可调空闲预算触发真实失败 | 超时由 Runtime 执行，Gateway 消费真实终态；不得靠 Gateway 时钟请求静默取消，亦不得把首帧预算误当模型空闲预算 |
| A15 | 支持 U1 的真实 Runtime 持续静默 | 每隔 60 秒由源端发事实并驱动卡片；记录实际 Runtime/client 版本。当前上游不支持时明确未执行/待上游，A13 不代替此项 |
| A16 | 架构及开发者文档审查 | 架构规则和中英文页面均有超时归属、默认 enforce、可调预算、显式 observe 的 invalid 使用约定，以及 60 秒周期能力前提，无旧本地静默策略承诺 |

## 实施与验证计划

1. 用户确认更新后规格并发起实现后实施。先删除旧类和 task/channel/renderer 全链路接线，再在既有 projector 接入通知，最后更新 dispatcher 默认策略、架构规则及双语说明。
2. 更新已有受影响测试；静默专项放在显式本地运行的位置，不新增默认专项入口。优先复用 test-support 的源流、卡片和受控时钟夹具，不通过 wall-clock 长时间等待证明没有计时器。
3. 构建后定向运行实际受影响的 task retry、projector、reasoning frame、channel cancellation/cleanup 测试及 A1-A16 专项；A15 单独记录上游版本及是否可执行。随后运行仓库既有 `pnpm run typecheck`、`pnpm test`、`pnpm run docs:check`、`pnpm run lint:spec`；不修改测试脚本扩大范围。
4. 使用 code-review 技能按 Standards/Spec 审查有证据的问题；实现阶段遵循其要求，实际验证与审查分别记录。无发行结构变动时不新增发行验证工作。
5. validation 记录代码版本、未提交 diff、真实命令/结果、未验项和 workflow/scripts/test selection diff。未获 Git 提交与推送授权。

## 可执行性自评

**96/100，规格规划评分，非验证通过结论**：行为及删除范围 29/30，所有权与业务边界 25/25，验收及失败路径 24/25，实施恢复 18/20。剩余风险为实际渠道渲染、源流重放集成、全链路删除回归，以及 U1 的真实上游周期能力。默认策略已由本次反馈确认；评分不表示 U1 已实现。

以上评分属于规格阶段；实现与实际验收结果见同目录 validation.md，不将规划评分当作验证结论。

## 本次反馈处理记录

- 来源：用户本次四点反馈，要求默认 enforce、显式 observe 不拦截但属 invalid 用法、Runtime 负责超时、架构文档同步，以及上游每 60 秒通知驱动卡片刷新。
- 处理：关闭 D1 二选一；补全预算默认值、覆盖优先级、invalid 的非校验语义；明确架构规则及双语文档落点；新增 A13-A16。
- 事实修正：当前 Runtime 并非同段静默每隔 60 秒通知；已将周期目标列为 U1，不承诺 Gateway 能在无源事件时刷新，不恢复任何本地静默计时器。
