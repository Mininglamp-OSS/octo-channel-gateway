# SDK reference

[简体中文](../../zh-CN/reference/sdk.md) | [Documentation](../README.md)

Import the primary entry from `@mininglamp-oss/octo-channel-gateway`. Protocol types come from the public client's `/protocol` export rather than private Runtime packages. Full types live in the [exports](../../../packages/gateway/src/index.ts) and [registration contract](../../../packages/gateway/src/registry.ts).

## ChannelRegistry.register

`register(endpoint: string, definition: ChannelDefinition): Promise<ChannelRegistration>`. Validates the Bot, copies configuration, creates a dedicated client and Manager, checks Kernel execution_ready, then starts the Bot. An already aborted signal rejects. Intermediate failures roll back acquired resources; rollback failures are retained in an AggregateError.

| ChannelDefinition field | Contract                                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------- |
| bot                     | Required ImBotConfig; one Bot per registration; see configuration reference                                   |
| loadContexts            | Optional per-turn (config, {signal}) returning readonly ContextItem[] or a Promise                            |
| contextLoading          | Optional timeout_ms / max_in_flight; defaults 5000 / 8                                                        |
| credentials             | Optional async (config, signal) → string or undefined; defaults to bf_token                                   |
| authorizeSpace          | Optional synchronous (spaceId) → void; throw to deny; spaceId comes from authenticated identity               |
| createSessionStore      | Optional synchronous (config) → ImSessionStore; host owns the database, registration owns the returned handle |
| log                     | Optional (level, message, fields?); consume redacted events without adding secrets                            |
| signal                  | Optional revocation of the whole registration, not an invoke argument                                         |

## ChannelRegistration

| Member   | Meaning                                                                                                          |
| -------- | ---------------------------------------------------------------------------------------------------------------- |
| endpoint | Execution endpoint used by this registration                                                                     |
| status   | Readonly array of current Bot diagnostic snapshots, not an event subscription                                    |
| close()  | Promise<void>; stop admission and close owned resources; repeated calls return the same Promise; failures reject |

Registration does not return an invocation handle for each turn; the channel manages invocations and /stop internally. Applications using the client directly retain handle.invocationId and call interrupt themselves.

## Advanced exports

MemoryImSessionStore and ImSessionStore/Binding/Occurrence support [Session management](../guides/sessions.md). ImRuntime, ImChannelManager, ImInvocationInput, build_im_contexts, registerBot, WukongConnection, and imApi are advanced orchestration entries, not a new generic plugin protocol. Direct users must satisfy ownership and admission contracts themselves.

validateImConfig/validateImBots validate local structure, not credentials or Provider readiness. octoCliEnvironment produces tool environment values; it does not install octo-cli. Start with the [shared SDK example](../../examples/registration.mts).
