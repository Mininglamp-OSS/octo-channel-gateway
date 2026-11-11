// 手动复现现有 CI 命令；不加入 CI、默认测试或 Gate 依赖。
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { resolveNpmCli } from "./npm-cli.mjs";

const root = resolve(import.meta.dirname, "..");
const output = join(root, ".tmp", "local-ci-" + process.versions.node);
await mkdir(output, { recursive: true });
const tracked = ["package.json", "pnpm-lock.yaml"];
const before = await Promise.all(tracked.map(path => readFile(join(root, path), "utf8")));
const npm = resolveNpmCli();
const steps = [
  ["install", "pnpm", ["install", "--frozen-lockfile"]],
  ...["typecheck", "build", "docs:check", "test:ci"].map(name => [name.replace(":", "-"), process.execPath, [npm, "run", name]]),
  ["release-contract", process.execPath, ["--test", "test/release-ci.test.mjs"]],
  ["pack", process.execPath, [npm, "run", "pack:release"]],
  ["consume", process.execPath, [npm, "run", "test:package"]],
  ["spec", process.env.SPEC_PYTHON ?? "python3", [".octospec/scripts/lint.py"]],
];
for (const [name, command, args] of steps) {
  console.log("RUN", name, "Node", process.versions.node);
  try {
    const text = execFileSync(command, args, { cwd: root, encoding: "utf8", timeout: 180_000, maxBuffer: 16 * 1024 * 1024 });
    await writeFile(join(output, name + ".log"), text);
    console.log("PASS", name);
  } catch (error) {
    await writeFile(join(output, name + ".log"), (error.stdout ?? "") + (error.stderr ?? ""));
    throw error;
  }
}
for (const [index, path] of tracked.entries()) assert.equal(await readFile(join(root, path), "utf8"), before[index], path + " drifted");
assert.equal(execFileSync("git", ["diff", "origin/main", "--", ".github/workflows"], { cwd: root, encoding: "utf8" }), "");
console.log("PASS manifest/lockfile unchanged and no workflow diff against origin/main");
console.log("Local existing CI commands passed:", output);
