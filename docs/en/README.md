# Developer Documentation

[简体中文](../zh-CN/README.md) | [Documentation](../README.md)

Octo Channel Gateway connects platform messages to an existing Runtime Kernel and owns Bots, authorization, business material, sessions, replies, and artifact delivery. One npm package provides a registration SDK and a service CLI; it does not create or own the Kernel.

## Start here

1. For terminal deployment, follow [CLI installation and operations](getting-started/cli.md). For application integration, follow [SDK integration](getting-started/sdk.md).
2. Read [Architecture and ownership](concepts/architecture.md) to distinguish Gateway, Runtime, Providers, and the host application.
3. Read [Inputs and execution environment](concepts/inputs-and-agent-env.md) and [Identity and session identifiers](concepts/identifiers.md).

## Guides

| Task                                                        | Page                                                                    |
| ----------------------------------------------------------- | ----------------------------------------------------------------------- |
| Load material, instructions, and tool credentials each turn | [Business material and credentials](guides/contexts-and-credentials.md) |
| Resume sessions, handle reset/new/stop, supply a store      | [Session management](guides/sessions.md)                                |
| Close registrations and handle replies and attachments      | [Lifecycle and delivery](guides/lifecycle-and-delivery.md)              |
| Diagnose connection, configuration, execution, and cleanup  | [Troubleshooting](guides/troubleshooting.md)                            |
| Move from Runtime's bundled channel                         | [Migration and compatibility](guides/migration.md)                      |
| Understand npm installation, version ranges, and upgrades   | [Dependencies and releases](guides/dependencies.md)                     |

## Reference

| Look up                                                       | Page                                        |
| ------------------------------------------------------------- | ------------------------------------------- |
| Registration, host callbacks, and session handles             | [SDK](reference/sdk.md)                     |
| Commands, options, exit codes, and Home                       | [CLI](reference/cli.md)                     |
| Bot, authorization, Adapter, execution, and artifact settings | [Configuration](reference/configuration.md) |

The layout follows Runtime's paired language paths and shared examples. Content describes this repository's current implementation. See [Maintenance and validation](maintenance.md) for versions, evidence, and update rules.
