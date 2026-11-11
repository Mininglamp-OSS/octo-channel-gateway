// 显式包边界验证；保持默认测试与 CI 范围。
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { lstat, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { resolveNpmCli } from "./npm-cli.mjs";

const root = resolve(import.meta.dirname, "..");
const output = join(root, ".tmp/release");
const archives = (await readdir(output)).filter(name => name.endsWith(".tgz"));
assert.equal(archives.length, 1);
const host = await mkdtemp(join(tmpdir(), "gateway-archive-boundaries-"));
try {
  await writeFile(join(host, "package.json"), '{"private":true,"type":"module"}');
  execFileSync(process.execPath, [resolveNpmCli(), "install", "--ignore-scripts", "--no-audit", "--no-fund", join(output, archives[0])], { cwd: host, stdio: "inherit" });
  const distribution = join(host, "node_modules/@mininglamp-oss/octo-channel-gateway");
  const manifest = JSON.parse(await readFile(join(distribution, "package.json"), "utf8"));
  const sdkRoot = join(distribution, "node_modules/@mininglamp-oss/octo-channel-gateway-sdk");
  const sdk = JSON.parse(await readFile(join(sdkRoot, "package.json"), "utf8"));
  assert.deepEqual(Object.keys(sdk.dependencies).sort(), ["@mininglamp-oss/octo-runtime-client", "mdast-util-from-markdown", "ws"]);
  async function inspect(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if ((await lstat(path)).isSymbolicLink()) {
        assert.equal(entry.name, "octo-channel-gateway");
        assert.ok((await realpath(path)).startsWith(await realpath(distribution) + "/"), path);
        continue;
      }
      if (entry.isDirectory()) await inspect(path);
      else if (entry.name === "package.json") {
        const text = await readFile(path, "utf8");
        assert.doesNotMatch(text, /workspace:/);
      }
    }
  }
  await inspect(distribution);
  await writeFile(join(host, "types.mts"), `
import { ChannelGateway, type GatewayBot, type GatewayHook } from "@mininglamp-oss/octo-channel-gateway";
import { attachKernel } from "@mininglamp-oss/octo-runtime-client";
const bot: GatewayBot = { botId: "types", apiUrl: "https://example.invalid/api", enabled: false };
const hook: GatewayHook = { type: "pre_dispatch", hook: async (_ctx, inputs, agentEnv) => ({ inputs, agentEnv }) };
const gateway = new ChannelGateway({ kernel: attachKernel({ endpoint: "unused" }) });
void gateway.register(bot, { adapter_type: "test" }, [hook]);
`);
  execFileSync(process.execPath, [join(root, "node_modules/typescript/bin/tsc"), "types.mts", "--noEmit", "--strict", "--module", "NodeNext", "--target", "ES2022", "--types", "node", "--typeRoots", join(root, "node_modules/@types"), "--skipLibCheck", "false"], { cwd: host, stdio: "inherit" });
  await writeFile(join(distribution, "worker.mjs"), `
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
const before = ["SIGINT", "SIGTERM", "exit"].map(name => process.listenerCount(name));
const { ChannelGateway } = await import("@mininglamp-oss/octo-channel-gateway");
assert.deepEqual(["SIGINT", "SIGTERM", "exit"].map(name => process.listenerCount(name)), before);
assert.equal(typeof ChannelGateway, "function");
const { RuntimeLogging } = await import("@mininglamp-oss/octo-channel-gateway-sdk/host/runtime-log");
const logging = new RuntimeLogging({ directory: join(process.cwd(), "logs") });
logging.channel("archive")("info", "archive.worker");
await logging.close();
async function collect(directory) {
  let text = "";
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    text += entry.isDirectory() ? await collect(path) : await readFile(path, "utf8");
  }
  return text;
}
assert.match(await collect("logs"), /archive.worker/);
`);
  execFileSync(process.execPath, [join(distribution, "worker.mjs")], { cwd: host, stdio: "inherit", timeout: 10_000 });
  const version = execFileSync(process.execPath, [join(distribution, manifest.bin["octo-channel-gateway"]), "--version"], { cwd: host, encoding: "utf8" });
  assert.equal(version.split("\n")[0], manifest.version);
  execFileSync(process.execPath, [resolveNpmCli(), "ls", "--omit=dev", "--all"], { cwd: host, stdio: "pipe" });
  console.log("Archive: dependency closure, declarations, no source symlinks/workspace protocols, import handlers, worker asset and CLI version passed.");
} finally {
  await rm(host, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
