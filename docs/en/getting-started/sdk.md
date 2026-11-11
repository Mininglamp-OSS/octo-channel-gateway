# SDK integration

[简体中文](../../zh-CN/getting-started/sdk.md) | [Documentation](../README.md)

The SDK entry point is `new ChannelGateway({ kernel })`; `await gateway.register(bot, agent)` adds or replaces bindings. The host supplies a public KernelClient: use attachKernel({ endpoint }) for an existing service, or initialize createKernelService from the full Runtime and pass service.client. The host owns Kernel/Adapter/Provider installation, startup and shutdown.

Gateway borrows KernelClient. Repeated register calls return Promise<void>, with no separate handle or start operation. Embedded CLI/Electron hosts must await unified close; see the [embedding and shutdown contract](../guides/lifecycle-and-delivery.md).

## Prepare Runtime first

Both CLI and SDK modes require the execution service supplied by the full Runtime: minimum 1.1.14 in the supported 1.x line (IPC v2). Install the current release using `@latest`. When using its CLI, run:

```sh
npm install -g @mininglamp-oss/octo-runtime@latest
octo-runtime start
octo-runtime doctor --json
```

Keep custom Runtime --home consistent for startup and diagnostics. Gateway start/run checks Runtime first and provides this guidance on failure. SDK registration also queries Kernel status; SDK hosts may create and maintain the service through the full Runtime public API.

See [Dependencies and releases](../guides/dependencies.md) before installation. Runtime/client 1.1.14 is available from npm. When evaluating an unpublished Gateway checkout, build and install its local archive.

```sh
npm install @mininglamp-oss/octo-channel-gateway
```

The [shared example](../../examples/registration.mts) pairs registration with cleanup:

```ts
import {
  ChannelGateway,
  type GatewayBot,
  type GatewayHook,
  type ImAgentConfig,
} from "@mininglamp-oss/octo-channel-gateway";
import type { KernelClient } from "@mininglamp-oss/octo-runtime-client";

export async function withChannel<T>(
  kernel: KernelClient,
  bindings: readonly { bot: GatewayBot; agent: ImAgentConfig; hooks?: readonly GatewayHook[] }[],
  serve: (gateway: ChannelGateway) => Promise<T>,
): Promise<T> {
  const gateway = new ChannelGateway({ kernel });
  try {
    for (const { bot, agent, hooks } of bindings) await gateway.register(bot, agent, hooks);
    return await serve(gateway);
  } finally {
    await gateway.close();
  }
}
```

Pass a host-owned KernelClient, multiple [GatewayBot and ImAgentConfig bindings](../reference/sdk.md), and a serve function representing the application's lifetime. All registrations are inside try; failure of any registration or serve awaits whole-Gateway cleanup. If work and cleanup both fail, this simple finally example throws the cleanup error; production hosts may aggregate both. Close leaves the client reusable; the host releases it when appropriate.

Execution settings are the second register argument. botId and apiUrl are required; botName is optional. Credentials come from bot.credentials or bfToken, and authentication must match botId. Per-message XML context belongs to channel message handling, not registration configuration; see [Channel event context and credentials](../guides/contexts-and-credentials.md). CLI JSON retains bot_id, api_url and nested agent.

Keep the registration alive while receiving and delivering messages. Importing the SDK does not connect to the network or read CLI configuration, and the SDK installs no process signal/exit handlers. `options.signal` revokes the whole registration; await close to observe cleanup failures. See [Lifecycle and delivery](../guides/lifecycle-and-delivery.md).


Pass a third hooks array when the host needs to transform inputs or log final calls; see [application Hooks](../reference/sdk.md) and the [typed example](../../examples/hooks.mts). CLI instruction/debug policies are not installed by SDK registration.

The [Hooks guide](../guides/hooks.md) separates CLI instruction/debug behavior from policies implemented by Electron and other application hosts.

The CLI instruction examples for each Adapter do not define SDK behavior. **If an SDK application sets agent.instruction, it must also implement and register the Hook that consumes it; the SDK does not prepend it automatically.**
