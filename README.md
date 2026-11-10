# Octo Channel Gateway

[English documentation](docs/en/README.md) | [简体中文](docs/zh-CN/README.md)

Independent Octo IM registration SDK and service CLI. Gateway owns Bot configuration, business context, credentials, sessions, and message delivery. It connects to an existing Runtime Kernel through the public `@mininglamp-oss/octo-runtime-client`.

## Install

Requires Node.js 24 or 26 and Runtime **1.1.13 or later in the supported 1.x line** (IPC v2). The installation example uses npm `@latest`; the minimum supported version remains 1.1.13. Install and start Runtime separately; installing the client does not install or start a Kernel.

```sh
npm install -g @mininglamp-oss/octo-runtime@latest
octo-runtime start
octo-runtime doctor --json
npm install -g @mininglamp-oss/octo-channel-gateway
```

## Configure a Bot

Replace the Bot ID, display name, token, and project path. The example selects Codex with model `gpt-6.1-sol` and effort `high`; choose a model available to your account. Omitted approval policy uses Gateway's `full_access` default.

Paste this example into a POSIX shell:

```sh
octo-channel-gateway extraset <<'JSON'
{
  "bots": [
    {
      "bot_id": "my-codex-bot",
      "bot_name": "My Codex Bot",
      "api_url": "https://im.deepminer.com.cn/api",
      "bf_token": "REPLACE_WITH_BOT_TOKEN",
      "agent": {
        "adapter_type": "codex",
        "workdir": "/absolute/project",
        "model": "gpt-6.1-sol",
        "effort": "high"
      }
    }
  ]
}
JSON
```

`extraset` replaces the entire configuration. `configure` adds or updates one Bot; use `configure --help` for its options. `extraget` prints the complete configuration, including credentials. Commands operate directly on Gateway without a component prefix or argument.

Optional `agent.mcp` and `agent.envs` settings are validated and mapped to `agentEnv.items`; they are not included in model input. See [Configuration reference](docs/en/reference/configuration.md) for the full example, supported payloads, and override rules. The default CLI example stays minimal.

## Run and inspect

```sh
octo-channel-gateway start
octo-channel-gateway doctor
octo-channel-gateway status --json
octo-channel-gateway logs --lines 200 --follow
octo-channel-gateway restart
octo-channel-gateway stop
octo-channel-gateway uninstall
```

`start` installs the Gateway user service if necessary. `install` enables autostart by default; `restart` requires an installed service. `stop` preserves autostart settings, and `uninstall` preserves configuration and logs. For foreground execution, use `octo-channel-gateway run`.

Gateway configuration and logs live under `~/.octo-channel-gateway`, configurable with `--home`. Runtime Home defaults to `~/.octo-runtime`; use `start --runtime-home /absolute/runtime` or `run --runtime-home /absolute/runtime` for another Kernel. The path is a launch argument, not business configuration. `start` persists it in the native service definition; `restart` reuses those arguments. Gateway derives the socket or Windows named pipe from that directory. Startup checks Runtime readiness and provides setup instructions if unavailable. Service management uses launchd, systemd user services, or Windows user scheduled tasks.

Bare invocation and subcommand `--help` display usage, examples, and flags. `version` and `--version` report the package version, source commit, build time, and repository. Text-mode usage errors include the corresponding help; `--json` failures remain structured JSON.

## Integrate the SDK

The host creates or attaches to Runtime and supplies a public KernelClient. Register multiple Bots on one Gateway, and await close before releasing host resources:

```ts
import { attachKernel } from "@mininglamp-oss/octo-runtime-client";
import { ChannelGateway } from "@mininglamp-oss/octo-channel-gateway";

const kernel = attachKernel({ endpoint });
const gateway = new ChannelGateway({ kernel });
try {
  for (const binding of bindings) {
    await gateway.register(
      { apiUrl: binding.apiUrl, bfToken: binding.bfToken },
      binding.agent,
    );
  }
  await applicationLifetime; // CLI/Electron owns its event loop and exit handling.
} finally {
  try { await gateway.close(); }
  finally { kernel.close(); }
}
```

`register(bot, agent)` returns `Promise<void>` and adds or replaces a binding by normalized platform address and authenticated Bot ID. Token rotation does not create another binding. Validate the replacement, close the old binding, then start the new one; a failed replacement does not automatically restore the old configuration. Other Bots keep running. No separate start or registration handle is needed. After close, create a new ChannelGateway; the same host-owned client remains reusable until the host closes it.

Gateway owns Bot connections, timers, listeners, material callbacks, session-store handles and its own executions. It never closes the borrowed client or globally stops/drains its other users. Close shares a four-second deadline, attempts all resource cleanup and reports failures; timeout is not proof of cleanup. Hosts must await it before releasing Runtime resources. Electron intercepts before-quit and coordinates asynchronous cleanup in the main process; the SDK supplies no waitForShutdown or process handlers.

`bot.materials` supplies optional static `{ name, parts }` data, and `bot.loadMaterials` reads that shape each turn. Dynamic same-name entries replace static entries in place. Text/image parts go to model inputs; the separate `agent` argument supplies execution settings, including private `agent.items`. `bot.createSessionStore` provides owned handles over a host-owned database. The old ChannelRegistry, ChannelDefinition, ChannelRegistration, loadContexts and ContextItem material APIs are removed without compatibility wrappers. CLI configuration remains snake_case with nested bot.agent; the CLI maps it to the SDK API.

Gateway prepares history, channel context, and business material before invoking `KernelClient.invoke(inputs, sessionId, providerSession, agentEnv)`. Interrupt an execution using its `invocationId`; a business `sessionId` or Provider continuation identifier cannot replace it. MCP, environment variables, model/effort, and workspace settings travel in `agentEnv`. See [Inputs and execution environment](docs/en/concepts/inputs-and-agent-env.md) for the current boundary and remaining protocol migrations.

## Documentation

- [CLI installation and operations](docs/en/getting-started/cli.md)
- [SDK integration](docs/en/getting-started/sdk.md)
- [Business material and credentials](docs/en/guides/contexts-and-credentials.md)
- [Dependencies and releases](docs/en/guides/dependencies.md)
- [Migration](docs/en/guides/migration.md)

## Development

```sh
pnpm install --frozen-lockfile
pnpm run build
pnpm run typecheck
pnpm test
pnpm run docs:check
npm run pack:release
npm run test:package
```

`apps/cli` contains command and service management; `packages/gateway` contains the SDK and channel behavior. One npm package exports both the SDK and CLI. The full `@mininglamp-oss/octo-runtime` package is a development dependency used to launch real Kernels and exercise execution behavior in tests and manual verification. Production execution uses the independent client; installing Gateway globally does not install the full Runtime through that development dependency.

The client dependency is `^1.1.13`; npm resolves it at installation or explicit update, without background upgrades or crossing into 2.x. For explicit three-package interoperability verification, run `node scripts/verify-package.mjs GATEWAY.tgz RUNTIME.tgz CLIENT.tgz` with actual archives. Candidate-lock tooling is for manual candidate verification, not a substitute for registry-backed release lockfiles.

This repository follows Mininglamp-OSS/octo-spec. Engineering plans and validation records are indexed in [.octospec](.octospec/index.md).
