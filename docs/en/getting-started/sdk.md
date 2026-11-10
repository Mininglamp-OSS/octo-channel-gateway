# SDK integration

[简体中文](../../zh-CN/getting-started/sdk.md) | [Documentation](../README.md)

The SDK entry point is `new ChannelGateway({ kernel })`; `await gateway.register(bot, agent)` adds or replaces bindings. The host supplies a public KernelClient: use attachKernel({ endpoint }) for an existing service, or initialize createKernelService from the full Runtime and pass service.client. The host owns Kernel/Adapter/Provider installation, startup and shutdown.

Gateway borrows KernelClient. Repeated register calls return Promise<void>, with no separate handle or start operation. Embedded CLI/Electron hosts must await unified close; see the [embedding and shutdown contract](../guides/lifecycle-and-delivery.md).

## Prepare Runtime first

Both CLI and SDK modes require the execution service supplied by the full Runtime: minimum 1.1.13 in the supported 1.x line (IPC v2). Install the current release using `@latest`. When using its CLI, run:

```sh
npm install -g @mininglamp-oss/octo-runtime@latest
octo-runtime start
octo-runtime doctor --json
```

Keep custom Runtime --home consistent for startup and diagnostics. Gateway start/run checks Runtime first and provides this guidance on failure. SDK registration also queries Kernel status; SDK hosts may create and maintain the service through the full Runtime public API.

See [Dependencies and releases](../guides/dependencies.md) before installation. Runtime/client 1.1.13 is available from npm. When evaluating an unpublished Gateway checkout, build and install its local archive.

```sh
npm install @mininglamp-oss/octo-channel-gateway
```

The [shared example](../../examples/registration.mts) pairs registration with cleanup:

```ts
import {
  ChannelGateway,
  type GatewayBot,
  type ImAgentConfig,
} from "@mininglamp-oss/octo-channel-gateway";
import type { KernelClient } from "@mininglamp-oss/octo-runtime-client";

export async function withChannel<T>(
  kernel: KernelClient,
  bindings: readonly { bot: GatewayBot; agent: ImAgentConfig }[],
  serve: (gateway: ChannelGateway) => Promise<T>,
): Promise<T> {
  const gateway = new ChannelGateway({ kernel });
  try {
    for (const { bot, agent } of bindings) await gateway.register(bot, agent);
    return await serve(gateway);
  } finally {
    await gateway.close();
  }
}
```

Pass a host-owned KernelClient, multiple [GatewayBot and ImAgentConfig bindings](../reference/sdk.md), and a serve function representing the application's lifetime. All registrations are inside try; failure of any registration or serve awaits whole-Gateway cleanup. If work and cleanup both fail, this simple finally example throws the cleanup error; production hosts may aggregate both. Close leaves the client reusable; the host releases it when appropriate.

Execution settings are the second register argument, agent. Bot uses apiUrl/bfToken and optional botId/botName; authentication confirms identity. Put static material in bot.materials and current material in bot.loadMaterials; dynamic same-name entries replace whole static items. Credentials come from bot.credentials or bfToken. Callback/internal configuration snapshots retain snake_case fields; other channel options follow the configuration reference. CLI JSON retains bot.agent. See the [definition example](../../examples/definition.mts) and [Business material](../guides/contexts-and-credentials.md) for callbacks and image limits.

Keep the registration alive while receiving and delivering messages. Importing the SDK does not connect to the network or read CLI configuration, and the SDK installs no process signal/exit handlers. `options.signal` revokes the whole registration; await close to observe cleanup failures. See [Lifecycle and delivery](../guides/lifecycle-and-delivery.md).
