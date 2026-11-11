---
type: Validation
title: 注册协议简化验证与复审
description: 本地回归、channel 事件输入、13 个 adapter 配置、打包和双轴审查的实际结果。
tags: [verification, review, docs]
---

# 实际验证（2026-11-11）

macOS，公开 Runtime/client 1.1.13，pnpm 11.25.0。使用新 worktree 的本地安装；未访问真实 Bot、用户 Home、系统服务或发布环境。

- pnpm build/typecheck 通过。
- 既有 test:ci 最终 581/581 通过。基线 588 项减少 7 项：删除材料加载器的 6 项（其中原有 1 项 skip）和动态材料 persona 的 1 项，未增加默认专项或测试入口。
- 初次回归的 3 个失败来自历史重试夹具仍注入 prepareMaterials；迁移为本次 channel buildContext 事件项后，16 项历史缺口测试及完整回归均通过，继续校验冻结上下文不重新采集。
- 显式 Gateway 生命周期 13 项及 Runtime/client 1.1.13 专项 9 项，共 22/22 通过，覆盖身份不匹配保留旧绑定、断网恢复、共享 client 隔离、首轮 instruction、图片与冻结重试。
- 新显式 verify-registration-protocol.mjs 4/4 通过：身份必填在副作用前拒绝；删除入口不能运行或透传；本次 XML 独立于问题且下一消息不残留；两语言 13 个 adapter 示例一致，并逐条通过实际 CLI extraset 保存到临时 Home。
- 专项发现 extraset 绕过 configure 的材料配置拒绝；补齐入口检查后验证失败不覆盖原文件。静态配置验证不能接受函数，专项使用 JSON 值核对旧字段诊断，SDK 分支另外核对回调绝不运行。
- docs:check 通过：18 对页面、38 个 Markdown 文件、214 个本地链接、共享示例类型和 2 项原有示例测试。新 adapter 示例覆盖公开 Runtime manifest 的 dsh/codex/claude-code/codebuddy/grok-build/hermes/kimi-code/mcode/opencode/openclaw/qodercli/qoderclicn/antigravity。
- Octospec lint 和 whitespace 检查通过；系统 Python 使用已有临时 venv，没有增加项目依赖。
- pack:release/test:package 通过：从 tgz 安装公开依赖并导入 SDK/运行 CLI。归档检查确认没有 materials/material-loader 的编译产物，没有 BusinessMaterial/LoadMaterials 导出，GatewayBot 声明为 botId: string。

# 独立审查

Standards 轴 0 个确认问题，独立运行注册与历史冻结 19/19；提醒检查旧 dist 孤立产物，已检查 tgz。

Spec 轴 0 个确认问题，独立运行生命周期/历史冻结 29/29；确认 13 adapter 集合与公开 Runtime 清单一致。提醒不要把内部 channel buildContext 描述为新增公共 hook，已补充两语言说明。

这是本地审查结果，不代表 GitHub 外部批准或生产 Provider 验证。所有 13 个例子验证的是配置结构与保存；未运行 13 个真实 Provider，也未测试真实 IM、Electron 或 Windows 服务。

# CI 与交付范围

材料删除阶段相对固定基线 08711719 的 .github/、package.json、pnpm-lock.yaml diff 为空；后续依赖升级见末节。没有新增检查或自动触发；新专项位于 scripts/，仅显式本地运行。当前改动未提交、未推送、未创建 PR，也未发布或修改全局安装。

# 后续 Hooks 实施验证（2026-11-11）

本节对应用户后续授权的 [Hooks 与 CLI 策略实施](hooks-implementation.md)，前述独立双轴审查只覆盖材料删除阶段，不能视为新增 Hooks 的独立审查。

