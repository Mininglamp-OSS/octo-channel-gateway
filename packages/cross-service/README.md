# Cross-platform user services

[简体中文](README.zh.md)

Copied from `Mininglamp-OSS/octo-runtime`, package `octo-runtime-cross-service`, revision `4276f6d339461daa88c3215b8024d548eb313cb1` (Apache-2.0). This internal source package is compiled and shipped with Gateway; it does not depend on the Runtime checkout or a private npm package.

It maps a portable `ServiceSpec` to launchd, systemd user units and Windows user tasks. Arguments are persisted in the native definition; credentials stay in application configuration. Service readiness is checked by the caller. See [contracts](src/types.ts).

Gateway retains its existing Windows task ownership checks in `windows-task.ts`: lifecycle mutations require confirmed current-user ownership. The other source files are copied unchanged from the revision above.

Build as part of the repository root build. Native Windows/Linux validation requires those platforms; rendering and injected command runners can be tested locally.

## Host serialization contract

Backend mutations are multi-step operations, not transactions. The host must prevent overlapping install, uninstall, enable, disable, start, stop and restart operations for the same native service identity, including operations from separate processes and backend instances. Hold the guard across the complete operation and any host readiness checks or cleanup. An in-memory queue alone cannot protect concurrent CLI processes. Read-only inspection may observe an intermediate state.

The Gateway CLI already holds its Home's `config.lock` through each service mutation and its final checks. Contending commands fail with `SETUP_IN_PROGRESS` before entering the mutation. This internal package is not exported by the public Gateway SDK; direct backend consumers must provide an equivalent guard keyed to the native service identity, even if they use different configuration directories.

Run `npm run build && node --test scripts/verify-service-serialization.mjs` from the repository root for the explicit local check. It reproduces an unguarded install/uninstall race with a fake systemd runner, then checks the real CLI guard across two Node processes. It uses only temporary definitions and never invokes a native service manager. It is not part of default tests or CI.
