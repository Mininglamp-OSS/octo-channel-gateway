---
type: Design
title: Runtime 1.1.13 上游差异与 Gateway 迁移设计
description: 按源码证据区分生产调用、SDK 配置及验证工具需要适配的变化。
tags: [architecture, protocol, context, adapter, migration]
---

# 已核实的变化

以下路径及行号对应 Gateway 基线 a6e661b；上游证据固定在 Runtime tag v1.1.13，不把未来 main 当成本次接口依据。这里是静态兼容性分析，不是已完成的编译或运行验收。

| 变化 | Gateway 当前证据 | 影响与目标 |
| --- | --- | --- |
| AgentEnv 顶层仅 schema/items | `packages/gateway/src/execution/kernel-input.ts:21` 还输出 agentSource、approvalMode | 删除旧顶层字段；source 编译成 `octo.execution/agent` 的 `{source}`，审批沿用 `octo.security/approval_policy` 的 `{mode}`。上游 assertAgentEnv 会做信封字段检查。 |
| 删除 control instructions | `execution/dispatcher.ts:16,155` 导入 ContextInstructionsPayload 并生成 octo.control/instructions；kernel-input.ts:26 继续转发 | 上游类型已移除且信封显式拒绝该项。人格、MENTION_GUIDANCE 由 Gateway 编译为普通输入文本，不声明 system/developer 权限。 |
| 私有 item 不透明透传 | `execution/kernel-input.ts:23` 仅放行 octo.execution、安全审批和旧 instructions | 会静默丢掉 `adapter.my-adapter/options` 等私有项。Gateway 从业务配置编译出的执行项，以及已有入口显式提供的执行项，不能在发送边界被白名单过滤；其 payload 不再生成上游公共配置投影。 |
| workspace payload 仅 path | `execution/dispatcher.ts:128` 仍输出 `{mode:"fixed",path}` | 去掉 mode，Gateway 在 invoke 前完成目录准备。旧 mode 不在 Runtime 做兼容转换。 |
| OpenClaw Agent 选择改为私有配置 | `execution/dispatcher.ts:102` 把 provider_agent_id 塞进 adapter bean | 上游 OpenClaw 从 `adapter.openclaw/options` 读取 `agentId`。迁移到该私有 item；不得加入公共协议类型。 |
| Codex Engine 与 executable 归宿主 | scripts 下真实验证脚本导入 `/adapters/codex` 或私有 `loadCliAdapters` | 生产 Gateway 继续仅连接已有服务；验证工具改为连接测试 Kernel，或用公开完整 Runtime Kernel API 配置受控假 Adapter。真实原生宿主验收另选明确工具，不引入私有包依赖。 |
| Core 不再生成旧配置投影 | 多个 test 通过 prepareInvokeInput 后读取 controlInstructions、workdir 等旧字段 | 测试改断言原始 AgentEnv/parts 或真实 Adapter 消费结果；不能恢复旧投影或在 mock 中伪造兼容。 |
| 公共 SDK/文档版本提高 | package.json 及 `apps/cli/src/runtime-prerequisite.ts:6`、双语依赖文档仍为 1.1.12 | manifest、锁、安装/排障提示与双语文档同步到最低 1.1.13；IPC v2 本身不能证明旧 Kernel 支持新语义。 |

主要上游来源：PR #337（提示词/目录）、#342（Engine）、#344（AgentEnv）、#345（单 Harness）、#347（宿主绑定 executable）。公开 SDK 证据见 Runtime `docs/zh-CN/getting-started/sdk.md`、`packages/octo-runtime-protocol/src/invoke-input.ts`、`packages/octo-runtime-adapter-openclaw/src/index.ts:111` 和 `packages/octo-runtime-adapter-sdk/src/agent-env.ts`。

## D01：保留业务配置，由 Gateway 编译（已确认）

2026-11-10 用户确认：业务只关注 `bot.agent` 对象，Channel Gateway 负责把它转换为 `AgentEnv.items`。保留 `ImAgentConfig` 及现有 SDK/CLI 配置入口；不要求业务方理解 schema、namespace/name 或构造信封，不新增 `bot.agentEnv`，也不删除现有 model/effort/mcp/envs 等业务字段。

