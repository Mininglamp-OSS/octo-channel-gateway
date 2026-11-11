# Hooks：宿主业务扩展

[English](../../en/guides/hooks.md) | [文档目录](../README.md)

Hooks 是宿主业务影响 Channel Gateway 本次执行输入和执行环境的入口。Gateway 提供明确点位、会话事实和执行边界；宿主决定何时读取业务数据、追加什么内容、使用哪些执行参数以及如何记录日志。当前只支持 pre_dispatch 和 pre_invoke。

**CLI 自带两个基础 Hook。Electron App 等嵌入宿主自行实现并注册 Hooks，不会自动继承 CLI 的 instruction 配置、首轮策略或 debug 开关。** Hooks 不接管 Runtime 内部的推理、工具调用或 Provider 生命周期。

## 如何选择点位

| 点位 | 何时执行 | 适合的场景 | 重试时的行为 |
| --- | --- | --- | --- |
| pre_dispatch | 消息完成准入、排队和渠道输入准备后，本轮提交之前 | 异步读取业务说明、按轮次 prepend、附带本次感知 XML、按业务规则调整允许修改的 AgentEnv 项 | 已冻结的同轮重试不重新调用；复用业务加工结果 |
| pre_invoke | Gateway 每次实际调用 KernelClient.invoke 前，已取得完整 inputs/agentEnv | 观察最终请求、完整日志、首次提交前的最终参数加工 | 冻结重试会再次经过此点位，但必须原样返回当前请求；再次修改会被拒绝 |

例如，业务希望第 1、20、40 轮补充项目说明，应在 pre_dispatch 中判断轮次。业务希望记录真正交给 Kernel 的文本、图片和执行参数，应把日志 Hook 放在 pre_invoke 链的最后。将周期 prepend 放在 pre_invoke 会在重试时再次追加，触发冻结请求校验。

register 只保存 Hook 定义，不立即调用处理函数。没有通过准入的消息和控制命令不会作为普通执行轮次进入这两个点位。Runtime 内部重试不是 Gateway Hook 事件。

## 注册、参数与返回值

调用实例方法 `await gateway.register(bot, agent, hooks)`。第三个参数直接是数组，每项包含 type 和 hook；不需要 name，不包在另一层 options 中。省略 hooks 等价于空数组。一个 Gateway 可以为不同 Bot 注册不同的业务 Hooks。

接口结构如下；完整公共类型见 [hooks.ts](../../../packages/octo-channel-gateway-sdk/src/hooks.ts)：

```text
hooks: [{ type: "pre_dispatch" | "pre_invoke", hook }]
hook: async (ctx, inputs, agentEnv) => ({ inputs, agentEnv })
```

| 参数 | 内容 | 业务方如何使用 |
| --- | --- | --- |
| ctx | 本次执行的只读会话快照及取消信号 | 读取身份、轮次和路由，不修改 |
| inputs | GatewayInputs：canonical InvocationContent，包含 parts 及调用元数据 | 用 inputs.parts 处理有序文本/图片，返回完整 inputs 对象 |
| agentEnv | 公开 AgentEnv，包含 schema/items | 调整允许的执行项，保留不需要修改的项，返回完整信封 |

inputs 不是裸 parts 数组，也不是一个名为 request 的旧信封。Gateway 在 Hook 链完成后调用 `kernel.invoke(inputs, ctx.sessionId, ctx.providerSession, agentEnv)`。

同一点位按数组中的相对顺序串行执行。前一项返回的 inputs 和 agentEnv 完整替换当前值，传给下一项，不自动合并。未修改时返回 `{ inputs, agentEnv }`；不能返回 void 或只返回 inputs。建议构造新对象，避免修改业务共享配置。

一条 Hook 链内的 ctx 是同一个对象。下一轮或实际会话路由变化时，Gateway 构建新快照。两个点位的先后由执行流程决定，不由它们在数组中的全局位置决定。注册会复制数组；同 Bot 再注册时整体替换 Hooks，不累加。未知点位 warning 后忽略，已知点位缺少函数则拒绝注册。

## ctx 中有哪些数据

