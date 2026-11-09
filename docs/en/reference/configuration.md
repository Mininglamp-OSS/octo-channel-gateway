# Configuration reference

[简体中文](../../zh-CN/reference/configuration.md) | [Documentation](../README.md)

The CLI config.json belongs only to Gateway; it is not a Runtime plugin manifest. The SDK accepts objects and functions directly without a file. This validated example deliberately disables the Bot and contains no credential. Replace paths and platform address, and provide credentials securely before enabling it:

```json
{
  "enabled": true,
  "bots": [
    {
      "bot_id": "assistant",
      "bot_name": "",
      "api_url": "https://im.example.com/api",
      "enabled": false,
      "agent": {
        "adapter_type": "codex",
        "model": "your-model-id",
        "effort": "high",
        "workdir": "/absolute/workspace"
      },
      "approval_mode": "ask",
      "groups_enabled": false
    }
  ],
  "context_loading": { "timeout_ms": 5000, "max_in_flight": 8 }
}
```

## CLI top level

| Field                | Contract                                                                                                               |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| bots                 | Up to 64 Bots; API address plus bot_id must be unique                                                                  |
| enabled              | false prevents all Bot registrations                                                                                   |
| context_loading      | timeout_ms defaults to 5000 (1..30000), max_in_flight to 8 (1..32); the CLI does not load callback functions from JSON |
| authorized_space_ids | Optional authenticated-space allowlist; explicit [] denies all spaces                                                  |

Configuration file/input size is limited to 1 MiB, and each Bot configuration to 256 KiB. extraset replaces configuration; use restart after changes. Arbitrary business data does not imply Runtime understands it.

## Bot and execution

| Field                                 | Contract                                                                                                                  |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| bot_id / api_url / agent            | Required; HTTPS API URL, loopback-only HTTP, no credentials/query/fragment                                                |
| bot_name / enabled / bf_token         | Optional display name, enabled state, and configured credential; name is not identity; SDK can use a credentials callback |
| agent.adapter_type                  | Adapter selection; explicit configuration and a matching Kernel Provider installation are recommended                     |
| agent.workdir                       | Optional absolute local path; not accepted by OpenClaw                                                                    |
| agent.model / effort                | Provider model/reasoning selection; actual support is Adapter-specific                                                    |
| agent.provider_agent_id             | OpenClaw only, selects an existing Agent; this channel defaults to main                                                   |
| approval_mode                         | Defaults to full_access; explicitly choose ask for approvals; the default is not an isolation sandbox                     |
| run_timeout_ms                        | Optional integer 100..86400000, execution time budget                                                                     |
| context                               | Optional Context v3 static material/execution configuration; see the business material guide for loading and splitting    |
| stable_context_refresh_interval_turns | Positive integer, default 30; first turn and reset restart counting                                                       |
| codex_retry                           | Codex-specific recovery switch and count/time/backoff budgets, not a generic Provider replay switch                       |

## Optional MCP and environment variables

MCP and environment variables are optional execution settings. Configure them only when a Bot needs them; the default CLI help/example does not need to include them. Gateway places these settings in `agentEnv.items`, not in the prompt or `inputs.parts`.

Use `agent.mcp` and `agent.envs` with the public protocol payloads. Gateway validates these optional fields and compiles them into `agentEnv.items`. They are supported by both CLI configuration and the registration SDK:

| Optional setting | Context override | Bot field | Output |
| --- | --- | --- | --- |
| MCP | context item `octo.execution / mcp` | `agent.mcp` containing `{ mcpServers: ... }` | `agentEnv.items`: same namespace/name/payload |
| Environment | context item `octo.execution / envs` | `agent.envs` containing `{ env_variables: [{ key, value }] }` | `agentEnv.items`: same namespace/name/payload |

The following [complete optional example](../../examples/gateway-execution.json) uses these Agent fields. It deliberately disables the Bot and omits credentials. Supply an installed MCP executable, actual project path and Bot credential before enabling it. Saving the configuration validates its shape; it does not install or launch MCP, check a remote endpoint, or prove that the selected Provider supports it.

