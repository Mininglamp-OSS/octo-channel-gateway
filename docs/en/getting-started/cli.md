# CLI installation and operations

[简体中文](../../zh-CN/getting-started/cli.md) | [Documentation](../README.md)

Use Node.js 24 or 26, a ready local Runtime Kernel, a platform Bot with valid credentials, and the Provider installation used by the Kernel. Runtime and Gateway have separate services and Homes. Runtime/client 1.1.12 is available from npm; see [Dependencies and releases](../guides/dependencies.md) for version and archive verification.

## Prepare Runtime first

Both CLI and SDK modes require the execution service supplied by the full Runtime. When using its CLI, run:

```sh
npm install -g @mininglamp-oss/octo-runtime@^1.1.12
octo-runtime start
octo-runtime doctor --json
```

Keep custom Runtime --home consistent for startup and diagnostics. Gateway start/run checks Runtime first and provides this guidance on failure. SDK registration also queries Kernel status; SDK hosts may create and maintain the service through the full Runtime public API.

## Configure and start

Paths and domains below are examples. Start the Kernel before configuring Gateway. On Windows, use the Runtime directory; its named pipe is derived automatically.

```sh
npm install -g @mininglamp-oss/octo-channel-gateway
octo-channel-gateway --help
octo-channel-gateway configure --help
octo-channel-gateway configure --bot_id assistant --api_url https://im.example.com/api --adapter_type codex --workdir /absolute/workspace
octo-channel-gateway install --autostart true
octo-channel-gateway start --runtime-home /absolute/runtime
octo-channel-gateway doctor --json
octo-channel-gateway status --json
octo-channel-gateway logs --lines 200 --follow
```

configure only saves configuration; it does not authenticate or start a service. No credential is written by this example. Before first startup, import a protected configuration file containing a valid bf_token, or supply a credentials callback through the SDK. `--bf_token` is also supported, but command arguments may appear in shell history and process listings. Do not treat extraget output as redacted diagnostics.

configure updates the normalized API URL and Bot ID pair. It preserves omitted fields only for that exact identity and leaves other endpoints unchanged. Configuring the same Bot ID at a new API endpoint requires a new `--bf_token`; credentials and Agent settings are never copied from another endpoint. Authenticated REST requests reject redirects. On Windows, service changes require a confirmed current-user task identity; an unknown or mismatched account blocks installation and lifecycle commands.

install creates a service definition using the default Runtime directory, with automatic startup enabled by default. start installs or updates the definition with its own --runtime-home argument, requests startup and waits for Gateway readiness. If absent, start installs the service with automatic startup enabled. restart preserves the installed arguments. Use restart after configuration changes; the CLI does not promise hot reload.

## Stop and remove

```sh
octo-channel-gateway restart
octo-channel-gateway stop
octo-channel-gateway uninstall
```

restart requires an installed Gateway. stop preserves automatic startup settings. uninstall removes service registration while retaining configuration and logs. None of these controls the Kernel. Use run for foreground debugging; the CLI handles SIGINT/SIGTERM and closes registrations.

```sh
octo-channel-gateway run --runtime-home /absolute/runtime
```

Home defaults to `~/.octo-channel-gateway`; use `--home` to select an instance. macOS uses launchd, Linux uses a systemd user service, and Windows uses a user scheduled task. Manager availability depends on the operating system and user session. A doctor exit code of 0 means diagnostics completed: inspect manager/kernel/runtime fields. See the [CLI reference](../reference/cli.md).

## Import a complete configuration

```sh
node dist/apps/cli/src/index.js extraset <<'JSON'
{
  "enabled": true,
  "bots": [
    {
      "bot_id": "your-bot-id",
      "bot_name": "",
      "api_url": "https://im.example.com/api",
      "bf_token": "your-bot-token",
      "agent": {
        "adapter_type": "codex",
        "model": "your-model-id",
        "effort": "high",
        "workdir": "/absolute/workspace"
      }
    }
  ]
}
JSON
```

Replace all example paths, Bot identity, credentials and model ID before use. `bot_name` is a display label for distinguishing Bots; an empty or omitted value falls back to bot_id. `agent` contains execution settings; `adapter_type` selects the Provider integration. `model` is a placeholder, and `effort: high` is an example, not a global default. Runtime Home is not a configuration field; specify it with start/run --runtime-home, or omit that option to use ~/.octo-runtime. extraset replaces the full configuration; restart applies it. Config and logs stay in ~/.octo-channel-gateway.
