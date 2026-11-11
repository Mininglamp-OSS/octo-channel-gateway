# Channel event context and credentials

[简体中文](../../zh-CN/guides/contexts-and-credentials.md) | [Documentation](../README.md)

The business handler decides which contextual facts accompany this message event, and omits them when absent. Reuse the existing channel message path: advanced channel implementations provide event items through this ImInboundMessage's buildContext. Gateway renders model context as a separate XML text part in inputs; the original question remains its own text part and images remain image parts. The built-in IM channel supplies sender, group/thread, mention and reply facts under its existing rules. register only binds a Bot to an Agent; it has no material-loading callback or per-turn injection list.

Use existing extra.* model-context items for business context; extra.im belongs to the built-in channel. Execution settings stay in agent.items, separate from contextual text. Automatic rules/history retain their injection and omission policies. Same-turn retries and fresh fallback use frozen inputs without recollecting event facts; a new message includes only its selected context.

CLI installs a pre_dispatch Hook for agent.instruction: it prepends an extra.cli/instruction XML text part only at logical turn 1, including after reset. SDK hosts explicitly install their own Hooks; SDK configuration alone does not inject instruction. Same-turn retries reuse the prepared input, while later fresh fallback does not automatically reload a previous instruction.

This host example reads credentials only. botId is required; authentication verifies the token's identity against it instead of filling in a missing identity:

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

credentials(config, signal) receives an internal Bot configuration copy and cancellation signal, and returns a host-managed token. Without the callback, bot.bfToken is used; CLI JSON retains bf_token. Pass signal to the read operation. Credentials enter the tool execution environment, not XML or the user question. The SDK does not own the host database or a credential refresh service.

See the [channel message contract](../../../packages/gateway/src/contracts.ts), [context renderer](../../../packages/gateway/src/execution/model-input.ts), and [credential port](../../../packages/gateway/src/ports.ts). MCP/envs examples are in [Configuration](../reference/configuration.md).

buildContext here is the existing internal channel message contract, not a register callback. Business input transformations use the public Hooks described below.


Business prepend policy is an explicit [application Hook](../reference/sdk.md); see the [typed example](../../examples/hooks.mts). The CLI installs its own instruction and debug Hooks.

The [Hooks guide](hooks.md) separates CLI instruction/debug behavior from policies implemented by Electron and other application hosts.


## Built-in IM context blocks

The implementation entry is buildImContexts in [im-context/index.ts](../../../packages/gateway/src/transport/im-context/index.ts). It assembles the following blocks serially in a fixed order; a block produces nothing when inapplicable. Current-message facts are prepared first to reserve budget and appended last, preserving the existing order. There is no new scheduler for parallel block execution.

| Context | Content and inclusion rule | Implementation |
| --- | --- | --- |
| message-trigger | Current message, conversation, sender, recipient Bot and actual mentions; failed identity enrichment retains unknown values | [trigger.ts](../../../packages/gateway/src/transport/im-context/trigger.ts) |
| reply | Quoted text in this message; omitted without a quote | [reply.ts](../../../packages/gateway/src/transport/im-context/reply.ts) |
| resources | Attachment, document or Drive addresses without prefetching resource bodies | [resources.ts](../../../packages/gateway/src/transport/im-context/resources.ts) |
| message-content | Rich text or combined forwards; ordinary text adds no extra block | [message-content.ts](../../../packages/gateway/src/transport/im-context/message-content.ts) |
| group-rules / topic-rules | DMs skip the request; groups/topics read authoritative rules, then compare versions, status and Provider binding | [rules.ts](../../../packages/gateway/src/transport/im-context/rules.ts) |
| history | Bounded history selected by the existing plan, preserving order, deduplication, output handoff exclusions and recovery material | [history.ts](../../../packages/gateway/src/transport/im-context/history.ts) |
| history-gap | Missing/omitted history facts, compacted or omitted under the existing budget rules | [history-gap.ts](../../../packages/gateway/src/transport/im-context/history-gap.ts) |

These are the message collection blocks. Stable instructions for mentions, history use and file delivery remain assembled by [stable-context.ts](../../../packages/gateway/src/application/stable-context.ts) and [dispatcher.ts](../../../packages/gateway/src/execution/dispatcher.ts) at the existing first-turn/recovery boundaries. This refactor does not change their inclusion policy.

GROUP.md is not limited to turn 1: the next admitted message reads the authoritative version. Rules already supplied to the same Provider session at the same version are omitted; updates, empty/deleted rules or a new Provider session require appropriate content. rules.ts contains both reading and version selection. The application execution flow calls selection and updates the session cursor at the existing confirmation boundary; builders never mark rules as delivered early.

[ImContextBuildScope](../../../packages/gateway/src/transport/im-context/scope.ts) is an internal readonly snapshot for this build, separate from public Hook ctx. It supplies channelId/channelType, isGroup, turnIndex, message, history plan, source facts, cancellation and readers. Nested message/plan data and reader results are readonly; the signal stays live. Blocks return new content without mutating scope or session state. Readers capture this channel, Bot and credentials privately; history blocks supply only window parameters.

Within one build, identical reads share pending requests and results. Identity reads deduplicate UIDs across overlapping batches and retain unknown/failed results for the rest of that build. Different history windows remain distinct. No new cross-turn cache is added beyond the existing bounded ten-minute identity cache; rules and history are read again on the next turn. Build-local requests never cross Bot scopes, and credentials are not included in model text.

Explicit local checks: `node --test scripts/verify-im-context-scope.mjs` covers readonly data, request deduplication, isolation and cancellation; `node scripts/verify-im-context-equivalence.mjs` compares actual pre_invoke captures from before the refactor. Only random UUIDs and the workspace path are normalized. Its 14 fixed scenarios compare text, ordering, images, AgentEnv and recovery content; they do not prove equivalence under every live network timing. Neither check joins default tests or CI.
