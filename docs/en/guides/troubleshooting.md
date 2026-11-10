# Troubleshooting

[简体中文](../../zh-CN/guides/troubleshooting.md) | [Documentation](../README.md)

Distinguish Runtime readiness, Gateway service readiness, Bot connectivity, and individual execution/delivery. These are separate states. Both CLI and SDK operation depend on an existing Runtime.

## Runtime is not ready

Before changing a service or starting foreground registration, start/run queries execution_ready through the public client. The CLI derives its Kernel address from the start/run --runtime-home argument (default ~/.octo-runtime). restart reuses the installed definition; its run process performs the readiness check. Connection failure, protocol mismatch, or an unready Kernel produces KERNEL_UNAVAILABLE. Both human output and JSON error.message include installation, startup, diagnostics, and Runtime Home guidance.

```sh
npm install -g @mininglamp-oss/octo-runtime@latest
octo-runtime start
octo-runtime doctor --json
```

The minimum supported Runtime version is 1.1.13 in the 1.x line; IPC v2 alone does not establish compatibility with the 1.1.13 AgentEnv contract. The command above installs npm `@latest`; check its release notes when crossing a major version. When using a custom Runtime --home, use it consistently for startup and doctor. Gateway --home is a separate directory. Set Gateway start/run --runtime-home to the directory used by Runtime and retry. Installing the client npm dependency does not install or start a Kernel.

## Common failures

| Symptom / error                                     | Check and action                                                                                                                                                          |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GATEWAY_UNAVAILABLE                                 | Runtime passed the prerequisite check, but Gateway did not publish readiness in time; inspect logs, configuration, and Bot authentication rather than reinstalling Kernel |
| IM_API_URL_INVALID                                  | Use an HTTPS URL without credentials/query/fragment; HTTP is loopback-only                                                                                                |
| IM_WORKDIR_ABSOLUTE_REQUIRED                        | Use an absolute workdir for a local Adapter                                                                                                                               |
| IM_OPENCLAW_WORKDIR_UNSUPPORTED                     | OpenClaw owns its workspace; remove workdir and optionally set provider_agent_id                                                                                          |
| IM_CONTEXT_LOADING_TIMEOUT / BUSY                   | Inspect host IO and cancellation; unfinished timed-out operations retain capacity                                                                                         |
| IM_TENANT_NOT_ACTIVE                                | The authenticated space failed host authorization; display names cannot bypass it                                                                                         |
| IM_DISPOSE_FAILED / IM_EXECUTION_CLEANUP_INCOMPLETE | Inspect original execution and business cleanup; do not report complete closure                                                                                           |
| Execution finished but no reply                     | Inspect delivery and original invocation state; do not replay an unknown execution                                                                                        |

```sh
octo-channel-gateway doctor --json
octo-channel-gateway status --json
octo-channel-gateway logs --lines 200
```

A doctor exit code of 0 only means the check completed. Do not share credential-bearing extraget output, complete agentEnv objects, or raw tool output. Correlate diagnostics with bot_id, sessionId, invocationId, runId, and generations; see [Identifiers](../concepts/identifiers.md).

To inspect actual client arguments, set OCO_CHANNEL_GATEWAY_DEUBG=1 in the Gateway process environment. Complete images and credentials enter raw channel debug logs; see [Configuration reference](../reference/configuration.md). The logs command reads status mirrors and does not display full requests. Inspect logs/channels/channel-gateway-YYYYMMDDTHH.log under Gateway Home directly. Remove the switch after diagnosis and do not share raw sensitive logs.
