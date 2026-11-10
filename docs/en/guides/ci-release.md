# CI and npm publishing

[简体中文](../../zh-CN/guides/ci-release.md) | [Documentation](../README.md)

Pull requests and main pushes run frozen pnpm installation, types, build, bilingual documentation, Octospec, and packaging. Linux Node 24/26 and macOS Node 24 run the full regression and focused boundary suites. Windows Node 24 builds and checks documentation and isolated SDK/CLI installation; this does not verify native service operations. CI Gate fails when any required job fails or is skipped. Dependency Review blocks newly introduced high/critical vulnerabilities; Dependabot proposes npm and Actions updates weekly.

The source version stays 0.0.0. A stable annotated vX.Y.Z tag reachable from main supplies the release version for a staging manifest. npm Publish reuses CI at the resolved commit and publishes the same verified archive with provenance. CI installs only public registry dependencies; unavailable dependencies fail the gate. Runtime/client dependencies use ^1.1.13 with official registry hashes; IPC version does not determine npm major version.

Before the first release, configure a narrowly scoped NPM_TOKEN repository secret with publish permission for this package and the required npm 2FA bypass capability. The token is available only to the publish step; PR tests never receive it. Manual npm Publish defaults to dry-run: select main, supply an existing annotated tag, and keep dry_run enabled. For a real publication, disable dry_run explicitly or push the release tag. The existing publish job has contents: write for GitHub Releases; the other jobs and CI matrix retain their scope.

Publication finishes only after these checks, in order:

1. Check the archive's package name, tag-derived version, clean source commit and SHA-512. Check the exact npm version: a matching archive can resume; different bytes fail rather than overwrite an immutable version. Registry authentication or preflight network errors stop publication.
2. Publish the verified archive with provenance under `release-X.Y.Z`. Poll the official registry for up to 20 minutes, normally every 15 seconds, until the exact version and integrity match. A 404 is pending; temporary network/5xx/429 errors are retried within the deadline; authentication and integrity conflicts fail. An uncertain upload response is followed by verification, never another blind upload. Timeout fails the job.
3. Create or repair the matching GitHub Release, generate English change notes/PR and contributor references, and attach `mininglamp-oss-octo-channel-gateway-X.Y.Z.tgz`. Verify the downloaded asset bytes against npm. A first release includes a full source-history link. Existing notes are retained; missing notes/assets are repaired and conflicting assets fail. GitHub's automatic source zip/tar.gz files are additional assets, not replacements for the installable npm archive.
4. Verify a complete release before promoting npm and GitHub latest, then confirm both pointers. Recovering an older version preserves the higher complete version and repairs a lagging pointer. If a higher pointer names an incomplete release, repair that release first; the job fails rather than downgrading. Keep releases serialized through the existing workflow concurrency group; concurrent external pointer changes can require a recovery rerun.

To recover the already published **1.0.0**, manually run npm Publish on main with `tag=v1.0.0`, `recover_existing=true`, and initially `dry_run=true`. Recovery downloads the original npm tarball and verifies its integrity, package name/version, clean build metadata and tag commit. A fresh rebuild has a different build time, so it is not substituted for the original published bytes. After reviewing the dry run, repeat with `dry_run=false` to repair Release/assets/latest without retagging or republishing npm. The workflow still verifies the selected source through existing CI; its publishing tools come from the workflow revision so historical tags do not need the new scripts. Normal reruns with a different rebuilt archive must use explicit recovery rather than silently accepting a conflict.

Dry-run performs source/archive/registry validation without npm upload, Release mutations, latest changes, or waiting for an intentionally unpublished version. A successful dry-run is not a published release. Actual completion is the final verified success of the publish job, not tag creation or the npm command returning.

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

The existing three-archive candidate verifier remains available under scripts/verify-package.mjs. CI uses scripts/verify-distribution.mjs for a fresh consumer that installs the archive from disk and its dependencies from npm, imports ChannelGateway, and executes CLI help without starting services.

Run the CLI ownership and release fault-injection checks explicitly with `npm run build && node --test scripts/verify-cli-release.mjs`. They use isolated process/status fixtures and mocked publishing APIs; they do not mutate live services, npm or GitHub. This specialist suite is not added to the default test glob or CI Gate. Real Windows manager behavior and production npm/GitHub writes require environment-specific verification.
