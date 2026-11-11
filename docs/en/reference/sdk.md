# SDK reference

[简体中文](../../zh-CN/reference/sdk.md) | [Documentation](../README.md)

Import the facade and types from `@mininglamp-oss/octo-channel-gateway`; import KernelClient from the public Runtime client. See [exports](../../../packages/gateway/src/index.ts) and [implementation](../../../packages/gateway/src/gateway.ts).

## ChannelGateway

`new ChannelGateway({ kernel, log?, signal? })` borrows a host-owned KernelClient. An already aborted signal rejects construction. Signal abortion initiates close; always await close to observe its result. The log callback receives diagnostic events. Full input logging is a host Hook policy, not an SDK environment-variable feature. Synchronous exceptions and asynchronous rejections from logging are contained without waiting for log IO; they do not interrupt execution or cleanup.

`register(bot: GatewayBot, agent: ImAgentConfig, hooks?: readonly GatewayHook[]): Promise<void>` snapshots configuration, authenticates Bot identity, checks Kernel execution_ready and adds/replaces the binding. It returns no handle. Calls run serially in invocation order. Replacement validates first, cleans up the old binding, then starts the new one; failures roll back newly acquired resources and retain cleanup errors. An old binding is not automatically restored after replacement startup fails. Permanent startup failures expose IM_CONNECTION_NOT_READY with the sanitized connection code in error.cause.message, even after rollback. Other identities remain live. Transient channel startup failures retain the initialized binding in retrying state; successful registration does not guarantee a currently online socket.

| GatewayBot field | Contract |
| --- | --- |
| apiUrl / bfToken | Platform address / credential; credentials callback can supply the token instead |
| botId / botName | Required Bot identity / optional display name; authentication must match botId |
| enabled | false records a disabled binding without authentication or network startup |
| credentials | async (config, signal) returning a token; callback config uses internal snake_case fields |
| authorizeSpace | Synchronous authenticated space authorization; throw to reject |
| createSessionStore | Synchronous factory; Gateway owns the returned handle, host owns its database |
| Other channel settings | Existing snake_case options from the configuration reference; agent is passed separately |

`status` returns diagnostic snapshots. `close(): Promise<void>` permanently stops the instance and cleans up all its bindings within a shared four-second deadline; failures reject and repeated calls return the same Promise. A closed Gateway rejects registration. Construct another instance to run again; the same host client remains reusable. Gateway never globally stops/drains/closes that client or shuts down Kernel. See [Lifecycle and delivery](../guides/lifecycle-and-delivery.md).

ChannelRegistry, ChannelDefinition and ChannelRegistration are removed. No compatibility overload accepts endpoint/definition or a single {bot, agent} object. CLI JSON still uses snake_case fields and nested bot.agent; the CLI maps them to the public API.

## Advanced exports

MemoryImSessionStore and ImSessionStore/Binding/Occurrence support [Session management](../guides/sessions.md). ImRuntime, ImChannelManager, ImInvocationInput, buildImContexts, registerBot, WukongConnection, and imApi are advanced orchestration entries, not a new generic plugin protocol. Direct users must satisfy ownership and admission contracts themselves.

validateImConfig/validateImBots validate local structure, not credentials or Provider readiness. octoCliEnvironment produces tool environment values; it does not install octo-cli. Start with the [shared SDK example](../../examples/registration.mts).

Per-message context reuses the channel message path and becomes a separate XML text input; omit it when absent. See [Channel event context](../guides/contexts-and-credentials.md).

## Application Hooks

Pass [{ type, hook }] as register's third argument. The two points share async (ctx, inputs, agentEnv), returning { inputs, agentEnv }. inputs is GatewayInputs (canonical InvocationContent with parts), not a bare parts array. pre_dispatch runs during preparation of each new logical turn; pre_invoke runs immediately before each Gateway client call. Multiple Hooks at a point run in array order; each complete result replaces the preceding value without merging. Registration snapshots the array; replacement replaces all Hooks. Unknown point names warn and are ignored. There is no name, session_init or automatic business refresh interval.

ctx is a shared, immutable snapshot within a chain: botId, sessionKey, sessionId, providerSession, generation, messageId, conversation, turn.index and signal. The Gateway owns routing and counting; the host chooses first-turn or periodic prepend policies. DM/group/thread bindings are independent. index starts at 1 after reset; preparation failures do not consume it and same-turn retries do not increment it. The SDK does not auto-inject agent.instruction. Inputs identity/protocol fields and the selected adapter/agent/workspace cannot change through Hooks; model, private items and content can be transformed subject to protocol validation.

pre_dispatch results are frozen. pre_invoke can transform the first submission; on a frozen retry it may observe but must return unchanged data, otherwise IM_HOOK_REPLAY_CHANGED prevents submission. Place final-input logging last. Invalid results or callback rejection fail the preparation; logging-only Hooks should contain their own failures. Observe ctx.signal, and always await gateway.close; uncooperative callbacks cause cleanup failure rather than a false success. Runtime-internal retries are not Hook events.

See the [typed business Hook example](../../examples/hooks.mts). Install it with gateway.register(bot, agent, createBusinessHooks(readInstruction, shouldPrepend)); use ctx.signal in your loader. No instruction cache or persistence is provided by the SDK.

For point selection, every ctx field, CLI-only defaults, and Electron-owned policies, read the [Hooks guide](../guides/hooks.md).