- 已实现 register 第三个数组参数，以及统一 async(ctx, inputs, agentEnv) 的 pre_dispatch/pre_invoke。ctx 同链只读，业务输出完整替换；公开 inputs 为 canonical InvocationContent（含 parts）。执行身份及已选 adapter/agent/workspace 不允许通过 Hook 改写。
- CLI 在逻辑首轮把配置快照中的 agent.instruction 前置为 extra.cli/instruction XML，CDATA 终止符安全拆分，图片不转文本。reset 后首轮重新生效。SDK 原硬编码 instruction 注入已移除。
- CLI pre_invoke 根据精确 OCTO_CHANNEL_GATEWAY_DEBUG=1 输出完整请求。旧 OCO_CHANNEL_GATEWAY_DEUBG 不再支持。SDK 执行层不读取开关或硬编码输出；日志写入层只处理显式日志调用，不读取环境变量。
- 固定周期刷新已删除，旧 stable_context_refresh_interval_turns 报 IM_REFRESH_POLICY_REMOVED。渠道必要首轮/恢复材料仍遵守原协议，不替业务决定周期 prepend。
- build/typecheck 通过；最终既有 test:ci 581/581，通过日志 /tmp/gateway-hooks-ci-final.log。没有新增默认测试或 CI 入口。
- 显式本地专项 37/37：新增 Hooks 11 项、Runtime/client 1.1.13 的 9 项、注册协议 4 项、生命周期 13 项。日志 /tmp/gateway-hooks-manual-all.log。
- Hooks 专项覆盖顺序替换、只读 ctx、未知点位、非法路由/返回值、Bot/DM/群/子区隔离、首轮/业务第20轮与SDK第30轮不自动刷新、卡片及自动重试冻结、reset 中异步 Hook 隔离、准备失败不消耗轮次、合作取消及不合作关闭明确失败。
- 实际 client/Kernel 受控 Adapter 验证通过：1 MiB 图片及其 base64/摘要完整；私有 AgentEnv 与凭据日志保留；仅新开关精确值1生效；日志状态镜像为空；同步/异步/thenable/悬挂日志回调不影响执行。
- 自测发现并修正了可选 providerSession=undefined 不满足 JSON 协议校验，以及新增代次检查误丢既有 reset 前排队快照的问题。当前仅阻止 Hook 等待期间发生代次变化后的迟到发送，保持已准入旧快照的既有语义。回归与专项均通过。
- docs:check 通过：18 对页面、38 Markdown、225 本地链接、4 JSON 块、原有2项共享示例；新增 hooks.mts 类型检查通过。README、双语接入/SDK/配置/迁移/排障说明同步。
- pack:release / test:package 通过，临时安装候选 tgz 后公开 SDK 和 CLI 可使用。未全局安装，未访问真实 Bot/Provider，未运行 Electron/Windows 实机专项。
- Hooks 阶段相对固定基线 08711719 的 .github、package.json、pnpm-lock.yaml 无差异；后续依赖升级见末节。Octospec 和 git diff --check 通过。未提交、推送或发布。

# Hooks 专题文档验证（2026-11-11）

新增 docs/en/guides/hooks.md 与 docs/zh-CN/guides/hooks.md，覆盖两个点位、注册与返回值、ctx 字段表、会话与轮次、CLI instruction/debug、Electron 自有策略、可用场景、修改边界及关闭。CLI 示例明确 instruction 空串不注入，trim 非空且 index===1 才前置；Electron 不继承此配置或策略。

共享 hooks.mts 示例由业务显式提供 shouldPrepend，不为嵌入宿主暗设统一周期；增加宿主日志示例。两语言代码块一致，README/目录/SDK/配置/架构页面已链接专题。

docs:check 通过：19 对页面、40 Markdown、256 本地链接、6 JSON 块；共享示例类型检查及原有2项文档测试通过。Octospec lint 48 单元/4规则/332链接通过，git diff --check 通过。本轮仅文档和共享示例，没有改运行时代码；没有扩大 CI 或修改文档检查脚本。未重复运行与本轮无关的默认全量测试。

文档可执行性评分97/100。剩余3分为示例中的宿主真实数据源、日志队列和 Electron 生命周期需要由接入方集成验证；不是声称这些外部组件已经验收。