| 字段 | 类型/值 | 含义与可能用法 |
| --- | --- | --- |
| botId | string | 显式注册并经认证核对的 Bot ID；选择该 Bot 对应的业务配置 |
| sessionKey | string | 不透明渠道会话键，包含平台/渠道等隔离信息；用于业务索引，不解析其内部拼接格式 |
| generation | number | 当前会话代次；reset/new 推进代次，业务缓存若按代次隔离可使用它 |
| sessionId | string | 本次传给 Kernel 的执行会话标识；用于关联执行日志 |
| providerSession | 只读 ProviderSession 或 undefined | Provider 返回的原生续聊信息；没有绑定时为空，不能把它当作 sessionId 的别名 |
| messageId | string | 触发本轮的渠道消息 ID；跨会话使用时结合 botId/sessionKey 定位 |
| conversation.kind | direct / group / thread | 区分私聊、群聊和子区；选择对应的业务说明 |
| conversation.id | string | 当前私聊、群或子区的渠道地址；用于宿主自己的业务查询 |
| turn.index | number，从 1 开始 | 当前逻辑轮次；由业务判断首轮或周期条件 |
| signal | AbortSignal | 所属工作的取消信号；传入异步读取操作并响应取消 |

ctx 不包含完整聊天记录、用户档案、通用可写 state、isFirst 或 shouldRefreshContext。它也没有一个单独的 providerSessionId 字段；如需原生会话 ID，读取 `ctx.providerSession?.sessionId`，其他 Provider 信息保持原结构。

轮次按 Bot 与渠道会话隔离：不同 Bot 独立，DM/群/子区独立，同一个群内不同发送者共享群会话。准备失败不消耗轮次，同轮重试不增加轮次。reset/new 清空绑定并推进代次，下一条普通消息从 index 1 开始。Provider 恢复失败而新建原生会话，不等于逻辑轮次回到 1。

Gateway 维护 sessionId/providerSession 映射。Hook 读取已准备的 ctx，不负责查询或更新这份路由映射。需要持久化时使用[会话存储接口](sessions.md)。业务缓存和数据库归宿主管理；默认内存会话存储不承诺跨进程恢复。

## CLI 的两个基础 Hook

实现与接入位置：

| 文件 | 职责 |
| --- | --- |
| [apps/cli/src/hooks.ts](../../../apps/cli/src/hooks.ts) | createCliHooks(agent, log)：创建 instruction 的 pre_dispatch 和 debug 的 pre_invoke |
| [apps/cli/src/main.ts](../../../apps/cli/src/main.ts) | CLI 注册 Bot 时调用 createCliHooks，并作为第三个参数传给 gateway.register |
| [packages/octo-channel-gateway-sdk/src/hooks.ts](../../../packages/octo-channel-gateway-sdk/src/hooks.ts) | SDK 的公共类型、Hook 顺序执行、返回值及修改边界校验，不包含 CLI 业务策略 |
| [docs/examples/hooks.mts](../../examples/hooks.mts) | SDK/Electron 业务示例：异步读取、业务自定轮次、完整输入日志 |
| [scripts/verify-gateway-hooks.mjs](../../../scripts/verify-gateway-hooks.mjs) | 显式专项：首轮、图片、日志故障、冻结重试、reset 与关闭 |

CLI 的装配关系为 `createCliHooks(agent, log)` → `gateway.register(bot, agent, hooks)`。若要修改 CLI 首轮注入或日志策略，修改 CLI hooks.ts；SDK/Electron 接入则在宿主项目中实现自己的数组。

### instruction：非空且首轮才前置

这是 CLI 配置示例，instruction 位于 bot.agent。默认空字符串表示不提供额外指令：

```json
{
  "bots": [
    {
      "bot_id": "my-bot",
      "api_url": "https://im.example.com/api",
      "enabled": false,
      "agent": {
        "adapter_type": "codex",
        "workdir": "/absolute/workspace",
        "instruction": ""
      }
    }
  ]
}
```

CLI pre_dispatch 使用注册时的配置快照。仅当 `instruction.trim()` 非空且 `ctx.turn.index === 1` 时，在 inputs.parts 前添加独立文本 part。trim 只用于判断是否有内容，实际提示词保留原字符串；省略、空字符串或全空白都不追加。

将 instruction 填为“请先给结论，再给执行步骤。”后，首轮得到以下 XML，原问题与图片仍保留为各自的 part：

```xml
<!-- CLI instruction begins -->
<context namespace="extra.cli" name="instruction">
  <data><![CDATA[请先给结论，再给执行步骤。]]></data>
</context>
<!-- CLI instruction ends -->
```

正常后续轮次不重复注入，reset/new 后首轮重新生效。同轮重试使用冻结结果；后续 Provider fresh fallback 不自动重新加载更早轮次的业务指令。CLI 不逐轮重读配置文件，修改配置后按[CLI 运维流程](../getting-started/cli.md)重新加载服务。XML 使用 CDATA 并处理结束符，图片内容不转换成文字。

### debug：记录最终请求

