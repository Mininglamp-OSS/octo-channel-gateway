# CLI reference

[简体中文](../../zh-CN/reference/cli.md) | [Documentation](../README.md)

The binary is `octo-channel-gateway`. Global options are `--home <path>`, `--endpoint <path>`, `--json`, `--help`, and `--version`. Command-line endpoint takes precedence over configuration. There is no implicit Runtime discovery or automatic startup.

| Command   | Behavior and options                                                                                         |
| --------- | ------------------------------------------------------------------------------------------------------------ |
| install   | Install a Gateway service definition and save endpoint; --autostart true/false, default true                 |
| start     | Check Runtime readiness; install with automatic startup if absent, then start and await readiness            |
| restart   | Check Runtime readiness; restart an installed service without installing an absent one                       |
| stop      | Stop Gateway and retain automatic startup settings                                                           |
| uninstall | Remove Gateway service registration, retain configuration/logs                                               |
| run       | Check Runtime readiness; run in the foreground with CLI termination handlers                                 |
| status    | Report operating system service and Gateway status                                                           |
| doctor    | Also report manager availability and Kernel status; successful exit does not mean every component is healthy |
| logs      | --lines defaults to 200; --follow tails logs; readable even if configuration is corrupt                      |
| configure | Add/update one Bot by bot_id; save only; retain omitted optional fields                                      |
| extraset  | Replace configuration from stdin, accept the old config wrapper, require restart to apply                    |
| extraget  | Output complete configuration, including credentials                                                         |

configure requires `--bot_id` and `--api_url`. Optional flags are `--adapter_type`, `--workdir`, `--model`, `--effort` (low/medium/high/xhigh), `--provider_agent_id` (OpenClaw only), and `--bf_token`. Changing an API address for the same bot_id does not append a second Bot; old duplicate entries are consolidated. Business identity changes still require authentication.

## Home and output

Default Home is `~/.octo-channel-gateway`: config.json belongs to the CLI, logs contains channel logs, and service.lock/status endpoints coordinate only this Home. Do not delete unknown active locks or reuse Runtime Home as the configuration directory. Configuration uses atomic temporary-file replacement, with POSIX mode 0600.

JSON errors contain error.code / error.message. Runtime prerequisite failures include installation, startup, doctor, and endpoint instructions without leaking raw lower-level errors. Exit codes: 0 command completed; 2 INVALID/REQUIRED; 3 NOT_INSTALLED; 4 UNAVAILABLE; 5 INCOMPLETE/DISPOSE_FAILED; otherwise 1. Readiness waiting defaults to 30 seconds; inspect logs on failure.

See the [CLI entry](../../../apps/cli/src/main.ts) and [configure implementation](../../../apps/cli/src/commands.ts). Legacy component forms are documented under [Migration](../guides/migration.md).
