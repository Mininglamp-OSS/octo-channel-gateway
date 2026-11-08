import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

// 所有安装和配置写入独占目录；只检查 CLI，不安装用户系统服务。
const execute = promisify(execFile);
const [gateway, runtime, client] = process.argv.slice(2);
assert.ok(
  gateway && runtime && client,
  "Usage: node scripts/verify-package.mjs GATEWAY.tgz RUNTIME.tgz CLIENT.tgz",
);
const directory = await mkdtemp(
  join(process.platform === "darwin" ? "/tmp" : tmpdir(), "ocg-package-"),
);
const npm = join(
  dirname(process.execPath),
  process.platform === "win32"
    ? "node_modules/npm/bin/npm-cli.js"
    : "../lib/node_modules/npm/bin/npm-cli.js",
);
try {
  await execute(
    process.execPath,
    [
      npm,
      "install",
      "--prefix",
      directory,
      "--ignore-scripts",
      "--engine-strict",
      "--no-audit",
      "--no-fund",
      resolve(gateway),
      resolve(runtime),
      resolve(client),
    ],
    { timeout: 60_000 },
  );
  const packageRoot = join(
    directory,
    "node_modules/@mininglamp-oss/octo-channel-gateway",
  );
  const metadata = JSON.parse(
    await readFile(join(packageRoot, "package.json"), "utf8"),
  );
  assert.equal(
    metadata.dependencies["@mininglamp-oss/octo-runtime"],
    undefined,
  );
  assert.ok(metadata.dependencies["@mininglamp-oss/octo-runtime-client"]);
  const cli = join(packageRoot, metadata.bin["octo-channel-gateway"]);
  await access(
    join(
      directory,
      "node_modules/.bin",
      `octo-channel-gateway${process.platform === "win32" ? ".cmd" : ""}`,
    ),
  );
  const run = async (args, input) => {
    const pending = execute(
      process.execPath,
      [cli, ...args, "--home", join(directory, "gateway")],
      { timeout: 10_000 },
    );
    pending.child.stdin.end(input);
    return (await pending).stdout;
  };
  const help = await run(["--help"]);
  for (const command of [
    "doctor",
    "install",
    "uninstall",
    "start",
    "stop",
    "restart",
    "status",
    "logs",
    "configure",
  ])
    assert.ok(help.includes(command));
  await run(["extraset"], JSON.stringify({ bots: [], enabled: false }));
  assert.deepEqual(JSON.parse(await run(["extraget"])), {
    bots: [],
    enabled: false,
  });
  await run(["logs"]);
  await writeFile(
    join(directory, "types.mts"),
    `
    import { ChannelRegistry, type ChannelDefinition, type ChannelRegistration } from "@mininglamp-oss/octo-channel-gateway";
    const definition: ChannelDefinition = {
      bot: { bot_id: "types", enabled: false, api_url: "https://example.test/api", adapter: { adapter_type: "test" } },
      loadContexts(_bot, { signal }) { signal.throwIfAborted(); return []; }
    };
    const registration: Promise<ChannelRegistration> = ChannelRegistry.register("endpoint", definition);
    void registration;
  `,
  );
  const root = fileURLToPath(new URL("..", import.meta.url));
  await execute(
    process.execPath,
    [
      join(root, "node_modules/typescript/bin/tsc"),
      "types.mts",
      "--noEmit",
      "--strict",
      "--module",
      "NodeNext",
      "--target",
      "ES2022",
      "--skipLibCheck",
      "false",
      "--types",
      "node",
      "--typeRoots",
      join(root, "node_modules/@types"),
    ],
    { cwd: directory, timeout: 20_000 },
  );
  const consumer = `
    import assert from "node:assert/strict";
    import { mkdir } from "node:fs/promises";
    import { resolve } from "node:path";
    import { ChannelRegistry } from "@mininglamp-oss/octo-channel-gateway";
    import { createKernelService, componentEndpoint } from "@mininglamp-oss/octo-runtime/host";
    import { attachKernel } from "@mininglamp-oss/octo-runtime-client";
    const home = resolve("kernel"); await mkdir(home);
    const endpoint = componentEndpoint(home);
    const kernel = createKernelService({ home, endpoint, adapters: [{
      metadata: { type: "package-fixture", agentSources: ["provisioned"], protocolSupport: { protocol: "package.fixture", modes: ["canonical"], nativeMethods: [] } },
      probe: () => ({ available: true, command: process.execPath }),
      async *invoke() { yield { protocolVersion: 2, type: "run.completed", payload: {} }; }
    }] });
    let client, registration;
    try {
      await kernel.initialize(); client = attachKernel({ endpoint });
      const events = await Array.fromAsync(client.invoke({ protocol_mode: "canonical", parts: [{ type: "text", text: "package contract" }] }, undefined, undefined, { schema: "octo.context-envelope/v3", items: [
        { namespace: "octo.execution", name: "adapter", payload: { type: "package-fixture" } },
        { namespace: "octo.security", name: "approval_policy", payload: { mode: "full_access" } }
      ] }));
      assert.equal(events.at(-1).type, "run.completed");
      registration = await ChannelRegistry.register(endpoint, { bot: { bot_id: "package-fixture", enabled: false, api_url: "https://example.test/api", adapter: { adapter_type: "package-fixture", workdir: home } } });
      const closing = registration.close(); assert.equal(closing, registration.close()); await closing;
      assert.equal((await client.status()).execution_ready, true);
    } finally { await registration?.close(); client?.close(); assert.equal((await kernel.close()).complete, true); }
  `;
  await writeFile(join(directory, "consumer.mjs"), consumer);
  await execute(process.execPath, ["consumer.mjs"], {
    cwd: directory,
    timeout: 15_000,
  });
  console.log(
    JSON.stringify({
      npmInstall: true,
      cliBin: true,
      cliConfigAndLogs: true,
      publicSdk: true,
      clientInterop: true,
      kernelPreserved: true,
    }),
  );
} finally {
  await rm(directory, {
    recursive: true,
    force: true,
    maxRetries: 3,
    retryDelay: 100,
  });
}
