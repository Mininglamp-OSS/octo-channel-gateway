import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
let commit = null,
  dirty = null;
try {
  const git = (args) =>
    execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  commit = git(["rev-parse", "--verify", "HEAD"]);
  dirty = git(["status", "--porcelain=v1", "--untracked-files=normal"]) !== "";
} catch {
  // 源码归档可能没有 Git；不伪造来源信息。
}
const directory = new URL("dist/apps/cli/src/", root);
await mkdir(directory, { recursive: true });
await writeFile(
  new URL("build-info.json", directory),
  JSON.stringify(
    { commit, dirty, buildTime: new Date().toISOString() },
    null,
    2,
  ) + "\n",
);