这里的业务配置类型由 Gateway 自己拥有，不等于上游被删除的 AgentConfig；上游的“完全透传”作用于 Gateway 编译完毕后交给 client 的信封。业务对象到协议项的转换是 Gateway 的职责，不能要求业务调用方承担。

| 业务来源 | Gateway 输出 |
| --- | --- |
| `bot.agent.adapter_type` | `octo.execution/adapter` 的 `{type}` |
| 根据 Adapter 选择的 agentSource | `octo.execution/agent` 的 `{source}` |
| `bot.agent.model`、`effort` | `octo.execution/model` 的 selection/reasoning |
| `bot.agent.mcp`、`envs` | `octo.execution/mcp`、`envs` |
| `bot.agent.workdir` 或 Gateway 默认目录 | `octo.execution/workspace` 的 `{path}` |
| `bot.agent.provider_agent_id` | `adapter.openclaw/options` 的 `{agentId}` |
| 既有 `bot.approval_mode`、`run_timeout_ms` 等渠道策略 | `octo.security/approval_policy`、`octo.execution/limits` |

转换在 Gateway 的单一执行编译路径完成，CLI 与 SDK 共用，防止两边默认值或私有字段映射分叉。保留现有静态/动态 Context 的明确覆盖顺序和重试冻结语义；不因本次改造增加第二份可独立覆盖的 AgentEnv 来源。业务配置及调用方对象不得被编译过程修改。

自定义 Adapter 的私有执行参数仍由业务和对应 Adapter 约定。若需扩展 Gateway 的业务配置承载这些参数，应通过 bot.agent 的业务字段在本地映射；不要求业务提交 ContextItem，不注册到上游公共 schema。本次不凭空新增通用私有配置注册平台或强制所有 Adapter 共用构造参数。

## D02：bot.agent.instruction 首轮前置提示词

用户追加可选 `instruction?: string`，业务示例：

```ts
agent: {
  adapter_type: "codex",
  instruction: "你是项目协作助手，回答时先给结论。",
  workdir: "/absolute/prepared/project"
}
```

该字段放在 bot.agent 是为了业务配置方便，语义属于模型输入材料。Gateway 不把它编译为执行配置、旧 octo.control/instructions 或 Provider system/developer 指令，也不依赖 Adapter 自动补写。

| 场景 | 编译规则 |
| --- | --- |
| 新 Provider 会话首轮 | 以单独 text part 放在最前面，之后依次为原有渠道/规则/历史材料和本轮输入；不改变原有图片相对顺序。 |
| 同一 Provider 会话正常续聊 | 不重复前置；渠道稳定说明的周期刷新不触发 instruction 再次注入。 |
| reset/new 后或已明确不可恢复的会话 | 下一次实际新建 Provider 会话时，使用该轮配置快照中的 instruction。reset 本身不执行模型。 |
| 续聊失败，明确进入 fresh fallback | 主续聊输入不重复前置；预先编译完整 fallback parts/text 时，在其最前面带上同轮冻结 instruction，供新会话恢复使用。禁止 Gateway 为补提示词重放结果未知的执行。 |
| 同轮卡片重试、网络重试和预算重试 | 复用已冻结的输入/恢复稿，不再次读取配置，不再拼接一次。 |
| instruction 配置更新 | 不向已有 Provider 会话自动追加或重建；下一次新会话使用更新后的值。 |

省略、空字符串或全空白表示不提供；其他非字符串值在业务配置校验时报稳定错误。有效文本保留原文，计入已有配置与请求字节预算，超限明确失败，不静默截断。首次发送失败不能只因本地 attempted 标记就永久认定已注入，须依实际 Provider binding 和既有恢复事实判断；不建立无法证明的恰好一次承诺。

源码目前用 `refreshStableContext` 同时表达渠道刷新与无可恢复 Provider 会话（application/im-channel.ts:1205、execution/dispatcher.ts:50）。实施时区分“新会话首轮 instruction”和“渠道材料周期刷新”，不能直接复用同一个布尔值。instruction 快照必须随 occurrence/恢复稿冻结，避免续聊 fallback 或冻结重试使用后来更新的文本。

