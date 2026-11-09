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

extraset replaces the whole configuration rather than patching it; extraget outputs credentials unchanged. Old module installation definitions are not required SDK configuration. The SDK accepts ChannelDefinition objects and functions directly; see [SDK integration](../getting-started/sdk.md).

Runtime connection settings are command arguments only: `start/run --runtime-home <path>` (default `~/.octo-runtime`). Do not put `runtime_home`, `endpoint`, or `runtime_endpoint` in business configuration. Service definitions retain the launch arguments for restart. SDK endpoint arguments are unchanged.

Bot execution configuration uses `agent.adapter_type` with model, effort and workdir under `agent`. The previous outer `adapter` field and `ImAdapterConfig` type are replaced by `agent` and `ImAgentConfig`; there is no compatibility conversion.
