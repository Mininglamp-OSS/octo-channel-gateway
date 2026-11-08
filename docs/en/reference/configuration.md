# Configuration reference

[简体中文](../../zh-CN/reference/configuration.md) | [Documentation](../README.md)

The CLI config.json belongs only to Gateway; it is not a Runtime plugin manifest. The SDK accepts objects and functions directly without a file. This validated example deliberately disables the Bot and contains no credential. Replace paths and platform address, and provide credentials securely before enabling it:

```json
{
  "endpoint": "/absolute/runtime/executor-kernel.sock",
  "enabled": true,
  "bots": [
    {
      "bot_id": "assistant",
      "api_url": "https://im.example.com/api",
      "enabled": false,
      "adapter": {
        "adapter_type": "codex",
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
| endpoint             | Existing local Kernel socket/named pipe; overridden by --endpoint                                                      |
| bots                 | Up to 64 Bots; API address plus bot_id must be unique                                                                  |
| enabled              | false prevents all Bot registrations                                                                                   |
| context_loading      | timeout_ms defaults to 5000 (1..30000), max_in_flight to 8 (1..32); the CLI does not load callback functions from JSON |
| authorized_space_ids | Optional authenticated-space allowlist; explicit [] denies all spaces                                                  |

Configuration file/input size is limited to 1 MiB, and each Bot configuration to 256 KiB. extraset replaces configuration; use restart after changes. Arbitrary business data does not imply Runtime understands it.

## Bot and execution

| Field                                 | Contract                                                                                                                  |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| bot_id / api_url / adapter            | Required; HTTPS API URL, loopback-only HTTP, no credentials/query/fragment                                                |
| bot_name / enabled / bf_token         | Optional display name, enabled state, and configured credential; name is not identity; SDK can use a credentials callback |
| adapter.adapter_type                  | Adapter selection; explicit configuration and a matching Kernel Provider installation are recommended                     |
| adapter.workdir                       | Optional absolute local path; not accepted by OpenClaw                                                                    |
| adapter.model / effort                | Provider model/reasoning selection; actual support is Adapter-specific                                                    |
| adapter.provider_agent_id             | OpenClaw only, selects an existing Agent; this channel defaults to main                                                   |
| approval_mode                         | Defaults to full_access; explicitly choose ask for approvals; the default is not an isolation sandbox                     |
| run_timeout_ms                        | Optional integer 100..86400000, execution time budget                                                                     |
| context                               | Optional Context v3 static material/execution configuration; see the business material guide for loading and splitting    |
| stable_context_refresh_interval_turns | Positive integer, default 30; first turn and reset restart counting                                                       |
| codex_retry                           | Codex-specific recovery switch and count/time/backoff budgets, not a generic Provider replay switch                       |

## Admission and delivery

Omitted allowed_sender_ids retains platform admission; [] denies all senders. groups_enabled defaults to true and does not affect direct messages. Omitted/null/[] group_ids adds no group restriction. Optional cards/typing presentation flags do not change execution permissions.

artifact_delivery supports mode (channel/tools), allowed_roots, allowed_mime_types, max_file_bytes, max_total_bytes, max_files, and timeout_ms. Roots must be absolute; MIME entries must be explicit type/subtype values without wildcards. Each list allows at most 32 entries. Numerical limits are in [Lifecycle and delivery](../guides/lifecycle-and-delivery.md).

codex_retry allows max_consecutive_retries/max_total_retries in 0..100, recovery_timeout_ms in 100..3600000, initial_delay_ms in 100..60000, and max_delay_ms in 100..300000. Initial delay cannot exceed maximum delay. Default initial/maximum delays are 2000/30000 ms. Interpret recovery behavior with logs; structural validation does not prove replay is safe.

Authoritative definitions: [configuration types](../../../packages/gateway/src/contracts.ts), [validation](../../../packages/gateway/src/lifecycle/configuration.ts).
