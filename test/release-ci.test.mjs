import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  releaseVersion,
  validateRelease,
} from "../scripts/validate-release.mjs";

test("release tags reject placeholder, prerelease and option-like input", () => {
  assert.equal(releaseVersion("v1.1.12"), "1.1.12");
  for (const tag of [
    "v0.0.0",
    "v01.1.12",
    "1.1.12",
    "v1.1.12-rc.1",
    "--upload-pack=bad",
    "v1.1.12\n",
  ])
    assert.throws(() => releaseVersion(tag));
});
test("release source requires an annotated tag on main with placeholder manifest", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "gateway-release-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  git("init", "-b", "main");
  git("config", "user.name", "Release Test");
  git("config", "user.email", "release-test@example.invalid");
  await writeFile(join(root, "package.json"), '{"version":"0.0.0"}');
  git("add", "package.json");
  git("commit", "-m", "fixture");
  git("remote", "add", "origin", root);
  git("tag", "-a", "v1.1.12", "-m", "fixture");
  assert.deepEqual(validateRelease("v1.1.12", root), {
    sha: git("rev-parse", "HEAD"),
    version: "1.1.12",
  });
  git("tag", "v1.1.13");
  assert.throws(() => validateRelease("v1.1.13", root), /annotated/);
  git("switch", "-c", "unmerged");
  await writeFile(
    join(root, "package.json"),
    '{"version":"0.0.0","private":true}',
  );
  git("commit", "-am", "unmerged");
  git("tag", "-a", "v1.1.14", "-m", "fixture");
  assert.throws(() => validateRelease("v1.1.14", root));
  git("switch", "main");
  await writeFile(join(root, "package.json"), '{"version":"1.1.15"}');
  git("commit", "-am", "not-placeholder");
  git("tag", "-a", "v1.1.15", "-m", "fixture");
  assert.throws(() => validateRelease("v1.1.15", root), /0.0.0/);
});
