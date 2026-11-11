# Architecture and ownership

[简体中文](../../zh-CN/concepts/architecture.md) | [Documentation](../README.md)

Gateway executes only through the public `@mininglamp-oss/octo-runtime-client`. An incoming message passes platform authentication, group/sender admission, and session lookup before business material is prepared. The client invokes the Kernel, and Gateway consumes execution events and delivers results to the original channel. Delivery success is separate from execution success.

| Layer               | Responsibilities                                                             | Lifetime owner                    |
| ------------------- | ---------------------------------------------------------------------------- | --------------------------------- |
| Host application    | Credentials, business material, authorization, storage, Kernel startup       | Application                       |
| Gateway SDK         | Bot connections, admission, sessions/generations, inputs, replies, artifacts | ChannelGateway instance |
| Gateway CLI         | Configuration files, system services, logs, process signals                  | CLI / operating system manager    |
| Runtime client      | Connect to an existing endpoint; invoke, observe, interrupt                  | Host application |
| Kernel/Core/Adapter | Admit execution, interpret execution envelopes, call and interrupt Providers | Runtime host                      |
| Provider            | Model/tool execution and native sessions                                     | Provider                          |

register does not register a plugin or channel definition in the Kernel. It composes local objects using the host-supplied client. Functions are never serialized over IPC. close releases owned handles; it does not own the shared Kernel, other Gateway instances, or the host database.

This repository contains no WebUI/WeCom and defines no Extra discovery or universal plugin JSON. The SDK currently also exports some advanced orchestration types, including ImInvocationInput. Use ChannelGateway for normal integration rather than assembling internal drafts. Their `contexts` field is not the new Runtime invocation contract; see [Inputs and execution environment](inputs-and-agent-env.md).

Implementation: [ChannelGateway](../../../packages/gateway/src/gateway.ts), [public exports](../../../packages/gateway/src/index.ts), [execution input boundary](../../../packages/gateway/src/execution/kernel-input.ts).

## Facade and host lifecycle

The public facade is **ChannelGateway**: one instance owns multiple Bot ↔ Agent bindings and routes messages between them. Registry describes an internal collection rather than this connection/lifecycle facade. The operations are `await gateway.register(bot, agent)`, returning `Promise<void>`, and one idempotent `await gateway.close()` for all bindings. There is no per-registration public handle. Bot and Agent are separate arguments; agent uses ImAgentConfig.

ChannelRegistry and per-registration handles have been removed without compatibility wrappers. CLI configuration is mapped to this SDK API by the CLI host.

The SDK owns connections, admission, session mapping, Agent calls, delivery and cleanup of resources it creates. Each failed registration rolls back its own resources; the host closes the Gateway if the whole registration batch should stop. Closing stops admission, coordinates pending initialization, drains owned work and releases all owned bindings within a shared deadline. It does not stop a host-owned Agent/Engine or shared Kernel.

The constructor is `new ChannelGateway({ kernel })`, where kernel is a host-supplied public `KernelClient`. `@mininglamp-oss/octo-runtime-client@1.1.14` already exports this type. The host can attachKernel to an existing service or initialize createKernelService from the full Runtime and pass service.client. The host owns Runtime access and the client; Agent configuration belongs to each Bot binding. Gateway must not close the borrowed client or call its global invocations.stopAdmission()/drain(). It must track, cancel and finish only its own executions.

The register operation adds or replaces bindings while Gateway is running, without a global close/start cycle. IM identity consists of channel type, normalized API address and explicit, authenticated Bot ID; token rotation does not change identity. Same-identity operations run serially in call order: validate configuration and identity, clean up the old binding, then start the replacement. Two bindings must not admit work concurrently for the same identity. Validation failure preserves the old binding; old-resource cleanup failure prevents replacement startup. If replacement startup fails after the old binding closes, release the new resources and report that the binding is not running; automatic restoration is not promised. Other identities remain unaffected.

Close terminates the whole instance. Success means all owned resources have been cleaned up; failure or timeout must be observable, and registration is rejected after closure. See the [embedding and shutdown contract](../guides/lifecycle-and-delivery.md) for resources, concurrency and host shutdown requirements.

The host owns process lifetime. A CLI uses its existing online loop and shutdown handling; Electron uses its own event loop and asynchronous quit coordination. The SDK must not implement `waitForShutdown()`, a process-keeping loop, signal/exit handlers, Electron app control, PID discovery, single-instance enforcement or service management. Network observation/reconnect/heartbeat for its actual connections remains SDK work. Connecting through the public Runtime client's execution IPC is also SDK work; IPC for controlling another Gateway host process is host work.

The [Hooks guide](../guides/hooks.md) separates CLI instruction/debug behavior from policies implemented by Electron and other application hosts.