```json
{
  "bots": [
    {
      "bot_id": "my-codex-bot",
      "bot_name": "My Codex Bot",
      "api_url": "https://im.deepminer.com.cn/api",
      "enabled": false,
      "agent": {
        "adapter_type": "codex",
        "workdir": "/absolute/project",
        "model": "gpt-6.1-sol",
        "effort": "high",
        "mcp": {
          "mcpServers": {
            "project-tools": {
              "type": "stdio",
              "command": "/absolute/tools/project-mcp",
              "args": []
            }
          }
        },
        "envs": {
          "env_variables": [
            {
              "key": "PROJECT_ENV",
              "value": "development"
            }
          ]
        }
      }
    }
  ]
}
```

`mcpServers` maps server names to definitions. A `stdio` definition uses `type`, `command`, optional `args`, `env`, and `cwd`. A `streamable_http` definition uses `type`, `url`, and optional `headers`. Server definitions may also specify `required`, `startupTimeoutMs`, and `toolTimeoutMs`; support must be checked against the selected Adapter/Provider. `envs.env_variables` is a list of string key/value entries, not an arbitrary object of protocol keys. A stdio server's `env` configures that MCP process, while `envs` configures the Agent execution environment.

For the SDK, static settings use the same Bot configuration. Trusted host code may also return these context items from `loadContexts`; a dynamic item replaces the entire matching namespace/name payload, rather than merging individual MCP servers or environment keys. The resulting context overrides the Agent defaults: MCP servers merge by server name, and environment entries merge by key; matching context values win. Empty context collections do not clear Agent defaults. Same-turn retries reuse frozen execution settings rather than adding newly configured servers or variables. Gateway subsequently overlays its current `OCTO_BOT_TOKEN`, `OCTO_TOKEN`, and `OCTO_API_BASE_URL`, so custom values cannot replace the current Bot's tool identity. Windows compares these environment names case-insensitively; POSIX compares them case-sensitively. Tokens, MCP headers and environment values belong only in execution settings, never business text.

Application instructions are business prompts and should be assembled into `inputs.parts` by Gateway. Removal of the current special Runtime instructions protocol is tracked in [Runtime #334](https://github.com/Mininglamp-OSS/octo-runtime/issues/334); caller-owned path-only workspaces are tracked in [Runtime #335](https://github.com/Mininglamp-OSS/octo-runtime/issues/335). The MCP/envs mapping is implemented here; the instructions and workspace protocol migrations remain separate work.

## Admission and delivery

Omitted allowed_sender_ids retains platform admission; [] denies all senders. groups_enabled defaults to true and does not affect direct messages. Omitted/null/[] group_ids adds no group restriction. Optional cards/typing presentation flags do not change execution permissions.

artifact_delivery supports mode (channel/tools), allowed_roots, allowed_mime_types, max_file_bytes, max_total_bytes, max_files, and timeout_ms. Roots must be absolute; MIME entries must be explicit type/subtype values without wildcards. Each list allows at most 32 entries. Numerical limits are in [Lifecycle and delivery](../guides/lifecycle-and-delivery.md).

codex_retry allows max_consecutive_retries/max_total_retries in 0..100, recovery_timeout_ms in 100..3600000, initial_delay_ms in 100..60000, and max_delay_ms in 100..300000. Initial delay cannot exceed maximum delay. Default initial/maximum delays are 2000/30000 ms. Interpret recovery behavior with logs; structural validation does not prove replay is safe.

Authoritative definitions: [configuration types](../../../packages/gateway/src/contracts.ts), [validation](../../../packages/gateway/src/lifecycle/configuration.ts).

`bot_name` is a display label; empty or omitted uses bot_id. Replace `your-model-id` with a model supported by the selected Provider. `effort: high` demonstrates explicit selection and does not set a global default. Public execution configuration is `agent`; its `adapter_type` selects the integration implementation. The former outer `adapter` field is unsupported.

Runtime connection settings do not belong in this business configuration. `extraset` rejects `runtime_home`, `endpoint`, and `runtime_endpoint`; use `start/run --runtime-home <path>`.
