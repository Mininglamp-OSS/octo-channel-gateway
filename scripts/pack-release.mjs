import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { releaseVersion } from "./validate-release.mjs";
import { npmPackResult } from "./npm-pack-result.mjs";

const root = resolve(import.meta.dirname, "..");
const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
assert.equal(manifest.version, "0.0.0");
if (process.env.RELEASE_VERSION)
  manifest.version = releaseVersion(`v${process.env.RELEASE_VERSION}`);
const output = join(root, ".tmp", "release");
const staging = join(output, "package");
await rm(output, { recursive: true, force: true });
await mkdir(staging, { recursive: true });
try {
  for (const entry of ["dist", "README.md", "LICENSE"])
    await cp(join(root, entry), join(staging, entry), { recursive: true });
  // 仅在发布暂存目录注入版本，不改源码 manifest 或锁文件。
  await writeFile(
    join(staging, "package.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  const result = npmPackResult(
    execFileSync(
      process.execPath,
      [
        process.env.npm_execpath,
        "pack",
        "--json",
        "--ignore-scripts",
        "--pack-destination",
        output,
      ],
      { cwd: staging, encoding: "utf8" },
    ),
    manifest.name,
  );
  const files = new Set(result.files.map((file) => file.path));
  for (const required of [
    manifest.exports["."].import,
    manifest.types,
    ...Object.values(manifest.bin),
    "README.md",
    "LICENSE",
  ])
    assert.ok(
      files.has(required.replace(/^\.\//, "")),
      `Missing packed entry: ${required}`,
    );
  assert.equal(result.name, manifest.name);
  assert.equal(result.version, manifest.version);
  assert.ok(
    [...files].every(
      (file) =>
        file.startsWith("dist/") ||
        ["package.json", "README.md", "LICENSE"].includes(file),
    ),
  );
  console.log(join(output, result.filename));
} finally {
  await rm(staging, { recursive: true, force: true });
}
