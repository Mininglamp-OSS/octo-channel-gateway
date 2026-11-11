# Hooks: host application extensions

[简体中文](../../zh-CN/guides/hooks.md) | [Documentation](../README.md)

Hooks let the host application influence the inputs and execution environment of a Channel Gateway turn. Gateway provides execution points, session facts, and execution boundaries; the host decides when to read business data, what to prepend, which execution settings to use, and how to log requests. Only pre_dispatch and pre_invoke are currently supported.

**The CLI installs two basic Hooks. Embedded hosts such as Electron Apps implement and register their own Hooks; they do not automatically inherit the CLI instruction setting, first-turn policy, or debug switch.** Hooks do not control Runtime reasoning, tool calls, or Provider lifecycles.

## Choose an execution point

| Point | When it runs | Suitable uses | Retry behavior |
| --- | --- | --- | --- |
| pre_dispatch | After message admission, queueing, and channel input preparation, before submitting the turn | Read business instructions asynchronously, prepend based on turn number, attach event XML, transform permitted AgentEnv items | A frozen same-turn retry does not call it again; it reuses the prepared result |
| pre_invoke | Immediately before each Gateway call to KernelClient.invoke, with complete inputs/agentEnv | Observe the final request, log complete inputs, apply final changes before the first submission | A frozen retry passes through this point again, but it must return the current request unchanged; another mutation is rejected |

For example, prepend project information on turns 1, 20, and 40 in pre_dispatch. To record the text, images, and execution settings actually passed to Kernel, put a logging Hook last in the pre_invoke chain. Periodic prepend in pre_invoke would append again on retries and violate frozen-request validation.

register stores Hook definitions without executing their functions. Rejected messages and control commands do not enter these points as ordinary execution turns. Runtime-internal retries are not Gateway Hook events.

## Registration, arguments, and results

Call the instance method `await gateway.register(bot, agent, hooks)`. The third argument is an array whose entries contain type and hook; there is no name field or additional options wrapper. Omitting hooks means an empty array. One Gateway can register different business Hooks for different Bots.

The interface shape is shown below; see [hooks.ts](../../../packages/octo-channel-gateway-sdk/src/hooks.ts) for the public types:

```text
hooks: [{ type: "pre_dispatch" | "pre_invoke", hook }]
hook: async (ctx, inputs, agentEnv) => ({ inputs, agentEnv })
```

| Argument | Contents | Host usage |
| --- | --- | --- |
| ctx | Read-only session snapshot and cancellation signal | Read identity, turn number, and routing without modifying them |
| inputs | GatewayInputs: canonical InvocationContent, including parts and invocation metadata | Work with ordered text/image inputs.parts and return the complete inputs object |
| agentEnv | Public AgentEnv with schema/items | Transform permitted execution items, preserve unrelated items, and return the complete envelope |

inputs is neither a bare parts array nor an older request envelope. After the Hook chain, Gateway calls `kernel.invoke(inputs, ctx.sessionId, ctx.providerSession, agentEnv)`.

Hooks at the same point execute serially in their relative array order. Each returned inputs and agentEnv replaces the current value for the next Hook; there is no implicit merge. Return `{ inputs, agentEnv }` when unchanged, not void or inputs alone. Prefer new objects to mutations of shared application configuration.

Every Hook in one chain receives the same ctx object. Gateway creates a new snapshot when the turn or actual session routing changes. Lifecycle order determines the order of the two points, regardless of their global array positions. Registration copies the array; registering the same Bot replaces all Hooks without accumulating them. Unknown point names warn and are ignored; a known point without a function rejects registration.

## Data available in ctx