公开类型、业务配置校验、SDK/CLI 配置读写、可编译示例及双语 docs 同步补充此字段；不要求新增 CLI flag，不保存或迁移 Provider 自有提示词文件。旧控制指令的材料迁移和新字段统一走输入编译路径，不能在两处重复追加。

## D03：仅调整模型 Context 外层表示，注入规则不变

模型材料是 Gateway 生成的提示词片段，不要求固定的标准 XML 列表。删除 `<contexts>` 总容器，逐项标签由 `<context-item>` 改为 `<context>`，外侧继续用合法的 ASCII 注释 `<!-- ... -->` 标记边界。示例：

```xml
<!-- Context information begins: the following is the current context -->
<context namespace="extra.im" name="message">
  <guidence>本条消息的业务说明，格式与原来一致。</guidence>
  <data><![CDATA[{"text":"本轮材料"}]]></data>
</context>
<context namespace="extra.project" name="notes">
  <data><![CDATA[项目材料原文]]></data>
</context>
<!-- Context information ends -->
```

内部规则不变：现有输出名 `<guidence>` 保留，不借此次改动更名；guidance 有值时按原文输出，空值省略；`data_format: text` 输出 payload.text 原文，其他 payload 完整 JSON 序列化并按既有规则排序对象键；data 使用 CDATA 并拆分 `]]>`；条目与数组顺序保持。不翻译、不摘要、不重新解析 payload 内部的 XML/Markdown/JSON。无业务材料时不输出空容器或注释。

用户进一步明确：哪些项注入、哪些项不注入，沿用之前规则。本次保留 model-input.ts 的 MODEL_CONTEXT_PATTERNS：`extra.*` 下的材料，以及 `octo.content/inline`、`octo.content/references` 可进入现有 renderer；其他项继续不由该 renderer 注入。namespace/name 使用原值，不把 extra.im 改名为 im，也不增加 im/project 等新匹配范围。已有来源验证、动态覆盖、刷新周期、渠道自有 extra.im 不可覆盖和预算规则保持。

新 bot.agent 编译结果和 Adapter 私有执行项仍进入 AgentEnv，既有模型材料仍按原规则选取。不得修改 MODEL_CONTEXT_PATTERNS 为全量渲染，也不增加按来源绕过原过滤的新路径。D01/D02 约定的执行协议迁移和新 instruction 字段分别处理；D03 本身仅改变选中条目的外层格式，不能改变选中集合。

instruction 首轮前缀仍在这些注释片段之前，用户本轮文字/图片仍在材料之后，fresh fallback 与普通输入使用同一格式。输出只作为模型可读的分隔约定，不提供 XML 解析或权限隔离保证；不新增 XML parser/schema 依赖。

## 两条输入路径

模型路径：bot.agent.instruction（按 D02 选择首轮/恢复前缀）与静态/动态材料 → Gateway 合并与预算 → 人格/规则/历史/渠道说明按 D03 渲染 → inputs.parts 及显式恢复输入。原先 instructions 的动态替换、刷新周期和业务顺序迁为 Gateway 自有普通材料规则；不能把已删除的旧 namespace 改成私有执行项后期待 Runtime 自动渲染。

执行路径：业务提供 bot.agent → Gateway 按既有渠道策略和明确 Context 覆盖规则编译 AgentEnv.items → 冻结本轮副本 → 仅覆盖 Gateway 拥有的可信工具凭据及显式剩余预算 → client → Kernel → Adapter。Gateway 校验自己的业务配置，公共协议只验证信封，Adapter 校验自己消费的字段。编译完成的私有项不因发送边界白名单被丢弃或重排；除具名的凭据/预算修改外，已冻结 payload 保持原值。执行 item 不经过 model-input renderer。

凭据继续使用当前 Manager 身份，Windows 环境变量键按不区分大小写覆盖。默认公开日志继续脱敏；D04 是用户明确要求的完整 debug 日志例外，不能进入状态镜像。

