# Source workspace integration

[简体中文](../../zh-CN/guides/source-workspace.md) | [Documentation](../README.md)

The public npm distribution remains `@mininglamp-oss/octo-channel-gateway` with the `octo-channel-gateway` command. Published consumers keep their existing imports. An embedding source host uses the private `@mininglamp-oss/octo-channel-gateway-sdk` package instead. Both consumers run the same SDK implementation.

## Packages and builds

| Directory | Package | Direct production dependencies |
| --- | --- | --- |
| packages/octo-channel-gateway-sdk | @mininglamp-oss/octo-channel-gateway-sdk | Runtime Client, Markdown parser, ws |
| apps/cli | @mininglamp-oss/octo-channel-gateway-cli | SDK, cross-service, Runtime Client, commander |
| packages/cross-service | @mininglamp-oss/octo-channel-gateway-cross-service | iconv-lite |

All three source packages are private and build to their own `dist/`. CLI edges use `workspace:*` and package exports; the SDK does not own CLI configuration, argument parsing, service management or process handlers. The SDK's explicit `host/*` exports provide diagnostics/logging/types to the CLI without source-directory imports. Hosts use the main SDK entrypoint.

From this repository, run `pnpm install --frozen-lockfile`, then `pnpm run build`. pnpm builds SDK and cross-service before CLI; the final step generates the public root facade and CLI launcher. A package's build/typecheck resolves its dependencies' built declarations, so build dependencies first. Standalone development uses the supported registry Runtime Client range `^1.1.14`; no sibling Runtime checkout is required. The existing Runtime dev dependency supports controlled Kernel tests.

## Compose two source submodules

The host owns workspace discovery and dependency selection. Its root workspace can select the directories below, or narrow the patterns to the required SDK, Runtime Client and protocol directories. Nested workspace manifests do not discover members for the host. In the host's own package (for example `packages/my-feature`), declare the dependencies shown below and use package entrypoints.

```yaml
packages:
  - 'packages/*'
  - 'octo-runtime/packages/*'
  - 'octo-channel-gateway/packages/*'
overrides:
  '@mininglamp-oss/octo-runtime-client': 'workspace:*'
```

```json
{
  "dependencies": {
    "@mininglamp-oss/octo-channel-gateway-sdk": "workspace:*",
    "@mininglamp-oss/octo-runtime-protocol": "workspace:*"
  }
}
```

```js
import { ChannelGateway } from '@mininglamp-oss/octo-channel-gateway-sdk';
// TypeScript: import type { ModelInputPart } from '@mininglamp-oss/octo-runtime-protocol';
```

```sh
pnpm install
pnpm --filter "@mininglamp-oss/octo-runtime-client..." run build
pnpm --filter @mininglamp-oss/octo-channel-gateway-sdk run build
pnpm --filter my-feature run build
pnpm --filter my-feature run start
```

The Runtime source manifests use version `0.0.0`, which does not satisfy Gateway's published `^1.1.14` Client range. Merely enabling `linkWorkspacePackages` or `preferWorkspacePackages` is insufficient for that mismatch. The host's explicit root override forces the local Client; its `workspace:*` protocol dependency then selects the local protocol package. The host owns checking that the selected source revisions have compatible APIs. The override deliberately fails installation when the local Client is absent. Add `@mininglamp-oss/octo-runtime-client: workspace:*` to a host package that directly imports Client too. No publication, npm link, global installation, aliases or submodule-internal imports are needed.

Run the explicit local check from Gateway with `node scripts/verify-source-workspace.mjs /absolute/path/to/octo-runtime`. It copies the actual SDK, Client and protocol sources into a separate temporary host, proves local resolution despite the 0.0.0/range mismatch, builds in dependency order, typechecks and executes a host package import, then repeats frozen installation. It never changes either source checkout and is not added to CI.

## Root release assembly

Use the explicit build order above even with overrides: pnpm's recursive scheduler can still compare the original semver range against 0.0.0 and start the SDK before Client output exists. A source override selects the package but does not guarantee that scheduling edge.

Direct `npm pack` / `pnpm pack` is rejected to prevent an incomplete archive containing unresolved private workspace dependencies. Use `pack:release` for release assembly. Run `node scripts/verify-workspace-archive.mjs` explicitly after packing to verify declarations, production dependency closure, worker execution, CLI version and absence of source links.

After building, `pnpm run pack:release` stages the root facade/launcher plus real copies of the three private packages under bundled `node_modules`. Their manifests have release versions instead of `workspace:*`, and include compiled JavaScript, declarations and the logging worker. Third-party production dependencies remain registry dependencies in the root archive. Only the root package is published. The source lockfile and source versions remain unchanged.

`pnpm run test:package` installs that archive outside the checkout and checks the existing SDK facade and CLI command. `node --test scripts/verify-release-entrypoints.mjs` explicitly checks npm/pnpm packaging. The original build-info archive path remains available for release provenance and recovery of older releases. These changes preserve the existing workflow/check scope.