| Field | Type/value | Meaning and possible use |
| --- | --- | --- |
| botId | string | Explicitly registered and authenticated Bot identity; select that Bot's business configuration |
| sessionKey | string | Opaque channel session key containing platform/channel isolation; use as an index without parsing its internal format |
| generation | number | Session generation advanced by reset/new; scope an application cache to a generation when needed |
| sessionId | string | Execution session identifier passed to Kernel; correlate execution logs |
| providerSession | Read-only ProviderSession or undefined | Native continuation information returned by the Provider; absent without a binding, not an alias for sessionId |
| messageId | string | Channel message triggering this turn; combine with botId/sessionKey for cross-session lookup |
| conversation.kind | direct / group / thread | Distinguish a DM, group, or topic and choose appropriate business context |
| conversation.id | string | Channel address of the DM, group, or topic; use in the host's business queries |
| turn.index | number starting at 1 | Logical turn number; the host chooses first-turn or periodic conditions |
| signal | AbortSignal | Cancellation for the owning work; pass it to asynchronous reads and honor cancellation |

ctx does not contain a full transcript, user profile, generic mutable state, isFirst, or shouldRefreshContext. There is no separate providerSessionId field; read `ctx.providerSession?.sessionId` for the native identifier and preserve the remaining Provider information as returned.

Turns are isolated by Bot and channel session: different Bots, DMs, groups, and topics have separate counters; senders in the same group share its conversation. Preparation failures do not consume a turn, and same-turn retries do not increment it. reset/new clears the binding and advances the generation; the next ordinary message starts at index 1. A new native Provider session after failed restoration does not reset the logical turn number.

Gateway maintains the sessionId/providerSession mapping. Hooks read the prepared ctx rather than querying or updating that routing mapping. Use the [session store interface](sessions.md) for persistence. Business caches and databases belong to the host; the default in-memory session store does not promise recovery across processes.

## The CLI's two basic Hooks

Implementation and integration locations:

| File | Responsibility |
| --- | --- |
| [apps/cli/src/hooks.ts](../../../apps/cli/src/hooks.ts) | createCliHooks(agent, log): creates the instruction pre_dispatch and debug pre_invoke |
| [apps/cli/src/main.ts](../../../apps/cli/src/main.ts) | Creates CLI Hooks and passes them as the third gateway.register argument for each Bot |
| [packages/octo-channel-gateway-sdk/src/hooks.ts](../../../packages/octo-channel-gateway-sdk/src/hooks.ts) | SDK public types, sequential execution, result validation and mutation boundaries; contains no CLI business policy |
| [docs/examples/hooks.mts](../../examples/hooks.mts) | SDK/Electron examples: asynchronous reads, application-selected turns and complete input logging |
| [scripts/verify-gateway-hooks.mjs](../../../scripts/verify-gateway-hooks.mjs) | Explicit checks for first-turn behavior, images, logging failures, frozen retries, reset and shutdown |

CLI wiring is `createCliHooks(agent, log)` → `gateway.register(bot, agent, hooks)`. Change CLI hooks.ts to adjust its instruction or logging policy. SDK/Electron hosts implement their own array in the host project.

### instruction: prepend only when nonblank and on turn 1

This is a CLI configuration example. instruction belongs under bot.agent. An empty string means no additional instruction:

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

The CLI pre_dispatch Hook uses the configuration snapshot captured at registration. It prepends a separate text part to inputs.parts only when `instruction.trim()` is nonempty and `ctx.turn.index === 1`. trim checks presence only; the actual prompt retains the original string. Missing, empty, or whitespace-only values add nothing.

Setting instruction to the example sentence below produces this XML on the first turn. The original question and images remain separate parts:

```xml
<!-- CLI instruction begins -->
<context namespace="extra.cli" name="instruction">
  <data><![CDATA[请先给结论，再给执行步骤。]]></data>
</context>
<!-- CLI instruction ends -->
```

Normal subsequent turns do not repeat it; the first turn after reset/new includes it again. Same-turn retries use the frozen result. A later Provider fresh fallback does not automatically reload business instructions from an earlier turn. The CLI does not reread the file every turn; follow [CLI operations](../getting-started/cli.md) to reload the service after configuration changes. XML uses CDATA with safe handling of its closing sequence; images are not converted to text.

### debug: record the final request

The CLI pre_invoke Hook records complete inputs, sessionId, providerSession, and agentEnv only when its process environment contains `OCTO_CHANNEL_GATEWAY_DEBUG=1`. It writes to the existing channel log, preserving image base64 and excluding the data from status mirrors. Other values or an absent variable emit nothing; the old misspelled switch is not supported.

