// 显式本地专项：npm run build && node --test scripts/verify-process-lock.mjs
// 所有 Home/PID 均属于本测试；不访问用户服务，不加入默认 CI。
import test from "node:test";
import assert from "node:assert/strict";
import fs, { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { acquireProcessLock, inspectProcessLock } from "../dist/apps/cli/src/lock.js";
import { processStartIdentity } from "../dist/apps/cli/src/process-identity.js";

async function fixture(t) {
  const home = await mkdtemp(join(tmpdir(), "gw-start-lock-"));
  t.after(() => rm(home, { force: true, recursive: true }));
  return join(home, "service.lock");
}
async function childFixture(t) {
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
  await once(child, "spawn");
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const done = once(child, "exit"); child.kill(); await done;
    }
  });
  return child;
}

test("new lock records OS start marker and blocks the same live instance", async (t) => {
  const path = await fixture(t);
  const release = await acquireProcessLock(path);
  t.after(release);
  const record = JSON.parse(await readFile(path, "utf8"));
  assert.ok(record.startIdentity, "this platform must provide an OS start marker");
  assert.equal(record.startIdentity, await processStartIdentity(process.pid));
  assert.equal((await inspectProcessLock(path)).state, "live");
  await assert.rejects(acquireProcessLock(path), /SETUP_IN_PROGRESS/);
  await release();
  assert.equal((await inspectProcessLock(path)).state, "missing");
});

test("explicitly different start marker reclaims a reused PID without killing it", async (t) => {
  const path = await fixture(t), child = await childFixture(t);
  const startIdentity = await processStartIdentity(child.pid);
  assert.ok(startIdentity);
  await writeFile(path, JSON.stringify({ pid: child.pid, startIdentity: `${startIdentity}:earlier-instance` }));
  assert.equal((await inspectProcessLock(path)).state, "stale");
  const release = await acquireProcessLock(path);
  await release();
  assert.equal(child.exitCode, null);
  assert.equal(child.signalCode, null);
  assert.equal((await inspectProcessLock(path)).state, "missing");
});

test("equal markers conservatively block, including an indistinguishable same-second start", async (t) => {
  const path = await fixture(t), child = await childFixture(t);
  const record = JSON.stringify({ pid: child.pid, startIdentity: await processStartIdentity(child.pid) });
  await writeFile(path, record);
  assert.equal((await inspectProcessLock(path)).state, "live");
  await assert.rejects(acquireProcessLock(path), /SETUP_IN_PROGRESS/);
  assert.equal(await readFile(path, "utf8"), record);
});

test("legacy live owner is unknown and retained; legacy dead owner is reclaimed", async (t) => {
  const path = await fixture(t), child = await childFixture(t);
  const record = JSON.stringify({ pid: child.pid });
  await writeFile(path, record);
  assert.equal((await inspectProcessLock(path)).state, "unknown");
  await assert.rejects(acquireProcessLock(path), /SETUP_IN_PROGRESS/);
  assert.equal(await readFile(path, "utf8"), record);
  const done = once(child, "exit"); child.kill(); await done;
  assert.equal((await inspectProcessLock(path)).state, "stale");
  const release = await acquireProcessLock(path); await release();
});

test("unavailable OS query is unknown and never deletes a live lock", async (t) => {
  const path = await fixture(t);
  const release = await acquireProcessLock(path);
  t.after(release);
  const record = await readFile(path, "utf8");
  const descriptor = Object.getOwnPropertyDescriptor(process, "platform");
  try {
    Object.defineProperty(process, "platform", { ...descriptor, value: "unsupported" });
    assert.equal((await inspectProcessLock(path)).state, "unknown");
    await assert.rejects(acquireProcessLock(path), /SETUP_IN_PROGRESS/);
    assert.equal(await readFile(path, "utf8"), record);
  } finally { Object.defineProperty(process, "platform", descriptor); }
});

test("reclaim rechecks the record after acquiring its guard and retains a new owner", async (t) => {
  const path = await fixture(t);
  await writeFile(path, JSON.stringify({ pid: process.pid, startIdentity: "earlier-instance" }));
  const replacement = JSON.stringify({ pid: process.pid, startIdentity: await processStartIdentity(process.pid), id: "replacement" });
  const originalLink = fs.link;
  let replaced = false;
  try {
    fs.link = async (source, destination) => {
      await originalLink(source, destination);
      if (basename(destination).startsWith(".reclaim-")) {
        await writeFile(path, replacement);
        replaced = true;
      }
    };
    syncBuiltinESMExports();
    await assert.rejects(acquireProcessLock(path), /SETUP_IN_PROGRESS/);
  } finally { fs.link = originalLink; syncBuiltinESMExports(); }
  assert.equal(replaced, true);
  assert.equal(await readFile(path, "utf8"), replacement);
  assert.equal((await inspectProcessLock(path)).state, "live");
});
