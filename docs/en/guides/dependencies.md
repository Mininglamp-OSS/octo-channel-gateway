# Dependencies and releases

[简体中文](../../zh-CN/guides/dependencies.md) | [Documentation](../README.md)

**Both modes require a Runtime execution service.** CLI operation uses an already running Runtime Kernel. SDK hosts must provide an existing Kernel endpoint or create a service themselves through the full Runtime's public hosting API. Gateway contains no executor and does not install, start, or stop Runtime automatically.

| Dependency                                 | Purpose                                            | Installation responsibility                                          |
| ------------------------------------------ | -------------------------------------------------- | -------------------------------------------------------------------- |
| @mininglamp-oss/octo-runtime-client ^2.0.0 | Production execution connection and protocol types | npm resolves and installs it with Gateway                            |
| @mininglamp-oss/octo-runtime 2.x           | Kernel, Adapters, execution service                | CLI user or SDK host explicitly installs and starts it               |
| Full Runtime devDependency                 | Repository tests and package interoperability      | Development only; not distributed as a Gateway production dependency |
| Provider CLIs / tools                      | Native model and tool capabilities                 | Installed/configured by the Kernel host                              |

```sh
npm install -g @mininglamp-oss/octo-runtime@^2
octo-runtime start
octo-runtime doctor --json
npm install -g @mininglamp-oss/octo-channel-gateway
```

Version 2.0.0 is currently a local, unpublished candidate. These commands describe installation after matching versions are published. Use real local archives for current integration; an older registry release does not implement the new protocol.

## Updating

npm installs production dependencies with Gateway but does not upgrade them in the background. Reinstallation or an explicit update resolves allowed versions; ^2.0.0 does not cross into 3.x. Updating dependencies does not upgrade an already running Kernel process. Coordinate Runtime/client/Gateway versions and restart their separate services as needed. SDK applications that import client or Runtime directly must declare those direct dependencies instead of relying on incidental package hoisting.

## Local release verification

```sh
node scripts/lock-runtime-candidates.mjs /path/runtime.tgz /path/client.tgz
node scripts/verify-package.mjs /path/gateway.tgz /path/runtime.tgz /path/client.tgz
```

The lock script reads metadata and hashes from real 2.0.0 archives, updates the targeted packages, and verifies integrity. Download URLs point to the official npm registry; the script does not publish. Registry installation requires the matching archives to be published first. Package verification installs three explicit archives in a separate temporary directory without importing private Runtime checkout modules.