## D04：完整 client 输入 debug 日志

环境变量名严格采用用户指定的 `OCO_CHANNEL_GATEWAY_DEUBG`，值严格为 `1` 才启用。ImTask 在本次剩余预算与可信工具凭据合并后、每次公开 client invoke 前，发出 `agent_run.client_input` debug 事件，数据为独立克隆的最终 `{inputs, agentEnv}`。完整保留图片 base64、mimeType/byteSize/sha256、fallback 输入、私有 item 和凭据；不转为图片占位文本、不截断，也不把该快照用于执行。

SDK 通过可选 log 回调接收，未提供时静默。CLI 沿用既有渠道日志 worker/文件，只为此精确事件启用完整序列化；默认 info/warn/error 仍按原规则脱敏。状态镜像及 logs 命令不展示该原始快照。日志异常被隔离，不中断或修改调用；沿用既有文件容量与清理边界，debug 队列达到 8 条时整条丢弃，不写半截图片。

开关须设置在实际 Gateway 进程环境中；前台 `run` 可从当前 shell 继承，服务管理器启动的进程使用其服务环境。此任务不把 shell 临时变量自动写入已安装的服务定义。

## 目录与会话

现有默认目录 `~/octo-runtime/channels/<bot_id>` 是 Gateway 自己的产品策略，可保留，由 Gateway 显式 mkdir。`execution/dispatcher.ts:349` 仅创建默认目录：显式 workdir 当前只有绝对路径检查，需要验证已存在、目录类型及访问错误，不在失败时静默回退。若实现选择为显式路径建目录，须另确认，不能把它当作依赖升级的必然行为。

OpenClaw 使用 Provider 工作区，不制造本地 path；其他 Adapter 的工作目录在发送前准备好。reset 不删除目录，恢复使用本轮冻结路径，消失则明确失败。禁止更换默认目录位置或清理用户数据。

## 生命周期与不受影响入口

四参数 `KernelClient.invoke`、interrupt、ProviderSession、观察断流与取消/终态/投递边界继续适用。`InvokeEnvironment` 在上游仍存在，不能因旧 AgentConfig 被删除就顺带删除 `executionEnvironment()`；核对其值哪些仍用于本地取消、哪些由 Gateway 有意识地编译为凭据 item。

同一个 client 不证明跨版本完全兼容；推荐用户协调 Runtime/client 至 1.1.13。生产 CLI 的前置探测、注册和 doctor 均使用公开 attachKernel；启动提示提高最低版本，不发明上游未提供的能力协商或在 Gateway 启停共享 Runtime。不根据 model/effort/MCP 为 Gateway 创建 Codex app-server。

## 测试和工具清单

- `test-support/kernel-mock.js:49` 仍从 agentEnv 顶层反推配置，应改读 item，并让信封校验捕获旧形状；另保留真实 IPC 验证，防止 mock 掩盖不兼容。
- `test/kernel-input.test.js`、`test/im-mention-instructions.test.js`、`test/model-context.test.js`、`test/im-protocol.test.js`、`test/im-group-rules.test.js` 等迁移旧指令和投影断言。
- `scripts/evaluate-history-intent-live.mjs`、`scripts/verify-history-intent-im-live.mjs` 使用已删除 `/adapters/codex` 和旧 control 指令。
- `scripts/verify-{model-wait,channel-artifacts,channel-features,codebuddy-model,opencode}-im-live.mjs` 使用源码相邻路径或 loadCliAdapters，逐个移除 Runtime checkout 耦合。保留实验意图，不用假 Kernel 冒充真实 Provider 结果。
- `scripts/verify-package.mjs` 已采用公开 Kernel + 自有假 Adapter，保留为包外验证主路径；检查 request.agentEnv 与输入事实，不仅确认 run.completed。
- `docs/examples/agent-execution.mts`、definition 示例保留 bot.agent 业务写法，CLI 配置及两语言说明更新内部编译和新最低依赖；不把内部信封变成用户必填参数。

历史 journal、发行 SemVer 单元测试里的 1.1.12 样本、cross-service 来源 revision 不属于当前版本声明，不批量替换。
