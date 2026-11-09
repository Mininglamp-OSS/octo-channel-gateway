# Migration and compatibility

[简体中文](../../zh-CN/guides/migration.md) | [Documentation](../README.md)

When migrating from Runtime's bundled channel, preserve the old configuration and session persistence policy, deploy an IPC v2 Runtime/client, then deploy the independent Gateway. Stop the old channel before switching ingress to avoid duplicate processing for one Bot. Do not stop a Kernel still used by other applications.

1. Export channel configuration using the old deployment's supported tooling and protect credential-bearing files.
2. Start a matching Runtime version and determine its Runtime Home.
3. Import configuration into a separate Gateway Home, configure runtime_home, then verify with start/doctor.
4. Check platform connectivity, authorization, session recovery, and delivery. The default memory store does not automatically migrate old sessions.

```sh
octo-channel-gateway extraset --runtime-home /absolute/runtime < gateway.json
octo-channel-gateway start
octo-channel-gateway doctor --json
```

## Retained and breaking boundaries

| Boundary          | Current behavior                                                                                                                       |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| CLI compatibility | Retains extraset/extraget, the leading channel-gateway component form, and the old {config, enabled?} wrapper; ignores module metadata |
| SDK/IPC           | Old invoke(request, environment), contexts, cancelInvocation, and IPC v1 are incompatible; there is no conversion layer                |
| Internal draft    | Gateway still has a mixed contexts draft, split into inputs/agentEnv by prepareKernelInput; this is not Runtime's public entry         |
| Old directories   | Runtime Home, identity, and configuration are not automatically deleted or rewritten                                                   |
| Ownership         | Runtime no longer hosts Extra/native/WebUI/WeCom/bundled Gateway; this repository does not recreate a general plugin framework         |

extraset replaces the whole configuration rather than patching it; extraget outputs credentials unchanged. Old module installation definitions are not required SDK configuration. The SDK accepts ChannelDefinition objects and functions directly; see [SDK integration](../getting-started/sdk.md).

CLI connection configuration now uses `runtime_home` (the Runtime directory). Replace old `endpoint`/`runtime_endpoint` fields and `--endpoint`/`--runtime-endpoint` flags with `runtime_home` and `--runtime-home`. Old fields fail explicitly to avoid connecting to an unintended Runtime. SDK endpoint arguments are unchanged.

Bot execution configuration uses `agent.adapter_type` with model, effort and workdir under `agent`. The previous outer `adapter` field and `ImAdapterConfig` type are replaced by `agent` and `ImAgentConfig`; there is no compatibility conversion.
