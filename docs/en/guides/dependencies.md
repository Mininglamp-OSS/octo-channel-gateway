# Dependencies and releases

[简体中文](../../zh-CN/guides/dependencies.md) | [Documentation](../README.md)

**Both modes require a Runtime execution service.** CLI operation uses an already running Runtime Kernel. SDK hosts must provide an existing Kernel endpoint or create a service themselves through the full Runtime's public hosting API. Gateway contains no executor and does not install, start, or stop Runtime automatically.

| Dependency                                 | Purpose                                            | Installation responsibility                                          |
| ------------------------------------------ | -------------------------------------------------- | -------------------------------------------------------------------- |
| @mininglamp-oss/octo-runtime-client ^1.1.13 | Production execution connection and protocol types | npm resolves and installs it with Gateway                            |
| @mininglamp-oss/octo-runtime ^1.1.13           | Kernel, Adapters, execution service                | CLI user or SDK host explicitly installs and starts it               |
| Full Runtime devDependency                 | Repository tests and package interoperability      | Development only; not distributed as a Gateway production dependency |
| Provider CLIs / tools                      | Native model and tool capabilities                 | Installed/configured by the Kernel host                              |

```sh
npm install -g @mininglamp-oss/octo-runtime@^1.1.13
octo-runtime start
octo-runtime doctor --json
npm install -g @mininglamp-oss/octo-channel-gateway
```

Runtime/client 1.1.13 is published on npm. Use official registry metadata and archive integrity for frozen installation; hashes from earlier local candidates are not interchangeable with release hashes. Gateway source remains version 0.0.0 until release packaging stamps a tag version.

## Updating

npm installs production dependencies with Gateway but does not upgrade them in the background. Reinstallation or an explicit update resolves allowed versions; ^1.1.13 does not cross into 2.x. Updating dependencies does not upgrade an already running Kernel process. Coordinate Runtime/client/Gateway versions and restart their separate services as needed. SDK applications that import client or Runtime directly must declare those direct dependencies instead of relying on incidental package hoisting.

## Local release verification

```sh
node scripts/lock-runtime-candidates.mjs /path/runtime.tgz /path/client.tgz
node scripts/verify-package.mjs /path/gateway.tgz /path/runtime.tgz /path/client.tgz
```

The lock script reads metadata and hashes from real 1.1.13 archives, updates the targeted packages, and verifies integrity. Download URLs point to the official npm registry; the script does not publish. Registry installation requires the matching archives to be published first. Package verification installs three explicit archives in a separate temporary directory without importing private Runtime checkout modules.

## Full Runtime development dependency audit

The full Runtime remains a development-only integration-test dependency; its manifest and lock are upgraded to `^1.1.13`. The earlier `^2.0.0` observation in issue #23 does not describe this baseline. Production execution in `apps/` and `packages/` uses only the public client and `/protocol`; CLI uses attachKernel. The copied cross-service code is built locally and introduces no private Runtime package dependency.

| Usage inspected | Why it exists | Decision and possible alternative |
| --- | --- | --- |
| `test/kernel-fixture.js`, `test/native-host-fixture.js`, `test/cli-runtime-home.test.js`, `scripts/verify-package.mjs` | Start isolated real Kernels through published `/executor-kernel` or `/host` exports and verify IPC, cleanup, endpoint derivation and package interoperability. | Retain. A client can connect to a server but cannot create this service fixture. Replacing these with mocks would remove interoperability coverage. |
| `prepareInvokeInput` imports in admission, pre-execution failure, task-channel, protocol, mention/instructions, group-rules, runtime, scheduling and retry tests; `verify-channel-features-live.mjs` | Observe Runtime normalization of Gateway wire input through the published `/executor-core` export. | Retain the normalization assertions as integration coverage. Pure Gateway construction assertions can instead use public protocol validators and `test-support/kernel-mock.js`; that does not verify Runtime normalization. |
| `runtimeModule` consumers in diagnostic completion, task retry and the tool-environment adapter fixture | Inspect Codex event normalization, the invocation watchdog and adapter subprocess environment assembly. | Explicit implementation-coupled regression tests, resolved from installed Runtime artifacts, not a checkout. Keep while those upstream behaviors are being verified. Canonical event fixtures and public Kernel calls can replace Gateway-only assertions, but cannot directly assert internal watchdog/adapter behavior. |
| Live scripts and fixtures for Codex, OpenCode, CodeBuddy, history, artifacts, model waits and diagnostics | The test host selects executable/Home, creates a managed Engine and passes it to createCodexAdapter. Adapter entries come from installed Runtime dependencies; Kernels use public APIs and calls use the four-argument client. | Removed private CLI loadCliAdapters/manifest factories, checkout path conversion and old aggregate Adapter exports. verification-kernel owns independent services and Engines. Explicit execution only; actual Provider/IM success still requires separate verification. The CodeBuddy tool observes public canonical terminals and native ACP evidence, without intercepting another client's subscription. |
| Unused `runtimeModule` imports in history-intent and group-rules tests | Residue of the migration test harness. | Removable cleanup; these imports do not justify retaining the full Runtime. The real-Kernel tests above do. |
| `scripts/lock-runtime-candidates.mjs` and archive-verification scripts | Verify explicit published artifacts and dependency integrity. | Retain as local release tooling; no new CI scope or production dependency. |

`test-support/runtime-module.mjs` intentionally bypasses package export boundaries through dependency resolution rooted in the installed full Runtime. This is a known test-only coupling, not evidence that these modules are public APIs. Production code must not import this helper. Keeping the development dependency preserves meaningful real-Kernel coverage; it does not make Gateway install or start Runtime for end users. A future test cleanup can reduce internal coupling independently of that decision.

Run the new migration and full logging checks explicitly with `node scripts/verify-runtime-1.1.13.mjs`; they are outside default test/CI globs. Existing CI installation, type, build, documentation, regression, archive and consumer checks remain. Workflows, matrix, triggers and Gates are not expanded. Live IM/Provider tools require explicit test credentials; syntax checks and isolated host checks do not establish external interoperability.
