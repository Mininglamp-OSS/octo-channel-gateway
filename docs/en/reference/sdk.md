# SDK reference

[简体中文](../../zh-CN/reference/sdk.md) | [Documentation](../README.md)

Import the facade and types from `@mininglamp-oss/octo-channel-gateway`; import KernelClient from the public Runtime client. See [exports](../../../packages/gateway/src/index.ts) and [implementation](../../../packages/gateway/src/gateway.ts).

## ChannelGateway

`new ChannelGateway({ kernel, log?, signal? })` borrows a host-owned KernelClient. An already aborted signal rejects construction. Signal abortion initiates close; always await close to observe its result. The log callback receives diagnostic events; explicitly enabled debug logging contains full inputs including images and credentials.

`register(bot: GatewayBot, agent: ImAgentConfig): Promise<void>` snapshots configuration, authenticates Bot identity, checks Kernel execution_ready and adds/replaces the binding. It returns no handle. Calls run serially in invocation order. Replacement validates first, cleans up the old binding, then starts the new one; failures roll back newly acquired resources and retain cleanup errors. An old binding is not automatically restored after replacement startup fails. Other identities remain live. Transient channel startup failures retain the initialized binding in retrying state; successful registration does not guarantee a currently online socket.

| GatewayBot field | Contract |
| --- | --- |
| apiUrl / bfToken | Platform address / credential; credentials callback can supply the token instead |
| botId / botName | Optional identity assertion / display name; disabled bindings require botId |
| enabled | false records a disabled binding without authentication or network startup |
| materials / loadMaterials | Static named parts / current per-turn named parts |
| materialLoading | timeout_ms / max_in_flight, defaults 5000 / 8 |
| credentials | async (config, signal) returning a token; callback config uses internal snake_case fields |
| authorizeSpace | Synchronous authenticated space authorization; throw to reject |
| createSessionStore | Synchronous factory; Gateway owns the returned handle, host owns its database |
| Other channel settings | Existing snake_case options from the configuration reference; agent is passed separately |

`status` returns diagnostic snapshots. `close(): Promise<void>` permanently stops the instance and cleans up all its bindings within a shared four-second deadline; failures reject and repeated calls return the same Promise. A closed Gateway rejects registration. Construct another instance to run again; the same host client remains reusable. Gateway never globally stops/drains/closes that client or shuts down Kernel. See [Lifecycle and delivery](../guides/lifecycle-and-delivery.md).

ChannelRegistry, ChannelDefinition and ChannelRegistration are removed. No compatibility overload accepts endpoint/definition or a single {bot, agent} object. CLI JSON still uses snake_case fields and nested bot.agent; the CLI maps them to the public API.

## Advanced exports

MemoryImSessionStore and ImSessionStore/Binding/Occurrence support [Session management](../guides/sessions.md). ImRuntime, ImChannelManager, ImInvocationInput, build_im_contexts, registerBot, WukongConnection, and imApi are advanced orchestration entries, not a new generic plugin protocol. Direct users must satisfy ownership and admission contracts themselves.

validateImConfig/validateImBots validate local structure, not credentials or Provider readiness. octoCliEnvironment produces tool environment values; it does not install octo-cli. Start with the [shared SDK example](../../examples/registration.mts).

`BusinessMaterial` is `{ name: string, parts: ModelInputPart[] }`; use `bot.materials` for static data and `loadMaterials` for current data. Neither accepts the old ContextItem envelope. See [Business material](../guides/contexts-and-credentials.md) for merge, limits, image integrity and migration.
