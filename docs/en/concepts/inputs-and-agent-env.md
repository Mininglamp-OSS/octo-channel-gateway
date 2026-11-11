# Inputs and execution environment

[简体中文](../../zh-CN/concepts/inputs-and-agent-env.md) | [Documentation](../README.md)

The public execution entry is `KernelClient.invoke(inputs, sessionId, providerSession, agentEnv)`. Ordinary inputs are text/image parts; advanced content can include parts, protocol_mode, identity/generation metadata, and explicit recovery material. It contains no contexts, agentEnv, or signal. Gateway normally calls this internally; registering a Bot does not require the host to invoke it directly.

| Data                                                                                           | Location        | Use                                                                                           |
| ---------------------------------------------------------------------------------------------- | --------------- | --------------------------------------------------------------------------------------------- |
| Current text, images, history, business rules, material and first-turn instruction | inputs | Gateway prepares actual model material |
| cwd/workdir, Adapter, model/effort, environment variables, MCP, approval and private execution parameters | agentEnv | Adapters interpret consumed configuration; Kernel/Core creates no old configuration projections |
| Logical conversation identifier                                                                | sessionId       | Business correlation and generation tracking                                                  |
| Native Provider continuation information                                                       | providerSession | Adapter checks and performs continuation                                                      |

agentEnv contains only `schema: octo.context-envelope/v3` and namespace/name/payload items. Source uses octo.execution/agent, approval uses octo.security/approval_policy, and workspace contains only path. Private beans are agreed between host and Adapter without public schema registration. SDK callers pass agent as the second register argument; CLI configuration retains bot.agent. The client copies a snapshot per call, so later mutations do not change an existing invocation.

extra.im is a Gateway business convention that reuses `{ namespace, name, payload }`, not a built-in Runtime channel protocol. Version 1.1.14 items no longer allow top-level guidance/data_format. Channel presentation metadata lives in the local payload; Gateway consumes it to compose XML text in inputs.parts. Runtime does not interpret that XML or the channel convention. SDK hosts can construct this turn's text/images directly in a Hook without using this internal structure.

## Gateway's current compilation boundary

The business handler supplies contextual facts through the channel message path and decides whether they accompany this event. prepareKernelInput renders selected channel context as a separate XML text part alongside the original question and images in inputs. Absent event items produce no corresponding text. There is no registration-level material list, merge or loader callback. agent.items and credentials enter AgentEnv separately. Same-turn retries and fresh fallback preserve frozen inputs.

The old `loadContexts` callback and `bot.context` envelope are rejected. The channel still has an internal rules/history draft, but applications do not construct ContextItem objects or choose material namespaces. Channel-owned injection and omission rules stay unchanged. Runtime receives `inputs.parts` and a separate `agentEnv` containing only `schema/items`.

Use `client.interrupt(invocationId, reason?)` to interrupt; invoke has no signal argument. Gateway constructor signals govern local resources/IO, not this public execution argument. See [Identifiers](identifiers.md); Runtime Adapters map interruption to native controls.
