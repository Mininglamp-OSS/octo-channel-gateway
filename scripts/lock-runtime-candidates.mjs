import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { resolve } from "node:path";

// 尚未发布的候选版本：用真实发行包元数据生成锁，不手改 integrity。
// 只为锁解析提供本地元数据；最终锁里的下载地址仍是正式 npm registry。
const files = process.argv.slice(2);
assert.equal(files.length, 2, "Usage: node scripts/lock-runtime-candidates.mjs RUNTIME.tgz CLIENT.tgz");
const metadata = new Map();
const expected = new Set(["@mininglamp-oss/octo-runtime", "@mininglamp-oss/octo-runtime-client"]);
for (const file of files) {
  const manifest = JSON.parse(execFileSync("tar", ["-xOf", resolve(file), "package/package.json"], { encoding: "utf8" }));
  assert.ok(expected.delete(manifest.name), "Expected one Runtime and one Client release archive");
  assert.match(manifest.version, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/, "Expected a stable release version");
  assert.notEqual(manifest.version, "0.0.0");
  for (const value of metadata.values()) assert.equal(manifest.version, value["dist-tags"].latest, "Runtime and Client must have matching versions");
  const base = manifest.name.split("/").at(-1);
  manifest.dist = {
    integrity: `sha512-${createHash("sha512").update(readFileSync(file)).digest("base64")}`,
    tarball: `https://registry.npmjs.org/${manifest.name}/-/${base}-${manifest.version}.tgz`,
  };
  metadata.set(manifest.name, { name: manifest.name, "dist-tags": { latest: manifest.version }, versions: { [manifest.version]: manifest } });
}
const server = createServer((request, response) => {
  let name;
  try { name = decodeURIComponent(request.url.slice(1)); } catch { response.writeHead(400).end(); return; }
  const value = metadata.get(name);
  response.writeHead(value ? 200 : 404, { "content-type": "application/json" });
  response.end(JSON.stringify(value ?? { error: "Unknown candidate" }));
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
try {
  const code = await new Promise((done, reject) => {
    const child = spawn("pnpm", ["update", "@mininglamp-oss/octo-runtime", "@mininglamp-oss/octo-runtime-client", "--lockfile-only", "--ignore-scripts", "--config.manage-package-manager-versions=false", `--config.@mininglamp-oss:registry=http://127.0.0.1:${server.address().port}`], { stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", done);
  });
  assert.equal(code, 0, "pnpm candidate resolution failed");
  const lock = readFileSync("pnpm-lock.yaml", "utf8");
  for (const value of metadata.values()) {
    const { dist } = value.versions[value["dist-tags"].latest];
    assert.ok(lock.includes(dist.integrity), `Candidate integrity missing from lock: ${value.name}`);
    assert.ok(lock.includes(dist.tarball), `Candidate registry URL missing from lock: ${value.name}`);
  }
  assert.ok(!/\bfile:|127\.0\.0\.1/.test(lock), "Lock must not depend on a local candidate path");
} finally {
  server.close();
}
