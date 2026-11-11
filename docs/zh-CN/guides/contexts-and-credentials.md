# 渠道事件信息与凭据

[English](../../en/guides/contexts-and-credentials.md) | [文档目录](../README.md)

业务方在处理本次消息事件时决定附带哪些感知信息，没有就不附带。复用现有 channel 消息通道：高级渠道实现通过本条 ImInboundMessage 的 buildContext 提供本次事件项，Gateway 将其中的模型上下文渲染为独立 XML 文本 part，放入 inputs；用户原问题仍是单独的文本 part，图片仍是图片 part。内置 IM channel 按现有规则提供发送者、群/话题、mention、引用等信息。register 仅绑定 Bot 与 Agent，不注册材料加载回调，也不配置每轮注入列表。

普通业务上下文使用已有 extra.* 模型项，extra.im 由内置渠道保留；执行配置放在 agent.items，不混进感知文本。自动规则/历史的注入与省略策略保持；同轮重试及 fresh fallback 使用冻结输入，不重新采集事件信息。新消息只携带该消息选择的上下文。

CLI 为 agent.instruction 安装 pre_dispatch Hook：仅在逻辑轮次 1（包括 reset 后）前置 extra.cli/instruction XML 文本 part。SDK 宿主须显式安装自己的 Hooks，仅配置 instruction 不会自动注入。同轮重试复用已准备输入，后续 fresh fallback 不自动重新加载之前的指令。

下面的宿主示例只读取凭据。botId 必填，认证校验 token 对应身份与它一致，不使用认证结果补齐缺失身份：

```ts
import type {
  GatewayBot,
  ImAgentConfig,
} from "@mininglamp-oss/octo-channel-gateway";

export function createDefinition(options: {
  botId: string;
  apiUrl: string;
  workdir: string;
  readToken: (signal: AbortSignal) => Promise<string>;
}): { bot: GatewayBot; agent: ImAgentConfig } {
  return {
    bot: {
      botId: options.botId,
      apiUrl: options.apiUrl,
      approval_mode: "ask",
      credentials: (_bot, signal) => {
        signal.throwIfAborted();
        return options.readToken(signal);
      },
    },
    agent: { adapter_type: "codex", workdir: options.workdir },
  };
}
```

credentials(config, signal) 接收内部 Bot 配置副本和取消信号，返回宿主管理的 token。没有回调时使用 bot.bfToken；CLI JSON 继续使用 bf_token。将 signal 传递给读取操作；凭据进入工具执行环境，不放进 XML 或用户问题。SDK 不管理宿主数据库或凭据刷新服务。

[渠道消息合同](../../../packages/octo-channel-gateway-sdk/src/contracts.ts)、[上下文渲染](../../../packages/octo-channel-gateway-sdk/src/execution/model-input.ts)、[凭据接口](../../../packages/octo-channel-gateway-sdk/src/ports.ts)。MCP/envs 的示例见[配置参考](../reference/configuration.md)。

这里的 buildContext 是现有 channel 内部的消息构建合同，不是 register 可传入的回调，业务输入扩展使用下面说明的 pre_dispatch Hook。


业务 prepend 策略通过显式[应用层 Hooks](../reference/sdk.md) 实现，见[类型检查示例](../../examples/hooks.mts)。CLI 自行安装 instruction 和 debug 两个基础 Hook。

[Hooks 专题](hooks.md) 区分了 CLI 的 instruction/debug 行为与 Electron 等应用宿主自行实现的业务策略。


## 内置 IM 上下文分块

实现入口是 [im-context/index.ts](../../../packages/octo-channel-gateway-sdk/src/transport/im-context/index.ts) 的 buildImContexts。入口按固定顺序串行组装，直接列出以下候选块；没有适用信息的块不产出内容。当前消息事实先准备以预留预算，但按既有协议最后追加。未新增块级并发调度器。

| 上下文 | 注入内容与判断 | 实现 |
| --- | --- | --- |
| message-trigger | 当前消息、会话、发送者、接收Bot、实际@对象；身份补查失败保留未知值 | [trigger.ts](../../../packages/octo-channel-gateway-sdk/src/transport/im-context/trigger.ts) |
| reply | 本条消息引用的文字，没有引用则省略 | [reply.ts](../../../packages/octo-channel-gateway-sdk/src/transport/im-context/reply.ts) |
| resources | 附件、文档或网盘地址；不预读资源正文 | [resources.ts](../../../packages/octo-channel-gateway-sdk/src/transport/im-context/resources.ts) |
| message-content | 富文本或合并转发；普通文字不额外生成 | [message-content.ts](../../../packages/octo-channel-gateway-sdk/src/transport/im-context/message-content.ts) |
| group-rules / topic-rules | 私聊不请求；群/子区读取权威规则，再按版本、状态及Provider绑定决定是否省略 | [rules.ts](../../../packages/octo-channel-gateway-sdk/src/transport/im-context/rules.ts) |
| history | 按已有计划补充有界历史，保留排序、去重、输出交接排除及恢复材料 | [history.ts](../../../packages/octo-channel-gateway-sdk/src/transport/im-context/history.ts) |
| history-gap | 说明历史缺失/省略；预算不足按原规则压缩或省略 | [history-gap.ts](../../../packages/octo-channel-gateway-sdk/src/transport/im-context/history-gap.ts) |

以上是消息采集块。会话所需的mention、历史使用和文件交付等稳定说明，继续由[stable-context.ts](../../../packages/octo-channel-gateway-sdk/src/application/stable-context.ts)和[dispatcher.ts](../../../packages/octo-channel-gateway-sdk/src/execution/dispatcher.ts)按原首轮/恢复边界装配；此次没有改变它们的注入策略。

GROUP.md不是仅首轮注入：下一条通过准入的消息会读取权威版本。相同Provider会话已收到相同版本时省略；更新、清空、删除或新Provider会话需要相应内容。rules.ts同时保存读取与版本筛选逻辑；应用执行流程调用筛选，并在原有确认边界更新会话游标，构建块不提前标记“已发送”。

[ImContextBuildScope](../../../packages/octo-channel-gateway-sdk/src/transport/im-context/scope.ts) 是本轮内部只读快照，与公开Hook ctx不同。它提供channelId/channelType、isGroup、turnIndex、消息、历史计划、来源信息、取消信号和readers。消息/计划及读取结果深只读，signal保持可取消；块返回新内容，不修改scope或会话状态。readers在闭包绑定当前渠道、Bot及凭据，历史块只传窗口参数。

同一构建内，相同读取复用结果和在途请求；身份按UID去重，重叠批次只补查新增UID，未知/失败结果本轮也复用。不同历史窗口分别请求。除既有10分钟有界身份缓存外，不新增跨轮缓存；规则和历史下一轮重新读取。不存在跨Bot的本轮请求共享，也不把读取凭据放入模型文本。

显式本地验证：`node --test scripts/verify-im-context-scope.mjs` 检查只读、读取去重、隔离和取消；`node scripts/verify-im-context-equivalence.mjs` 对照重构前真实pre_invoke快照。后者只归一化随机UUID与工作目录，核对固定14场景下正文、顺序、图片、AgentEnv及恢复内容；它不证明所有实时网络时序等价。均不加入默认测试或CI。
