# Cross-platform user services

[简体中文](README.zh.md)

Copied from `Mininglamp-OSS/octo-runtime`, package `octo-runtime-cross-service`, revision `4276f6d339461daa88c3215b8024d548eb313cb1` (Apache-2.0). This internal source package is compiled and shipped with Gateway; it does not depend on the Runtime checkout or a private npm package.

It maps a portable `ServiceSpec` to launchd, systemd user units and Windows user tasks. Arguments are persisted in the native definition; credentials stay in application configuration. Service readiness is checked by the caller. See [contracts](src/types.ts).

Gateway retains its existing Windows task ownership checks in `windows-task.ts`: lifecycle mutations require confirmed current-user ownership. The other source files are copied unchanged from the revision above.

Build as part of the repository root build. Native Windows/Linux validation requires those platforms; rendering and injected command runners can be tested locally.
