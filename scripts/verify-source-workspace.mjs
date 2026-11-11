// 显式本地验证，不加入默认测试或 CI。参数为待组合的 Runtime 源码 checkout。
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";

const runtime = resolve(process.argv[2] ?? "../octo-runtime");
const gateway = resolve(import.meta.dirname, "..");
const host = await mkdtemp(join(tmpdir(), "gateway-source-host-"));
const json = async (path, value) => writeFile(path, JSON.stringify(value, null, 2) + "\n");
const sourceOnly = path => !["node_modules", "dist", ".git"].includes(path.split(sep).at(-1));
const pnpm = (...args) => execFileSync("pnpm", args, { cwd: host, stdio: "inherit", timeout: 120_000 });
try {
  await mkdir(join(host, "packages/feature"), { recursive: true });
  for (const name of ["octo-runtime-client", "octo-runtime-protocol"]) {
    await cp(join(runtime, "packages", name), join(host, "octo-runtime/packages", name), { recursive: true, filter: sourceOnly });
  }
  await cp(join(runtime, "tsconfig.base.json"), join(host, "octo-runtime/tsconfig.base.json"));
  await cp(join(gateway, "packages/octo-channel-gateway-sdk"), join(host, "octo-channel-gateway/packages/octo-channel-gateway-sdk"), { recursive: true, filter: sourceOnly });
  await cp(join(gateway, "tsconfig.json"), join(host, "octo-channel-gateway/tsconfig.json"));
  await json(join(host, "package.json"), {
    private: true, type: "module", packageManager: "pnpm@11.25.0",
    devDependencies: { typescript: "^7.0.2", "@types/node": "^24.0.0" },
  });
  const members = "packages:\n  - 'packages/*'\n  - 'octo-runtime/packages/*'\n  - 'octo-channel-gateway/packages/*'\n";
  await writeFile(join(host, "pnpm-workspace.yaml"), members +
    "overrides:\n  '@mininglamp-oss/octo-runtime-client': 'workspace:*'\n");
  await json(join(host, "packages/feature/package.json"), {
    name: "source-host-feature", private: true, type: "module",
    dependencies: {
      "@mininglamp-oss/octo-channel-gateway-sdk": "workspace:*",
      "@mininglamp-oss/octo-runtime-protocol": "workspace:*",
    }, scripts: { build: "tsc -p tsconfig.json" },
  });
  await json(join(host, "packages/feature/tsconfig.json"), {
    compilerOptions: { module: "NodeNext", target: "ES2022", strict: true, types: ["node"], skipLibCheck: false, outDir: "dist" },
    include: ["index.mts"],
  });
  await writeFile(join(host, "packages/feature/index.mts"), `
import assert from "node:assert/strict";
import { assertModelInputParts, type ModelInputPart } from "@mininglamp-oss/octo-runtime-protocol";
const inputs: ModelInputPart[] = [{ type: "text", text: "local protocol" }];
assertModelInputParts(inputs);
const before = ["SIGINT", "SIGTERM", "exit"].map(name => process.listenerCount(name));
const { ChannelGateway } = await import("@mininglamp-oss/octo-channel-gateway-sdk");
assert.deepEqual(["SIGINT", "SIGTERM", "exit"].map(name => process.listenerCount(name)), before);
const gateway = new ChannelGateway({ kernel: {} as never });
await gateway.close();
`);
  pnpm("install");
  // 客户端源版本 0.0.0 不满足 SDK 的 ^1.1.14；显式 override 必须仍选中本地源码。
  const sdk = join(host, "octo-channel-gateway/packages/octo-channel-gateway-sdk");
  const localClient = join(host, "octo-runtime/packages/octo-runtime-client");
  const localProtocol = join(host, "octo-runtime/packages/octo-runtime-protocol");
  assert.equal(JSON.parse(await readFile(join(localClient, "package.json"))).version, "0.0.0");
  assert.equal(await realpath(join(sdk, "node_modules/@mininglamp-oss/octo-runtime-client")), await realpath(localClient));
  assert.equal(await realpath(join(localClient, "node_modules/@mininglamp-oss/octo-runtime-protocol")), await realpath(localProtocol));
  // pnpm 的递归排序仍看源码 manifest 的 semver；override 不保证增加排序边。
  pnpm("--filter", "@mininglamp-oss/octo-runtime-client...", "run", "build");
  pnpm("--filter", "@mininglamp-oss/octo-channel-gateway-sdk", "run", "build");
  pnpm("--filter", "source-host-feature", "run", "build");
  execFileSync(process.execPath, ["packages/feature/dist/index.mjs"], { cwd: host, stdio: "inherit", timeout: 10_000 });
  pnpm("install", "--frozen-lockfile");
  console.log("Source host: SDK entrypoint, local 0.0.0 Runtime Client/protocol override, ordered builds and frozen install passed.");
} finally {
  await rm(host, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
