# SDK integration

[简体中文](../../zh-CN/getting-started/sdk.md) | [Documentation](../README.md)

The SDK entry point is `ChannelRegistry.register(endpoint, definition)`. The endpoint must identify an existing local Kernel whose execution_ready status is true: a socket on POSIX or a named pipe on Windows. The host installs and starts the Kernel and its required Adapter/Provider; Gateway does not start it.

## Prepare Runtime first

Both CLI and SDK modes require the execution service supplied by the full Runtime. When using its CLI, run:

```sh
npm install -g @mininglamp-oss/octo-runtime@^1.1.12
octo-runtime start
octo-runtime doctor --json
```

Keep custom Runtime --home consistent for startup and diagnostics. Gateway start/run checks Runtime first and provides this guidance on failure. SDK registration also queries Kernel status; SDK hosts may create and maintain the service through the full Runtime public API.

See [Dependencies and releases](../guides/dependencies.md) before installation. Runtime/client 1.1.12 is available from npm. When evaluating an unpublished Gateway checkout, build and install its local archive.

```sh
npm install @mininglamp-oss/octo-channel-gateway
```

The [shared example](../../examples/registration.mts) pairs registration with cleanup:

```ts
import {
  ChannelRegistry,
  type ChannelDefinition,
  type ChannelRegistration,
} from "@mininglamp-oss/octo-channel-gateway";

export async function withChannel<T>(
  endpoint: string,
  definition: ChannelDefinition,
  serve: (registration: ChannelRegistration) => Promise<T>,
): Promise<T> {
  const registration = await ChannelRegistry.register(endpoint, definition);
  try {
    return await serve(registration);
  } finally {
    await registration.close();
  }
}
```

Pass a real endpoint, a [ChannelDefinition](../reference/sdk.md), and a `serve` function representing the application's service lifetime. Completion or failure of `serve` awaits close. If both work and cleanup fail, this simple finally example throws the cleanup error; a production host may aggregate both. Registration failure rolls back resources already acquired by the SDK.

One definition configures one Bot. Credentials come from the host's `credentials` callback or bot.bf_token; `loadContexts` returns per-turn business material. The [definition example](../../examples/definition.mts) delegates credential and material reads to the application.

Keep the registration alive while receiving and delivering messages. Importing the SDK does not connect to the network or read CLI configuration, and the SDK installs no process signal/exit handlers. `definition.signal` revokes the whole registration; await close to observe cleanup failures. See [Lifecycle and delivery](../guides/lifecycle-and-delivery.md).
