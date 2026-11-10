# CI and npm publishing

[简体中文](../../zh-CN/guides/ci-release.md) | [Documentation](../README.md)

Pull requests and main pushes run frozen pnpm installation, types, build, bilingual documentation, Octospec, and packaging. Linux Node 24/26 and macOS Node 24 run the full regression and focused boundary suites. Windows Node 24 builds and checks documentation and isolated SDK/CLI installation; this does not verify native service operations. CI Gate fails when any required job fails or is skipped. Dependency Review blocks newly introduced high/critical vulnerabilities; Dependabot proposes npm and Actions updates weekly.

The source version stays 0.0.0. A stable annotated vX.Y.Z tag reachable from main supplies the release version for a staging manifest. npm Publish reuses CI at the resolved commit and publishes the same verified archive with provenance. CI installs only public registry dependencies; unavailable dependencies fail the gate. Runtime/client dependencies use ^1.1.13 with official registry hashes; IPC version does not determine npm major version.

Before the first release, configure a narrowly scoped NPM_TOKEN repository secret with publish permission for this package and the required npm 2FA bypass capability. The token is available only to the publish step; PR tests never receive it. Manual npm Publish defaults to dry-run: select main, supply an existing annotated tag, and keep dry_run enabled. For a real publication, disable dry_run explicitly or push the release tag. This task creates no release tag and publishes no package. A version already published is immutable: investigate npm errors instead of overwriting it.

After the first successful GitHub run, maintainers should add CI Gate and Dependency Review to required checks while retaining code-review and the non-author approval requirement. Workflow files alone do not change branch protection. Runtime/client 1.1.13 is published. Fresh registry installation must still pass; earlier local candidate validation is separate evidence.

Local commands:

```sh
pnpm install --frozen-lockfile
npm run typecheck
npm run build
npm run docs:check
npm run test:ci
npm run pack:release
npm run test:package
```

The existing three-archive candidate verifier remains available under scripts/verify-package.mjs. CI uses scripts/verify-distribution.mjs for a fresh consumer that installs the archive from disk and its dependencies from npm, imports ChannelRegistry, and executes CLI help without starting services.
