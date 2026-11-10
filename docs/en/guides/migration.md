# Migration and compatibility

[简体中文](../../zh-CN/guides/migration.md) | [Documentation](../README.md)

When migrating from Runtime's bundled channel, preserve the old configuration and session persistence policy, deploy an IPC v2 Runtime/client, then deploy the independent Gateway. Stop the old channel before switching ingress to avoid duplicate processing for one Bot. Do not stop a Kernel still used by other applications.

1. Export channel configuration using the old deployment's supported tooling and protect credential-bearing files.
2. Start a matching Runtime version and determine its Runtime Home.
3. Convert exported data to a direct Gateway configuration object with bots at the top level, import it into a separate Gateway Home, then verify with start --runtime-home /absolute/runtime and doctor.
4. Check platform connectivity, authorization, session recovery, and delivery. The default memory store does not automatically migrate old sessions.

```sh
octo-channel-gateway extraset --help
octo-channel-gateway start
octo-channel-gateway doctor --json
```

## Retained and breaking boundaries

| Boundary          | Current behavior                                                                                                                       |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| CLI compatibility | Independent commands only; no component prefix/argument or config wrapper; module fields are rejected |
| SDK/IPC           | Old invoke(request, environment), contexts, cancelInvocation, and IPC v1 are incompatible; there is no conversion layer                |
| Internal draft    | Gateway still has a mixed contexts draft, split into inputs/agentEnv by prepareKernelInput; this is not Runtime's public entry         |
| Old directories   | Runtime Home, identity, and configuration are not automatically deleted or rewritten                                                   |
| Ownership         | Runtime no longer hosts Extra/native/WebUI/WeCom/bundled Gateway; this repository does not recreate a general plugin framework         |

extraset replaces the whole configuration rather than patching it; extraget outputs credentials unchanged. Old module installation definitions are not required SDK configuration. The SDK accepts GatewayBot objects and functions directly; see [SDK integration](../getting-started/sdk.md).

Runtime connection settings are command arguments only: `start/run --runtime-home <path>` (default `~/.octo-runtime`). Do not put `runtime_home`, `endpoint`, or `runtime_endpoint` in business configuration. Service definitions retain the launch arguments for restart. SDK endpoint arguments are unchanged.

Bot execution configuration uses `agent.adapter_type` with model, effort and workdir under `agent`. The previous outer `adapter` field and `ImAdapterConfig` type are replaced by `agent` and `ImAgentConfig`; there is no compatibility conversion.

## Runtime/client 1.1.13

Both the production client and development Runtime dependencies use ^1.1.13. Gateway retains its own bot.agent/ImAgentConfig and no longer generates the removed upstream AgentConfig. Replace old octo.control/instructions configuration with agent.instruction or ordinary business material. Remove workspace.mode and provide only the path of a prepared directory. Context output uses comment boundaries and individual context tags while retaining selection rules. Private execution items reach Adapters unchanged; OpenClaw agentId lives in adapter.openclaw/options. There is no old protocol compatibility layer. See [Inputs and execution environment](../concepts/inputs-and-agent-env.md) and [Configuration reference](../reference/configuration.md).

## Named SDK materials

Replace `bot.context.items` and `loadContexts` with `bot.materials` and `loadMaterials`, each returning `{ name, parts }[]`. Replace SDK `contextLoading` with `materialLoading`, and CLI `context_loading` with `material_loading`. Old fields fail instead of being silently ignored. Move ordinary text into text parts, images into validated image parts, and execution extensions into `agent.items`; `agent.mcp` and `agent.envs` remain available. Dynamic same-name materials replace whole static entries in place; empty results preserve static entries. See the updated [SDK integration](../getting-started/sdk.md) and [material guide](contexts-and-credentials.md).

The SDK now uses new ChannelGateway({ kernel }) and register(bot, agent). Remove ChannelRegistry/ChannelDefinition/ChannelRegistration usage. The host owns Runtime attachment and final client disposal; all Bot handles are cleaned up by gateway.close(). CLI JSON remains unchanged.
