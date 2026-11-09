import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function releaseVersion(tag) {
  if (
    !/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(tag) ||
    tag === "v0.0.0"
  )
    throw new Error("Release tag must be stable vX.Y.Z, excluding v0.0.0");
  return tag.slice(1);
}
export function validateRelease(tag, cwd = process.cwd()) {
  const version = releaseVersion(tag);
  const git = (...args) =>
    execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  // 重新取远端 tag 对象，避免 checkout 将 annotated tag 压成 commit。
  git(
    "fetch",
    "--force",
    "--no-tags",
    "origin",
    `refs/tags/${tag}:refs/tags/${tag}`,
  );
  if (git("cat-file", "-t", `refs/tags/${tag}`) !== "tag")
    throw new Error("Release tag must be annotated");
  const sha = git("rev-parse", "--verify", `refs/tags/${tag}^{commit}`);
  git("fetch", "--no-tags", "origin", "main");
  git("merge-base", "--is-ancestor", sha, "origin/main");
  if (JSON.parse(git("show", `${sha}:package.json`)).version !== "0.0.0")
    throw new Error("Source package version must remain 0.0.0");
  return { sha, version };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const { sha, version } = validateRelease(process.env.RELEASE_TAG ?? "");
  appendFileSync(process.env.GITHUB_OUTPUT, `sha=${sha}\nversion=${version}\n`);
}
