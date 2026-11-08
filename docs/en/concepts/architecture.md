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
