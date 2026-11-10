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

## Gateway's current compilation boundary

The host supplies the separate agent argument for execution and optional `bot.materials` / `bot.loadMaterials` for business content. Named materials are merged and flattened into text/image parts; `prepareKernelInput` combines them with selected channel rules/history and the current message. Advanced `agent.items` are merged into AgentEnv separately and never rendered as model material. Tool credentials are injected only into execution items. Retried turns and fresh fallback reuse the same frozen material and image bytes.

The old `loadContexts` callback and `bot.context` envelope are rejected. The channel still has an internal rules/history draft, but applications do not construct ContextItem objects or choose material namespaces. Channel-owned injection and omission rules stay unchanged. Runtime receives `inputs.parts` and a separate `agentEnv` containing only `schema/items`.

Use `client.interrupt(invocationId, reason?)` to interrupt; invoke has no signal argument. Registration signals and loadMaterials signals govern local resources/IO, not this public execution argument. See [Identifiers](identifiers.md); Runtime Adapters map interruption to native controls.
