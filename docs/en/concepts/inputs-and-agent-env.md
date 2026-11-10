# Inputs and execution environment

[简体中文](../../zh-CN/concepts/inputs-and-agent-env.md) | [Documentation](../README.md)

The public execution entry is `KernelClient.invoke(inputs, sessionId, providerSession, agentEnv)`. Ordinary inputs are text/image parts; advanced content can include parts, protocol_mode, identity/generation metadata, and explicit recovery material. It contains no contexts, agentEnv, or signal. Gateway normally calls this internally; registering a Bot does not require the host to invoke it directly.

| Data                                                                                           | Location        | Use                                                                                           |
| ---------------------------------------------------------------------------------------------- | --------------- | --------------------------------------------------------------------------------------------- |
| Current text, images, history, business rules, material and first-turn instruction | inputs | Gateway prepares actual model material |
| cwd/workdir, Adapter, model/effort, environment variables, MCP, approval and private execution parameters | agentEnv | Adapters interpret consumed configuration; Kernel/Core creates no old configuration projections |
| Logical conversation identifier                                                                | sessionId       | Business correlation and generation tracking                                                  |
| Native Provider continuation information                                                       | providerSession | Adapter checks and performs continuation                                                      |

agentEnv contains only `schema: octo.context-envelope/v3` and namespace/name/payload items. Source uses octo.execution/agent, approval uses octo.security/approval_policy, and workspace contains only path. Private beans are agreed between host and Adapter without public schema registration. Business callers still supply bot.agent for Gateway to compile. The client copies a snapshot per call, so later mutations do not change an existing invocation.

## Gateway's current compilation boundary

Bot configuration and loadContexts results first enter a local business draft. prepareKernelInput renders business items into model text/images, extracts execution items into agentEnv, and retains the same frozen material for recovery. Environment values and tool tokens are excluded from model text, and display projections remove the whole agentEnv.

The internal mixed `contexts` draft still exists; this change does not remove every Context structure. `extra.im` is owned by this channel; applications can supply namespaces such as `extra.business`. Namespaces are a convention of this Gateway's loading/rendering mechanism. Runtime execution does not require model text to follow that convention.

Use `client.interrupt(invocationId, reason?)` to interrupt; invoke has no signal argument. Registration signals and loadContexts signals govern local resources/IO, not this public execution argument. See [Identifiers](identifiers.md); Runtime Adapters map interruption to native controls.