CLI pre_invoke 仅在进程环境中 `OCTO_CHANNEL_GATEWAY_DEBUG=1` 时记录完整 inputs、sessionId、providerSession 和 agentEnv。它使用既有渠道日志文件，保留图片 base64，不写入状态镜像。其他值或未配置时不输出；旧拼写不兼容。

日志故障不影响执行。完整日志包含实际提示词、图片和执行凭据，适用范围、路径与容量见[配置参考](../reference/configuration.md)。这两个 Hook 的实现位于 [apps/cli/src/hooks.ts](../../../apps/cli/src/hooks.ts)，不属于 SDK 自动安装的策略。

## Electron App 与其他宿主自行实现

Electron 主进程或其他应用宿主向 register 提供自己的函数数组。业务数据可以来自闭包持有的配置、数据库或应用服务；SDK 不要求业务使用 CLI 的 instruction 字段，也不自动读取 CLI 配置文件或 debug 开关。不要把 Hook 函数字符串放进 JSON，SDK 不执行字符串代码。

[共享、可类型检查的业务示例](../../examples/hooks.mts)提供两个示例工厂，供宿主复制或修改；它们不是 npm 包导出的 SDK 工具，也不会自动安装：

- createBusinessHooks(readInstruction, shouldPrepend)：两个参数都由业务提供。前者异步读取文本，后者决定本轮是否读取和 prepend。XML 使用业务自己的 extra.business/instruction。
- createInputLogHook(write)：业务提供日志出口，放在最后一个 pre_invoke。示例隔离同步/异步日志故障，不等待可能悬挂的日志 IO；日志队列与关闭由宿主负责。

业务选择的 shouldPrepend 可以是 `ctx => ctx.turn.index === 1`、`ctx => ctx.turn.index % 20 === 0`，或 `ctx => ctx.turn.index === 1 || ctx.turn.index % 20 === 0`。这些分别表示只在第 1 轮、第 20/40/60 轮、第 1/20/40/60 轮执行；没有统一的 SDK 默认周期。

将工厂返回的数组传给 `gateway.register(bot, agent, hooks)`，需要日志时把 createInputLogHook 的返回项追加到数组末尾。异步业务读取须传递 ctx.signal。示例同时维护 parts 与已有 modelInput/freshFallback 文本或 parts，避免只修改某一种表示而使实际入模内容或恢复稿遗漏业务内容。

| 业务需求 | 建议做法 |
| --- | --- |
| 按 Bot/项目提供首次说明 | pre_dispatch 查询宿主服务；使用 botId/sessionKey，业务选择 index 1 |
| 定期补充项目状态 | pre_dispatch 按业务轮次条件读取；不设置 Gateway 全局周期 |
| 按 DM/群/子区附带不同信息 | pre_dispatch 读取 conversation，生成本次 XML；没有信息就返回原值 |
| 为本轮选择模型参数或自定义 Adapter 私有项 | pre_dispatch 加工允许修改的 agentEnv.items；保留原 schema 和其余 items |
| 诊断最终文本、图片和执行参数 | 最后一个 pre_invoke 记录输入副本，返回原值 |

ctx 没有完整原始渠道事件。若业务需要 ctx 之外的信息，使用宿主已有数据来源或高级渠道消息通道；不能假设 ctx.messageId 可以替代任意平台查询权限。

## 修改边界、失败和关闭

inputs 中的协议、调用身份、会话代次、展示会话名与 runMetadata 不允许修改；sessionId/providerSession 不得塞回 inputs。已选定的 octo.execution/adapter、agent、workspace 不允许通过 Hook 改写。其他执行项和内容仍须通过公开协议校验。业务参数属于 AgentEnv，提示词属于 inputs，不能互相混入。

冻结重试中的 pre_invoke 只允许原样返回；改变内容会触发 IM_HOOK_REPLAY_CHANGED，Gateway 不发起该次调用。纯加工操作优先放 pre_dispatch，日志放 pre_invoke。不要在 Hook 中递归触发相同执行链，或等待正在等待该 Hook 结束的 close。

已知 Hook 抛错、异步拒绝、返回非法结构或违反修改边界，会阻止后续 Hook 与本次调用。日志等非关键操作是否允许失败，由业务自己捕获处理。index 1 不是外部副作用“恰好一次”的保证：准备失败后可能再次准备相同轮次，业务写操作须自行处理幂等。

宿主退出时必须 await gateway.close。Gateway 取消并等待所属 Hook；迟到结果不能继续调用 Kernel。不响应取消的回调可能使关闭报告未完成，超时不代表业务操作已停止。Gateway 不关闭借用的 KernelClient 或宿主数据库，完整所有权见[生命周期与投递](lifecycle-and-delivery.md)。