# Adapter instruction 文档补齐验证（2026-11-11）

两语言13个 Adapter 示例逐一含 agent.instruction=""；CLI 支持范围明确包括 OpenClaw，SDK 需自行实现并注册消费此值的 Hook。README、CLI 入门/配置及共享 JSON 同步。docs:check 通过（19对页面、40 Markdown、262链接、6 JSON块、原有2项测试）。显式运行 verify-registration-protocol.mjs 的13 Adapter 配置专项，逐份通过实际 CLI extraset 临时 Home 保存校验；两语言配置一致。git diff --check 通过，CI/默认入口未改。验证仅证明配置与文档，不代表13个真实 Provider 已端到端运行；文档可执行性仍为97/100，宿主与真实 Provider 集成不在本次文档任务范围。


# 整体实施与 Runtime/client 1.1.14 最终验证（2026-11-11）

固定比较基线为 08711719e843617a8bdad11f8dee1637b84f7239，不使用较旧的本地 main。用户追加版本要求后，生产 client 与开发 Runtime 均升级为 ^1.1.14，锁文件实际解析 1.1.14；integrity 来自公开 npm。前文 1.1.13 为阶段历史证据，不代表当前最低版本。

- 上游 ContextItem 顶层仅 namespace/name/payload。Gateway 的渠道排版字段迁入本地 payload，并由统一 modelContextPresentation 处理主输入与恢复文本；不是旧协议适配层。extra.im 只是应用内部组织约定，KernelClient.invoke 参数没有 contexts。私有执行 payload 不经排版器，AgentEnv 保持透明。
- pnpm build/typecheck 通过；最终 test:ci 581/581，无 skip，日志 /tmp/gateway-1.1.14-ci-final.log。初次升级只有旧 history.payload 断言未包含迁移后的排版字段，更新对应夹具后全量通过；未增加默认测试数量。
- 显式专项 37/37：Hooks 11、Runtime/client 1.1.14 的9、注册协议4、生命周期13。实际公开 client/Kernel 的受控 Adapter 路径、图片与私有配置、冻结重试和取消通过。日志 /tmp/gateway-1.1.14-manual-final.log。
- docs:check 通过：19对页面、40个 Markdown、262本地链接、6个JSON块、共享示例编译及原有2项测试。13个Adapter与公开1.1.14 manifest一致，例子逐个通过临时Home extraset保存。
- 用户要求的 scripts/lint-runtime-upgrade.mjs 显式运行5组检查全部通过：依赖/lock/安装版本、现行文档与示例、删除模块及孤立dist、生产模块引用与可达性、实际编译调用参数和旧字段拒绝。附带4个旧API检测器自检，支持带引号JSON键。历史Octospec记录不当作现行版本要求；模块可达性不等于证明所有局部变量或死分支均不存在。
- pack:release/test:package 通过，归档在隔离目录安装后SDK导入与CLI运行成功；日志 /tmp/gateway-1.1.14-pack.log、/tmp/gateway-1.1.14-package.log。没有旧materials编译产物。
- 两轴独立审查最终0个未解决问题。Standards发现lint未识别带引号旧JSON键，已修复并由原审查者复验关闭。Spec独立迁移专项53/53；独立升级lint5组通过。详见[双轴审查](review.md)。
- .github 相对固定基线无变更；package scripts/default globs不变，仅依赖版本及registry lock更新。新的Hooks/注册/升级专项只显式本地运行，没有新增CI workflow/job/触发/矩阵/Gate。

未验证真实IM、13个真实Provider、Electron或Windows实机；受控Adapter和配置保存不能替代这些链路。未提交、推送、创建PR、发布或全局安装，未读取真实Bot配置或更改用户服务。文档可执行性97/100，剩余为宿主实际集成；实现评分不替代以上实测。


# IM上下文分块、只读scope与输出等价（2026-11-11）

