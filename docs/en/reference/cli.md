# CLI reference

[简体中文](../../zh-CN/reference/cli.md) | [Documentation](../README.md)

The binary is `octo-channel-gateway`. Global options are `--home <path>`, `--json`, `--help`, and `--version`. Only `start` and `run` accept `--runtime-home <path>` (default: `~/.octo-runtime`). The directory is determined solely by that command; no business configuration field overrides it. Kernel addresses are derived from that directory (executor-kernel.sock on macOS/Linux; a Home-based named pipe on Windows). `--home` changes only Gateway configuration and logs. Runtime is never started automatically.

| Command   | Behavior and options                                                                                         |
| --------- | ------------------------------------------------------------------------------------------------------------ |
| install   | Install a Gateway service definition using the default Runtime directory; --autostart true/false, default true                 |
| start     | Check Runtime readiness; install with automatic startup if absent, then start and await readiness            |
| restart   | Reuse the installed service arguments; await readiness of its replacement process                             |
| stop      | Stop Gateway and retain automatic startup settings                                                           |
| uninstall | Remove Gateway service registration, retain configuration/logs                                               |
| run       | Check Runtime readiness; run in the foreground with CLI termination handlers                                 |
| status    | Report operating system service and Gateway status                                                           |
| doctor    | Also report manager availability and Kernel status; successful exit does not mean every component is healthy |
| logs      | --lines defaults to 200; --follow tails logs; readable even if configuration is corrupt                      |
| configure | Add/update one Bot by normalized API URL and bot_id; save only; retain omitted fields for that identity      |
| extraset  | Replace configuration directly from stdin; require restart to apply                    |
| extraget  | Output complete configuration, including credentials                                                         |

configure requires `--bot_id` and `--api_url`. Optional flags are `--bot_name`, `--adapter_type`, `--workdir`, `--model`, `--effort` (low/medium/high/xhigh), `--provider_agent_id` (OpenClaw only), and `--bf_token`. The normalized API URL and bot_id identify one Bot. Other endpoints remain configured separately. Adding the same bot_id at a new endpoint requires an explicit new bf_token and does not inherit the existing endpoint's credential or adapter settings. Omitted optional fields are retained only for an existing matching identity; first-time offline configuration may omit credentials.

## Home and output

CLI examples use `https://im.deepminer.com.cn/api`, Codex model `gpt-6.1-sol`, effort `high`, and a `bot_name` immediately after `bot_id`. They omit `approval_mode`: Gateway already defaults to `full_access` when this field is absent.

All subcommand usage/input errors include a safe explanation and the relevant command's help and examples in text mode. Running `extraset` from a terminal without piped input displays input instructions; it does not save configuration. `extraset --help` includes a complete Codex JSON heredoc for POSIX shells, with explicit model, effort, workdir, and Bot credentials. Replace the sample endpoint, Bot ID, credential and project path, and select a model available to your Codex account. Empty input and malformed JSON also display guidance. `--json` retains structured errors without help text.

Bare invocation, `--help`, and `help [command]` show Commander-generated help using Runtime's section order: Usage, Examples, Available Commands, Arguments (when present), Flags, and Global Flags. Subcommands support `--help` and show inherited options. `version` and `--version` print the package version, source commit, build time, and repository URL. Build metadata is captured during `npm run build` and carried in the installed archive; unavailable metadata is shown as `unknown`. Help and version do not read configuration or start services.

Invalid commands, unknown options, missing values/required arguments, and unexpected positional arguments return exit code 2 with `INVALID_ARGUMENTS` and a safe hint to use `--help`. Argument diagnostics do not echo supplied values. With `--json`, failures produce only the structured error on stdout, without help text.

Default Home is `~/.octo-channel-gateway`: config.json belongs to the CLI, logs contains channel logs, and service.lock/status endpoints coordinate only this Home. Do not delete unknown active locks or reuse Runtime Home as the configuration directory. Configuration uses atomic temporary-file replacement, with POSIX mode 0600.

`install`, `start`, and `restart` check Home ownership before changing the native service. A foreground `run` already owning that Home produces `GATEWAY_HOME_OCCUPIED`, including the Home, owner PID, and recovery steps. Stop that foreground run in its terminal with Ctrl+C before starting the managed service. The CLI never kills it automatically or removes its live lock/socket. Duplicate `run` also reports the occupied Home. Only the normal lock-acquisition path reclaims a lock after confirming that its owner exited or that its PID now has a different process start marker. Old records without a marker and failed identity queries remain conservative: inspect the owner before attempting recovery. On macOS, start markers have second precision; an equal marker does not prove that PID reuse was impossible.

`status` and `doctor` correlate the manager, lock, and IPC PIDs. JSON includes `ownership.state` (`managed`, `unmanaged`, `none`, or `unknown`), `manager_pid`, `lock_pid`, `runtime_pid`, `lock_state`, and `ready`; unavailable PIDs are omitted. Managed readiness requires a running manager, a live matching lock, and a matching IPC process reporting `phase: ready`. Restart also requires a different manager PID. On Windows, the task backend identifies the unique Exec process belonging to the current native task instance using its process tree, account, executable, and arguments. A transition, failed identity query, or ambiguous process match cannot prove readiness: start/restart fail after the deadline even if the manager accepted the operation. The CLI stops the attempted managed service when readiness remains unconfirmed, while retaining an identified original process that was not replaced. It reports cleanup failures explicitly. Inspect `status`, `doctor`, and the native manager before retrying; an unrelated foreground owner remains untouched.

IPC availability does not prove that the latest saved Bot configuration is loaded: `ownership.config_loaded` is `not_verified`. Restart a foreground run in its terminal; `restart` only controls the native service. After `stop` or `uninstall`, JSON warning `GATEWAY_INSTANCE_REMAINS` and the text output identify an unmanaged or unverified instance that may still be running.

JSON errors contain error.code / error.message. Runtime prerequisite failures include installation, startup, doctor, and Runtime Home instructions without leaking raw lower-level errors. Exit codes: 0 command completed; 2 INVALID/REQUIRED; 3 NOT_INSTALLED; 4 UNAVAILABLE; 5 INCOMPLETE/DISPOSE_FAILED; otherwise 1. Readiness waiting defaults to 30 seconds; inspect logs on failure.

See the [CLI entry](../../../apps/cli/src/main.ts) and [configure implementation](../../../apps/cli/src/commands.ts). Commands address Gateway directly and do not accept a component prefix or argument. extraset requires a direct configuration object; config wrappers and module fields are rejected.

`--bot_name` sets a display label only; an empty or omitted label displays bot_id. It does not change Bot identity. `--adapter_type`, `--model`, `--effort`, and `--workdir` populate `agent.adapter_type`, `agent.model`, `agent.effort`, and `agent.workdir`. Example model IDs must be replaced with a Provider-supported value; the documented `high` effort is an example, not a global default.

`start --runtime-home /absolute/runtime` installs or updates the native definition with `run --home … --runtime-home …`, then starts it. `start` without the option explicitly uses the default Runtime directory. `restart` reuses installed arguments; it does not accept this option or rewrite the definition. To change the Runtime directory, use `start --runtime-home …`. `doctor` checks the endpoint reported by the running Gateway; if Gateway is stopped, it does not guess a Runtime endpoint. Management snapshots mark `definition_comparison: "not_requested"`: they check service identity/state, not desired launch arguments.
