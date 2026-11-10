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
  "material_loading": { "timeout_ms": 5000, "max_in_flight": 8 }
}
```

## CLI top level

| Field                | Contract                                                                                                               |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| bots                 | Up to 64 Bots; API address plus bot_id must be unique                                                                  |
| enabled              | false prevents all Bot registrations                                                                                   |
| material_loading      | timeout_ms defaults to 5000 (1..30000), max_in_flight to 8 (1..32); the CLI does not load callback functions from JSON |
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
| agent.instruction | Optional ordinary prompt; first part of a fresh Provider session, omitted on continuation and frozen for reset/fresh fallback |
| agent.provider_agent_id             | OpenClaw only, selects an existing Agent; this channel defaults to main                                                   |
| approval_mode                         | Defaults to full_access; explicitly choose ask for approvals; the default is not an isolation sandbox                     |
| run_timeout_ms                        | Optional integer 100..86400000, execution time budget                                                                     |
| materials | Optional `{ name, parts }[]` static business material; dynamic SDK material overrides by name |
| agent.items | Optional advanced execution items, forwarded into AgentEnv.items without entering model text |
| stable_context_refresh_interval_turns | Positive integer, default 30; first turn and reset restart counting                                                       |
| codex_retry                           | Codex-specific recovery switch and count/time/backoff budgets, not a generic Provider replay switch                       |

## Optional MCP and environment variables

MCP and environment variables are optional execution settings. Configure them only when a Bot needs them; the default CLI help/example does not need to include them. Gateway places these settings in `agentEnv.items`, not in the prompt or `inputs.parts`.

Use `agent.mcp` and `agent.envs` with the public protocol payloads. Gateway validates these optional fields and compiles them into `agentEnv.items`. They are supported by both CLI configuration and the registration SDK:

| Optional setting | Advanced execution override | Bot field | Output |
| --- | --- | --- | --- |
| MCP | agent.items `octo.execution / mcp` | `agent.mcp` containing `{ mcpServers: ... }` | `agentEnv.items`: same namespace/name/payload |
| Environment | agent.items `octo.execution / envs` | `agent.envs` containing `{ env_variables: [{ key, value }] }` | `agentEnv.items`: same namespace/name/payload |

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

The SDK and CLI use the same Bot object. `loadMaterials` returns only model material; it cannot supply MCP, environment values or private Adapter configuration. Advanced hosts may supply `agent.items` as namespace/name/payload execution entries. These override compiled Agent defaults using protocol merge semantics (MCP by server name, environment variables by key); private items pass through without model rendering, including private namespaces resembling material names. An empty items array does not erase defaults. Same-turn retries retain frozen items. Gateway then injects its current `OCTO_BOT_TOKEN`, `OCTO_TOKEN` and `OCTO_API_BASE_URL`, which custom values cannot replace (case-insensitive on Windows). Keep tokens, MCP headers and environment values in execution settings, never materials.

CLI configuration supplies bot.agent; SDK callers pass the same business execution definition as the second register argument. Gateway compiles source, Adapter, model, approval, MCP/envs and limits into an AgentEnv containing only schema/items, with no old AgentConfig projection. OpenClaw provider_agent_id maps to agentId in the private adapter.openclaw/options item. Workspace contains only path; mode is rejected. An explicit directory must already exist and permit read/write/access. Otherwise Gateway prepares ~/octo-runtime/channels/<bot_id>. OpenClaw needs no local workspace.

## Complete request debug logging

The process environment variable `OCO_CHANNEL_GATEWAY_DEUBG=1` (spelled exactly as shown) enables the `agent_run.client_input` debug event before each client call. It records complete inputs and agentEnv, including fallback parts, image mimeType/data/byteSize/sha256 and tool credentials. Base64 remains complete, without placeholders or truncation. CLI writes to the existing channels/channel-gateway-YYYYMMDDTHH.log file; SDK consumers receive it through the optional log callback, remaining silent without a callback. Other variable values do not emit this event. It never enters status mirrors.

Set the variable in the actual Gateway process environment. For foreground use, run `OCO_CHANNEL_GATEWAY_DEUBG=1 octo-channel-gateway run`. For a service manager, configure the service environment; temporary shell variables are not automatically written into an installed service definition.

This explicit mode writes prompts, images, private configuration and credentials to logs. Existing hourly 100 MiB capacity and retention rules apply. Debug records are dropped whole when eight records are pending, preserving complete JSON; logging failures do not affect execution. Remove the variable after diagnosis.

## Admission and delivery

Omitted allowed_sender_ids retains platform admission; [] denies all senders. groups_enabled defaults to true and does not affect direct messages. Omitted/null/[] group_ids adds no group restriction. Optional cards/typing presentation flags do not change execution permissions.

artifact_delivery supports mode (channel/tools), allowed_roots, allowed_mime_types, max_file_bytes, max_total_bytes, max_files, and timeout_ms. Roots must be absolute; MIME entries must be explicit type/subtype values without wildcards. Each list allows at most 32 entries. Numerical limits are in [Lifecycle and delivery](../guides/lifecycle-and-delivery.md).

codex_retry allows max_consecutive_retries/max_total_retries in 0..100, recovery_timeout_ms in 100..3600000, initial_delay_ms in 100..60000, and max_delay_ms in 100..300000. Initial delay cannot exceed maximum delay. Default initial/maximum delays are 2000/30000 ms. Interpret recovery behavior with logs; structural validation does not prove replay is safe.

Authoritative definitions: [configuration types](../../../packages/gateway/src/contracts.ts), [validation](../../../packages/gateway/src/lifecycle/configuration.ts).

`bot_name` is a display label; empty or omitted uses bot_id. Replace `your-model-id` with a model supported by the selected Provider. `effort: high` demonstrates explicit selection and does not set a global default. Public execution configuration is `agent`; its `adapter_type` selects the integration implementation. The former outer `adapter` field is unsupported.

Runtime connection settings do not belong in this business configuration. `extraset` rejects `runtime_home`, `endpoint`, and `runtime_endpoint`; use `start/run --runtime-home <path>`.
