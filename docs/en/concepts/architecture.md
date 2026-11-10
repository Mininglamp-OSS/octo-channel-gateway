# Architecture and ownership

[简体中文](../../zh-CN/concepts/architecture.md) | [Documentation](../README.md)

Gateway executes only through the public `@mininglamp-oss/octo-runtime-client`. An incoming message passes platform authentication, group/sender admission, and session lookup before business material is prepared. The client invokes the Kernel, and Gateway consumes execution events and delivers results to the original channel. Delivery success is separate from execution success.

| Layer               | Responsibilities                                                             | Lifetime owner                    |
| ------------------- | ---------------------------------------------------------------------------- | --------------------------------- |
| Host application    | Credentials, business material, authorization, storage, Kernel startup       | Application                       |
| Gateway SDK         | Bot connections, admission, sessions/generations, inputs, replies, artifacts | Each ChannelRegistry registration |
| Gateway CLI         | Configuration files, system services, logs, process signals                  | CLI / operating system manager    |
| Runtime client      | Connect to an existing endpoint; invoke, observe, interrupt                  | Dedicated client per registration |
| Kernel/Core/Adapter | Admit execution, interpret execution envelopes, call and interrupt Providers | Runtime host                      |
| Provider            | Model/tool execution and native sessions                                     | Provider                          |

register does not register a plugin or channel definition in the Kernel. It composes local objects and connects to the Kernel. Functions are never serialized over IPC. close releases owned handles; it does not own the shared Kernel, sibling registrations, or the host database.

This repository contains no WebUI/WeCom and defines no Extra discovery or universal plugin JSON. The SDK currently also exports some advanced orchestration types, including ImInvocationInput. Use ChannelRegistry for normal integration rather than assembling internal drafts. Their `contexts` field is not the new Runtime invocation contract; see [Inputs and execution environment](inputs-and-agent-env.md).

Implementation: [registry](../../../packages/gateway/src/registry.ts), [public exports](../../../packages/gateway/src/index.ts), [execution input boundary](../../../packages/gateway/src/execution/kernel-input.ts).

## Target facade and host lifecycle

The agreed target name is **ChannelGateway**: one instance owns multiple Bot ↔ Agent bindings and routes messages between them. Registry describes an internal collection rather than this connection/lifecycle facade. The target operations are `await gateway.register({ bot, agent })`, returning `Promise<void>`, and one idempotent `await gateway.close()` for all bindings. There is no per-registration public handle. Bot and Agent are peer endpoints; the concrete Agent parameter type remains part of the API migration design.

This is an architectural target, **not the currently exported API**. The implementation and integration examples above still use ChannelRegistry and registration handles. No ChannelGateway facade or host-control RPC is introduced by this documentation change.

The SDK owns connections, admission, session mapping, Agent calls, delivery and cleanup of resources it creates. Each failed registration rolls back its own resources; the host closes the Gateway if the whole registration batch should stop. Closing stops admission, coordinates pending initialization, drains owned work and releases all owned bindings within a shared deadline. It does not stop a host-owned Agent/Engine or shared Kernel.

The host owns process lifetime. A CLI uses its existing online loop and shutdown handling; Electron uses its own event loop and asynchronous quit coordination. The SDK must not implement `waitForShutdown()`, a process-keeping loop, signal/exit handlers, Electron app control, PID discovery, single-instance enforcement or service management. Network observation/reconnect/heartbeat for its actual connections remains SDK work. Connecting through the public Runtime client's execution IPC is also SDK work; IPC for controlling another Gateway host process is host work.
