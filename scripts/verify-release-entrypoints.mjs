import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { resolveNpmCli } from "./npm-cli.mjs";
import { validateWorkflowRef } from "./validate-release.mjs";

const root = resolve(import.meta.dirname, "..");

test("npm selection rejects pnpm runners and supports Node/PATH install layouts", async (t) => {
  const fixture = await mkdtemp(join(tmpdir(), "gateway-npm-cli-"));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  const pnpmRoot = join(fixture, "pnpm");
  await mkdir(join(pnpmRoot, "bin"), { recursive: true });
  await writeFile(join(pnpmRoot, "package.json"), JSON.stringify({ name: "pnpm", bin: { npm: "bin/npm-cli.js" } }));
  const pnpm = join(pnpmRoot, "bin/npm-cli.js");
  await writeFile(pnpm, "");
  for (const layout of ["unix", "windows", "path"]) {
    const install = join(fixture, layout);
    const packageRoot = join(install, layout === "unix" ? "lib/node_modules/npm" : "node_modules/npm");
    const cli = join(packageRoot, "bin/npm-cli.js");
    await mkdir(join(packageRoot, "bin"), { recursive: true });
    await writeFile(cli, "");
    await writeFile(join(packageRoot, "package.json"), JSON.stringify({ name: "npm", bin: { npm: "bin/npm-cli.js" } }));
    const execPath = layout === "unix" ? join(install, "bin/node")
      : layout === "windows" ? join(install, "node.exe") : join(fixture, "isolated/node");
    const env = { npm_execpath: pnpm, Path: layout === "path" ? install : "" };
    assert.equal(resolveNpmCli({ execPath, env }), await realpath(cli));
    assert.equal(resolveNpmCli({ execPath: join(fixture, "isolated/node"), env: { npm_execpath: cli } }), await realpath(cli));
  }
  assert.throws(() => resolveNpmCli({ execPath: join(fixture, "isolated/node"), env: { npm_execpath: pnpm } }), /requires npm/);
});

test("manual release accepts main and explicitly fails other refs before fetching", () => {
  assert.doesNotThrow(() => validateWorkflowRef("workflow_dispatch", "refs/heads/main"));
  assert.doesNotThrow(() => validateWorkflowRef("push", "refs/tags/v1.2.3"));
  for (const ref of ["refs/tags/v1.2.3", "refs/heads/release", ""]) {
    const result = spawnSync(process.execPath, [join(root, "scripts/validate-release.mjs")], {
      cwd: tmpdir(), encoding: "utf8",
      env: { ...process.env, GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_REF: ref, RELEASE_TAG: "v1.2.3" },
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Manual npm Publish must run from main/);
    assert.doesNotMatch(result.stderr, /not a git repository/);
  }
});

test("npm and declared pnpm package entrypoints produce identical package contents", async (t) => {
  const fixture = await mkdtemp(join(tmpdir(), "gateway-pack-entrypoints-"));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  const sourceManifest = await readFile(join(root, "package.json"), "utf8");
  const manifest = JSON.parse(sourceManifest);
  const options = { cwd: root, encoding: "utf8", env: { ...process.env, RELEASE_VERSION: "1.2.3" } };
  const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const pnpmOptions = { ...options, shell: process.platform === "win32" };
  assert.equal(`pnpm@${execFileSync(pnpm, ["--version"], pnpmOptions).trim()}`, manifest.packageManager);
  const snapshots = [];
  for (const runner of ["npm", "pnpm"]) {
    if (runner === "npm") execFileSync(process.execPath, [resolveNpmCli(), "run", "pack:release"], options);
    else execFileSync(pnpm, ["run", "pack:release"], pnpmOptions);
    const output = join(root, ".tmp/release");
    const archives = (await readdir(output)).filter((file) => file.endsWith(".tgz"));
    assert.equal(archives.length, 1);
    const unpacked = join(fixture, runner);
    await mkdir(unpacked);
    execFileSync("tar", ["-xzf", join(output, archives[0]), "-C", unpacked]);
    const files = new Map();
    async function collect(directory, relative = "") {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const key = relative ? `${relative}/${entry.name}` : entry.name;
        const file = join(directory, entry.name);
        if (entry.isDirectory()) await collect(file, key);
        else files.set(key, await readFile(file));
      }
    }
    await collect(join(unpacked, "package"));
    const packed = JSON.parse(files.get("package.json"));
    assert.equal(packed.name, manifest.name);
    assert.equal(packed.version, "1.2.3");
    snapshots.push(files);
  }
  assert.deepEqual(snapshots[0], snapshots[1]);
  assert.equal(await readFile(join(root, "package.json"), "utf8"), sourceManifest);
});
