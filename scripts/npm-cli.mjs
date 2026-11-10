import { readFileSync, realpathSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";

/** 发布工具固定使用 npm 的参数和 JSON 合同，不能把 pnpm runner 当成 npm。 */
export function resolveNpmCli({ execPath = process.execPath, env = process.env } = {}) {
  const pathKey = Object.keys(env).find((key) => key.toUpperCase() === "PATH");
  const directories = [dirname(execPath), ...(env[pathKey] ?? "").split(delimiter)
    .filter(Boolean).map((entry) => entry.replace(/^"(.*)"$/, "$1"))];
  const candidates = [
    env.npm_execpath,
    ...directories.flatMap((directory) => [
      join(directory, "npm"), // Unix/npm/Homebrew 的可解析符号链接。
      join(directory, "node_modules/npm/bin/npm-cli.js"), // Windows Node/npm。
      join(directory, "../lib/node_modules/npm/bin/npm-cli.js"), // Unix Node/npm。
    ]),
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const cli = realpathSync(candidate);
      const root = dirname(dirname(cli));
      const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
      if (
        manifest.name === "npm" &&
        manifest.bin?.npm === "bin/npm-cli.js" &&
        realpathSync(join(root, manifest.bin.npm)) === cli
      ) return cli;
    } catch {
      // 缺失布局或其他包管理器不是候选 npm；继续检查 Node 安装及 PATH。
    }
  }
  throw new Error("Release tooling requires npm. Install npm alongside Node.js or make npm available on PATH.");
}
