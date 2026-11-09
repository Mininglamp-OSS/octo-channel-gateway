import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const output = resolve(import.meta.dirname, "../.tmp/release");
const archives = (await readdir(output)).filter((name) =>
  name.endsWith(".tgz"),
);
assert.equal(archives.length, 1, "Expected one verified archive");
const consumer = await mkdtemp(join(tmpdir(), "gateway-consumer-"));
try {
  await writeFile(
    join(consumer, "package.json"),
    '{"private":true,"type":"module"}',
  );
  execFileSync(
    process.execPath,
    [
      process.env.npm_execpath,
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--registry=https://registry.npmjs.org",
      join(output, archives[0]),
    ],
    { cwd: consumer, stdio: "inherit" },
  );
  await writeFile(
    join(consumer, "smoke.mjs"),
    'import assert from "node:assert/strict"; import { ChannelRegistry } from "@mininglamp-oss/octo-channel-gateway"; assert.equal(typeof ChannelRegistry.register, "function");',
  );
  execFileSync(process.execPath, ["smoke.mjs"], {
    cwd: consumer,
    stdio: "inherit",
  });
  const help = execFileSync(
    process.execPath,
    [
      "node_modules/@mininglamp-oss/octo-channel-gateway/dist/apps/cli/src/index.js",
      "--help",
    ],
    { cwd: consumer, encoding: "utf8" },
  );
  assert.match(help, /doctor/);
  assert.match(help, /install/);
  console.log("Packed public SDK and CLI passed isolated installation.");
} finally {
  await rm(consumer, { recursive: true, force: true });
}
