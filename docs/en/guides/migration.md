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

## Runtime/client 1.1.14

Both the production client and development Runtime dependencies use ^1.1.14. Gateway retains its own ImAgentConfig (CLI bot.agent; SDK register second argument) and no longer generates the removed upstream AgentConfig. Replace old octo.control/instructions configuration with agent.instruction or ordinary business material. Remove workspace.mode and provide only the path of a prepared directory. Context output uses comment boundaries and individual context tags while retaining selection rules. Private execution items reach Adapters unchanged; OpenClaw agentId lives in adapter.openclaw/options. There is no old protocol compatibility layer. See [Inputs and execution environment](../concepts/inputs-and-agent-env.md) and [Configuration reference](../reference/configuration.md).

## Registration protocol simplification

botId must be supplied explicitly; authentication only verifies identity. Remove bot.materials, loadMaterials, BusinessMaterial, materialLoading and CLI material_loading. There is no compatibility layer or replacement loader callback. Event context reuses the channel message path as a separate XML text input; CLI first-turn instructions use its agent.instruction Hook; SDK hosts provide their own Hooks. See [Channel event context](contexts-and-credentials.md).

The SDK uses new ChannelGateway({ kernel }) and register(bot, agent). Remove ChannelRegistry/ChannelDefinition/ChannelRegistration usage; the host owns Runtime attachment and client release, while Gateway close cleans up its Bot resources. CLI JSON is unchanged.


Hook migration: pass an optional third array to register. Only pre_dispatch and pre_invoke are supported. Remove stable_context_refresh_interval_turns (rejected with IM_REFRESH_POLICY_REMOVED); periodic business content belongs in a Hook using ctx.turn.index. The debug switch is now OCTO_CHANNEL_GATEWAY_DEBUG=1; the old misspelled switch is not supported. CLI still accepts agent.instruction; SDK hosts must prepend it explicitly in a Hook.