Logging failures do not affect execution. Complete logs contain actual prompts, images, and execution credentials; see [Configuration](../reference/configuration.md) for paths and capacity limits. Both Hooks live in [apps/cli/src/hooks.ts](../../../apps/cli/src/hooks.ts), not in policies automatically installed by the SDK.

## Electron Apps and other hosts implement their own Hooks

An Electron main process or another application host supplies its own function array to register. Business data may come from configuration, a database, or application services captured in a closure. The SDK requires neither the CLI instruction setting nor its configuration file or debug switch. Do not put function strings into JSON; the SDK does not execute string code.

The [shared, type-checked business example](../../examples/hooks.mts) provides two example factories to copy or adapt. They are not SDK utilities exported by the npm package and are never installed automatically:

- createBusinessHooks(readInstruction, shouldPrepend): the application supplies both arguments. The first asynchronously reads text; the second decides whether to read and prepend on this turn. The example uses the application's extra.business/instruction XML name.
- createInputLogHook(write): the application supplies the logging destination and places the Hook last in pre_invoke. The example contains synchronous/asynchronous logging failures without waiting for potentially unbounded log IO; the host owns the logging queue and its shutdown.

The application can choose `ctx => ctx.turn.index === 1`, `ctx => ctx.turn.index % 20 === 0`, or `ctx => ctx.turn.index === 1 || ctx.turn.index % 20 === 0` as shouldPrepend. These run on turn 1 only, turns 20/40/60, or turns 1/20/40/60 respectively. There is no SDK-wide default interval.

Pass the returned array to `gateway.register(bot, agent, hooks)` and append the createInputLogHook result when logging is needed. Pass ctx.signal to asynchronous business reads. The example updates parts and any existing modelInput/freshFallback text or parts together so the actual model input or recovery draft does not omit business content due to an unchanged alternate representation.

| Business need | Suggested approach |
| --- | --- |
| First-turn instructions per Bot/project | Query a host service in pre_dispatch using botId/sessionKey; the application selects index 1 |
| Periodic project updates | Read data in pre_dispatch using the application's turn condition, not a Gateway-wide interval |
| Different context for DMs, groups, and topics | Read conversation in pre_dispatch and produce this turn's XML; return unchanged values when absent |
| Per-turn model settings or custom Adapter private items | Transform permitted agentEnv.items in pre_dispatch, preserving schema and other items |
| Inspect final text, images, and execution settings | Record a copy in the last pre_invoke Hook and return unchanged values |

ctx does not expose a complete raw channel event. Use the host's existing data sources or the advanced channel message path for additional information; ctx.messageId does not itself grant permission to query a platform.

## Mutation boundaries, failures, and shutdown

inputs protocol, invocation identity, session generation, session display name, and runMetadata cannot change; do not insert sessionId/providerSession into inputs. Hooks cannot change the selected octo.execution/adapter, agent, or workspace. Other execution items and content remain subject to public protocol validation. Execution settings belong in AgentEnv and prompt content belongs in inputs.

A frozen retry's pre_invoke must return unchanged values. Mutating them raises IM_HOOK_REPLAY_CHANGED and prevents that call. Prefer pre_dispatch for transformations and pre_invoke for logging. Do not recursively enter the same execution chain or await a close operation that is waiting for the current Hook.

A known Hook throwing, rejecting, returning an invalid result, or violating a mutation boundary prevents subsequent Hooks and the current call. The application catches noncritical failures such as logging errors when they should not block execution. index 1 is not an exactly-once guarantee for external side effects: preparation may be retried at the same index after failure, so business writes need their own idempotency.

The host must await gateway.close on exit. Gateway cancels and waits for its Hooks; late results cannot invoke Kernel. An uncooperative callback can make shutdown report incomplete cleanup, and timeout does not mean its business operation stopped. Gateway does not close the borrowed KernelClient or host database. See [Lifecycle and delivery](lifecycle-and-delivery.md) for ownership details.
