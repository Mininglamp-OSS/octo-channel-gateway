# CLI installation and operations

[简体中文](../../zh-CN/getting-started/cli.md) | [Documentation](../README.md)

Use Node.js 24 or 26, a ready local Runtime Kernel, a platform Bot with valid credentials, and the Provider installation used by the Kernel. Runtime and Gateway have separate services and Homes. The 2.0 dependencies are currently unpublished candidates; see [Dependencies and releases](../guides/dependencies.md) for availability and local archive verification.

## Prepare Runtime first

Both CLI and SDK modes require the execution service supplied by the full Runtime. When using its CLI, run:

```sh
npm install -g @mininglamp-oss/octo-runtime@^1.1.12
octo-runtime executor-kernel start
octo-runtime doctor --json
```

Use matching archives while 2.0 is unpublished; keep custom --home consistent for startup and diagnostics. Gateway start/restart/run checks Runtime first and provides this guidance on failure. SDK registration also queries Kernel status; SDK hosts may create and maintain the service through the full Runtime public API.

## Configure and start

Paths and domains below are examples. Start the Kernel before configuring Gateway. On Windows, replace the endpoint with that Kernel's named pipe.

```sh
npm install -g @mininglamp-oss/octo-channel-gateway
octo-channel-gateway --help
octo-channel-gateway configure --help
octo-channel-gateway configure --bot_id assistant --api_url https://im.example.com/api --adapter_type codex --workdir /absolute/workspace
octo-channel-gateway install --endpoint /absolute/runtime/executor-kernel.sock --autostart true
octo-channel-gateway start
octo-channel-gateway doctor --json
octo-channel-gateway status --json
octo-channel-gateway logs --lines 200 --follow
```

configure only saves configuration; it does not authenticate or start a service. No credential is written by this example. Before first startup, import a protected configuration file containing a valid bf_token, or supply a credentials callback through the SDK. `--bf_token` is also supported, but command arguments may appear in shell history and process listings. Do not treat extraget output as redacted diagnostics.

configure updates the normalized API URL and Bot ID pair. It preserves omitted fields only for that exact identity and leaves other endpoints unchanged. Configuring the same Bot ID at a new API endpoint requires a new `--bf_token`; credentials and Adapter settings are never copied from another endpoint. Authenticated REST requests reject redirects. On Windows, service changes require a confirmed current-user task identity; an unknown or mismatched account blocks installation and lifecycle commands.

install saves the endpoint and installs a service definition with automatic startup enabled by default. Explicit start requests startup and waits for Gateway readiness. If absent, start installs the service with automatic startup enabled. Use restart after configuration changes; the CLI does not promise hot reload.

## Stop and remove

```sh
octo-channel-gateway restart
octo-channel-gateway stop
octo-channel-gateway uninstall
```

restart requires an installed Gateway. stop preserves automatic startup settings. uninstall removes service registration while retaining configuration and logs. None of these controls the Kernel. Use run for foreground debugging; the CLI handles SIGINT/SIGTERM and closes registrations.

```sh
octo-channel-gateway run --endpoint /absolute/runtime/executor-kernel.sock
```

Home defaults to `~/.octo-channel-gateway`; use `--home` to select an instance. macOS uses launchd, Linux uses a systemd user service, and Windows uses a user scheduled task. Manager availability depends on the operating system and user session. A doctor exit code of 0 means diagnostics completed: inspect manager/kernel/runtime fields. See the [CLI reference](../reference/cli.md).