用户确认串行分块方案，重点要求重构后的实际pre_invoke数据与本次改动前一致。比较基线为本次拆分前当前worktree的编译产物，独立保存在 /tmp/gateway-im-context-baseline-1794370166；不是旧main、不是虚构或重建的请求。旧实现未提交到仓库。

- transport/im-context/index.ts直接列出trigger/reply/resources/message-content/rules/history/history-gap。各块独立产出，串行顺序、trigger预算预留及末尾位置保持。旧contexts.ts、message-trigger.ts与build_im_contexts导出删除，所有消费者更新，无转发或兼容层。
- ImContextBuildScope暴露深只读快照、channelId/type、turnIndex、取消信号和绑定本轮身份的readers。结果冻结，缓存与凭据隐藏于闭包；消息与历史计划先复制，调用方修改不能影响准备。
- 本轮身份按UID复用，包括缺失/失败；相同历史窗口和规则读取复用，不同窗口区分、跨轮重新读取。维持既有有界身份缓存，不新增跨轮规则缓存。GROUP.md读取与版本筛选在rules.ts，游标提交仍由原应用流程确认。未新增块级并发调度。
- 全量既有test:ci 581/581通过，无skip（/tmp/gateway-im-context-ci-final.log）。显式专项44/44：原37项加scope7项（/tmp/gateway-im-context-manual.log）。scope覆盖嵌套只读、调用方快照隔离、相同/重叠读取、失败/缺失缓存、跨轮/Bot隔离、私聊跳过规则、规则错误阻止后续历史以及取消后不交付缓存结果。
- verify-im-context-equivalence.mjs通过真实ImRuntime在pre_invoke捕获14场景：DM首轮引用/资源、群首轮/续聊/规则更新/空/删除、子区首轮/图片/历史失败/转发、失败轮/卡片重试/reset后首轮。对照重构前固定API响应的原始快照，parts/顺序/AgentEnv/会话及恢复参数一致。只归一化随机UUID、workdir，固定夹具时区；凭据均为测试值。快照保存在scripts/fixtures/im-context-pre-invoke.json，默认可直接复验。
- 深只读字典补查发现普通Object可能把constructor/__proto__认作已查询身份，已改为冻结的无原型字典并补测试；独立Standards复验7项和14快照通过。Spec独立复验分块、原预算和冻结语义未发现确认问题。
- build/typecheck、docs:check、升级lint及Octospec通过；两语言新增分块清单、源码链接、scope和读取边界，说明未搬动稳定渠道提示策略。旧模块构建产物已清除，升级lint检查没有孤立生产模块或dist残留。

测试全部显式本地执行；现有默认581测试及workflow范围未扩大。固定场景等价不代表所有实时网络时序等价：新增本轮失败/缺失读取复用遵循用户去重要求，同一准备内不重复查询以等待后端恢复，下一轮可重查。没有真实IM/Provider/Windows/Electron测试、提交、推送或全局安装。

分块重构最终pack:release/test:package通过，隔离安装SDK与CLI成功（/tmp/gateway-im-context-package.log）；未全局安装。最终docs检查19对页面/40 Markdown/294本地链接/6 JSON块通过，Octospec49单元/4规则/376链接通过。


# 正式PR提交前复验（2026-11-11）

用户授权正式PR到main。远端main通过GitHub API和git ls-remote确认仍为08711719，与当前起点一致。保留已配置作者superalsrk，英文commit含一次Codex trailer。

pnpm install --frozen-lockfile --ignore-scripts通过；build/typecheck、docs:check、Octospec、升级lint5组、真实pre_invoke14场景对照通过。再次完整test:ci 581/581与显式专项44/44通过，日志/tmp/gateway-pr-ci.log、/tmp/gateway-pr-manual.log。正式PR前双轴重审各0确认问题。

相对目标main的.github diff为空，package scripts不变，默认回归与矩阵未扩大。专项继续显式本地运行。变更文件未检出npm/GitHub token或私钥形态的秘密；快照只含fixture凭据。未验证真实外部服务，不执行合并或发布。
