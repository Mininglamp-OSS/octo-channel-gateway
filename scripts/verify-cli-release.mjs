// 显式本地专项：npm run build && node --test scripts/verify-cli-release.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, readFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
import { inspectOwnership } from "../dist/apps/cli/src/ownership.js";
import { acquireProcessLock, inspectProcessLock } from "../dist/apps/cli/src/lock.js";
import { processStartIdentity } from "../dist/apps/cli/src/process-identity.js";
import { serveStatus, readStatus } from "../dist/apps/cli/src/control.js";
import { runCli } from "../dist/apps/cli/src/main.js";
import { publishRelease, waitForRegistry } from "./release-state.mjs";
import { integrityOf, inspectArchive, createReleaseClient, packageName } from "./publish-release.mjs";
import { kernelFixture } from "../test/kernel-fixture.js";

const digest = integrityOf(Buffer.from("verified archive"));
const otherDigest = integrityOf(Buffer.from("different archive"));
const sha = "a".repeat(40);
const options = { version: "1.0.0", sha, archive: "/fixture/package.tgz", polling: { timeoutMs: 4, intervalMs: 1, now: () => 0 } };

async function homeFixture(t) {
  const home = await mkdtemp(join(tmpdir(), "gw-own-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  return home;
}
async function childFixture(t) {
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
  await once(child, "spawn");
  t.after(async () => { if (child.exitCode === null && child.signalCode === null) { const done = once(child, "exit"); child.kill(); await done; } });
  return child;
}
const manager = (pid, state = "running") => ({ manager: "launchd-user", state, enabled: true, drift: [], ...(pid ? { pid } : {}) });
async function liveOwner(t, home, pid = process.pid) {
  await writeFile(join(home, "service.lock"), JSON.stringify({ pid, startIdentity: await processStartIdentity(pid) }));
  const close = await serveStatus(home, () => ({ pid, phase: "ready", bots: [] }));
  t.after(close);
}
async function invoke(home, backend, action, extra = []) {
  const lines = [];
  const code = await runCli([action, "--home", home, "--json", ...extra], {
    backend, output: (line) => lines.push(line), errorOutput: (line) => lines.push(line), readyTimeoutMs: 0,
  });
  return { code, value: JSON.parse(lines.at(-1)) };
}

test("CLI preflight blocks foreground owner before install/restart and preserves lock", async (t) => {
  const home = await homeFixture(t);
  await liveOwner(t, home);
  const lock = await readFile(join(home, "service.lock"), "utf8");
  let mutations = 0;
  const backend = { inspect: async () => manager(undefined, "stopped"), install: async () => mutations++, restart: async () => mutations++ };
  for (const action of ["install", "restart"]) {
    const result = await invoke(home, backend, action);
    assert.equal(result.code, 1);
    assert.equal(result.value.error.code, "GATEWAY_HOME_OCCUPIED");
    assert.match(result.value.error.message, new RegExp(String(process.pid)));
    assert.ok(result.value.error.message.includes(home));
    assert.match(result.value.error.message, /Ctrl\+C/);
  }
  assert.equal(mutations, 0);
  assert.equal(await readFile(join(home, "service.lock"), "utf8"), lock);
});

test("start and duplicate run give occupied-Home diagnostics with a ready isolated Kernel", async (t) => {
  const home = await homeFixture(t), kernel = await kernelFixture(t, { useDefaultEndpoint: true });
  await liveOwner(t, home);
  const backend = { inspect: async () => manager(undefined, "stopped"), install: async () => assert.fail("installed over foreground") };
  for (const action of ["start", "run"]) {
    const result = await invoke(home, backend, action, ["--runtime-home", kernel.directory]);
    assert.equal(result.value.error.code, "GATEWAY_HOME_OCCUPIED");
    assert.ok(result.value.error.message.includes(String(process.pid)));
    assert.ok(result.value.error.message.includes(home));
  }
});

test("CLI correlates all three PIDs; missing manager PID is unknown, never ready", async (t) => {
  const home = await homeFixture(t);
  await liveOwner(t, home);
  assert.equal((await inspectOwnership(home, manager(process.pid))).ownership.ready, true);
  const unknown = await inspectOwnership(home, manager());
  assert.equal(unknown.ownership.state, "unknown");
  assert.equal(unknown.ownership.ready, false);
  const child = await childFixture(t);
  const mismatch = await inspectOwnership(home, manager(child.pid));
  assert.equal(mismatch.ownership.state, "unmanaged");
  const status = await invoke(home, { inspect: async () => manager(child.pid) }, "status");
  assert.equal(status.value.ownership.runtime_pid, process.pid);
  assert.equal(status.value.ownership.config_loaded, "not_verified");
});

test("restart cannot accept the old ready process as a replacement", async (t) => {
  const home = await homeFixture(t);
  await liveOwner(t, home);
  const result = await invoke(home, { inspect: async () => manager(process.pid), restart: async () => {} }, "restart");
  assert.equal(result.code, 4);
  assert.match(result.value.error.message, /replacement/);
});

test("readiness waits through PID handover and accepts only the replacement owner", async (t) => {
  const home = await homeFixture(t), child = await childFixture(t);
  let pid = process.pid, restarted = false, reads = 0;
  await writeFile(join(home, "service.lock"), JSON.stringify({ pid, startIdentity: await processStartIdentity(pid) }));
  t.after(await serveStatus(home, () => ({ pid, phase: "ready" })));
  const backend = {
    async inspect() { return manager(restarted && ++reads > 2 ? child.pid : process.pid); },
    async restart() { restarted = true; pid = child.pid; await writeFile(join(home, "service.lock"), JSON.stringify({ pid, startIdentity: await processStartIdentity(pid) })); },
    async stop() { assert.fail("transient PID handover stopped the service"); },
  };
  assert.equal(await runCli(["restart", "--home", home], { backend, output() {}, errorOutput: assert.fail, readyTimeoutMs: 2000 }), 0);
});

test("foreground wins a startup race: stop only the attempted managed service", async (t) => {
  const home = await homeFixture(t), child = await childFixture(t);
  let started = false, stopped = false;
  const backend = {
    inspect: async () => manager(started ? child.pid : undefined, started ? "running" : "stopped"),
    async restart() { started = true; await liveOwner(t, home); },
    async stop() { stopped = true; },
  };
  const result = await invoke(home, backend, "restart");
  assert.equal(result.value.error.code, "GATEWAY_HOME_OCCUPIED");
  assert.equal(stopped, true);
  assert.equal((await inspectProcessLock(join(home, "service.lock"))).pid, process.pid);
});

test("stop and uninstall report an unmanaged instance left running", async (t) => {
  const home = await homeFixture(t);
  await liveOwner(t, home);
  for (const action of ["stop", "uninstall"]) {
    const result = await invoke(home, { inspect: async () => manager(undefined, "stopped"), [action]: async () => {} }, action);
    assert.equal(result.code, 0);
    assert.equal(result.value.warning, "GATEWAY_INSTANCE_REMAINS");
    assert.equal(result.value.ownership.state, "unmanaged");
  }
});

test("native startup failure still diagnoses the race and attempts managed cleanup", async (t) => {
  for (const cleanupFails of [false, true]) {
    const home = await homeFixture(t), child = await childFixture(t);
    let started = false, stops = 0;
    const result = await invoke(home, {
      inspect: async () => manager(started ? child.pid : undefined, started ? "running" : "stopped"),
      async restart() { started = true; await liveOwner(t, home); throw new Error("SERVICE_COMMAND_FAILED"); },
      async stop() { stops++; if (cleanupFails) throw new Error("SERVICE_STOP_FAILED"); },
    }, "restart");
    assert.equal(stops, 1);
    assert.equal(result.value.error.code, "GATEWAY_HOME_OCCUPIED");
    assert.match(result.value.error.message, /SERVICE_COMMAND_FAILED/);
    if (cleanupFails) assert.match(result.value.error.message, /cleanup failed \(SERVICE_STOP_FAILED\)/);
    assert.equal((await inspectProcessLock(join(home, "service.lock"))).pid, process.pid);
  }
});

test("malformed status/lock cannot prove readiness; stale locks retain safe reclamation", async (t) => {
  const home = await homeFixture(t);
  await writeFile(join(home, "service.lock"), "broken");
  assert.equal((await inspectOwnership(home, manager(process.pid))).ownership.state, "unknown");
  t.after(await serveStatus(home, () => ({ pid: -1, phase: "ready" })));
  await assert.rejects(readStatus(home), /UNAVAILABLE/);
  const child = await childFixture(t);
  const exited = once(child, "exit"); child.kill(); await exited;
  await writeFile(join(home, "service.lock"), JSON.stringify({ pid: child.pid }));
  assert.equal((await inspectProcessLock(join(home, "service.lock"))).state, "stale");
  const release = await acquireProcessLock(join(home, "service.lock"));
  assert.equal((await inspectProcessLock(join(home, "service.lock"))).pid, process.pid);
  await release();
  assert.equal((await inspectProcessLock(join(home, "service.lock"))).state, "missing");
});

function releaseFixture(overrides = {}) {
  const writes = [], logs = [];
  let published = false, complete = false;
  const pointers = { npm: null, github: null };
  const client = {
    log: (line) => logs.push(line), sleep: async () => {},
    inspectArchive: async (path) => ({ path, integrity: digest }),
    verifyTag: async () => {},
    registry: async () => published ? { integrity: digest } : null,
    downloadPublished: async () => ({ path: "/original.tgz", integrity: digest }),
    async publish() { writes.push("publish"); published = true; },
    async ensureRelease() { writes.push("release"); complete = true; },
    async verifyComplete() { assert.equal(complete, true); },
    latest: async () => ({ ...pointers }),
    async promoteNpm(version) { writes.push("npm-latest"); pointers.npm = version; },
    async promoteGithub(version) { writes.push("gh-latest"); pointers.github = version; },
    ...overrides,
  };
  return { client, writes, logs, pointers };
}

test("publish completion requires npm then Release then both latest pointers", async () => {
  const f = releaseFixture();
  assert.deepEqual(await publishRelease(f.client, options), { version: "1.0.0", latest: "1.0.0" });
  assert.deepEqual(f.writes, ["publish", "release", "npm-latest", "gh-latest"]);
  assert.match(f.logs.at(-1), /Finished/);
});

test("registry wait handles 404/transient failure/delayed visibility with a bounded deadline", async () => {
  let now = 0, reads = 0;
  const client = { log() {}, async registry() {
    reads++;
    if (reads === 2) throw Object.assign(new Error("network"), { retryable: true });
    return reads > 3 ? { integrity: digest } : null;
  } };
  await waitForRegistry(client, "1.0.0", digest, { timeoutMs: 5, intervalMs: 1, now: () => now, sleep: async (ms) => { now += ms; } });
  assert.equal(reads, 4);
  now = 0;
  await assert.rejects(waitForRegistry({ ...client, registry: async () => null }, "1.0.0", digest,
    { timeoutMs: 2, intervalMs: 1, now: () => now, sleep: async (ms) => { now += ms; } }), /timed out/);
});

test("existing matching version skips upload; conflicting version fails before any mutation", async () => {
  const f = releaseFixture({ registry: async () => ({ integrity: digest }) });
  await publishRelease(f.client, options);
  assert.ok(!f.writes.includes("publish"));
  const conflict = releaseFixture({ registry: async () => ({ integrity: otherDigest }) });
  await assert.rejects(publishRelease(conflict.client, options), /integrity conflict/);
  assert.deepEqual(conflict.writes, []);
});

test("authentication and preflight network failures never trigger upload or a wait", async () => {
  for (const error of [new Error("HTTP 401"), Object.assign(new Error("network"), { retryable: true })]) {
    const f = releaseFixture({ registry: async () => { throw error; } });
    await assert.rejects(publishRelease(f.client, options), error);
    assert.deepEqual(f.writes, []);
  }
  const f = releaseFixture({ publish: async () => { throw Object.assign(new Error("auth"), { fatal: true }); } });
  await assert.rejects(publishRelease(f.client, options), /auth/);
  assert.deepEqual(f.writes, []);
});

test("a moved release tag is rejected before npm upload", async () => {
  const f = releaseFixture({ verifyTag: async () => { throw new Error("tag changed"); } });
  await assert.rejects(publishRelease(f.client, options), /tag changed/);
  assert.deepEqual(f.writes, []);
});

test("lost upload ACK is recovered by confirmation without a second upload", async () => {
  let uploads = 0;
  const f = releaseFixture({
    registry: async () => uploads ? { integrity: digest } : null,
    publish: async () => { uploads++; throw new Error("lost ACK"); },
  });
  await publishRelease(f.client, options);
  assert.equal(uploads, 1);
  assert.match(f.logs.join("\n"), /without uploading again/);
});

test("dry run is side effect free for both unpublished and explicit recovery versions", async () => {
  for (const recoverExisting of [false, true]) {
    const f = releaseFixture(recoverExisting ? { registry: async () => ({ integrity: otherDigest }),
      downloadPublished: async () => ({ path: "/original.tgz", integrity: otherDigest }) } : {});
    await publishRelease(f.client, { ...options, dryRun: true, recoverExisting });
    assert.deepEqual(f.writes, []);
  }
});

test("explicit recovery uses original npm bytes, not the differing rebuilt artifact", async () => {
  const f = releaseFixture({ registry: async () => ({ integrity: otherDigest }),
    downloadPublished: async () => ({ path: "/original.tgz", integrity: otherDigest }),
    async ensureRelease(_version, _sha, artifact) { assert.equal(artifact.path, "/original.tgz"); f.writes.push("release"); },
    verifyComplete: async () => {},
  });
  await publishRelease(f.client, { ...options, recoverExisting: true });
  assert.ok(!f.writes.includes("publish"));
});

test("older recovery preserves a higher complete latest and reconciles a lagging pointer", async () => {
  const f = releaseFixture({ registry: async () => ({ integrity: digest }), verifyComplete: async (version) => assert.equal(version, "1.2.0") });
  f.pointers.npm = "1.2.0";
  f.pointers.github = "1.1.0";
  const result = await publishRelease(f.client, { ...options, recoverExisting: true });
  assert.equal(result.latest, "1.2.0");
  assert.deepEqual(f.writes, ["release", "gh-latest"]);
});

test("incomplete Release or conflicting asset never promotes latest", async () => {
  const f = releaseFixture({ ensureRelease: async () => { throw new Error("asset integrity conflict"); } });
  await assert.rejects(publishRelease(f.client, options), /integrity conflict/);
  assert.deepEqual(f.writes, ["publish"]);
  assert.ok(!f.logs.some((line) => line.startsWith("Finished")));
});

test("latest propagation is confirmed and an incomplete higher version never downgrades", async () => {
  const f = releaseFixture();
  const base = f.client.latest;
  let reads = 0;
  f.client.latest = async () => ++reads <= 3 ? { npm: null, github: null } : base();
  await publishRelease(f.client, options);
  assert.ok(reads > 3);
  const higher = releaseFixture({ registry: async () => ({ integrity: digest }),
    verifyComplete: async () => { throw new Error("higher release incomplete"); } });
  higher.pointers.npm = "2.0.0";
  await assert.rejects(publishRelease(higher.client, options), /incomplete/);
  assert.deepEqual(higher.writes, ["release"]);
  assert.equal(higher.pointers.npm, "2.0.0");
});

test("latest remembers the highest observed version across stale registry responses", async () => {
  const f = releaseFixture();
  const base = f.client.latest, versions = [];
  const views = [{ npm: "2.0.0", github: "2.0.0" }, { npm: "3.0.0", github: "2.0.0" }];
  f.client.latest = async () => views.length ? views.shift() : base();
  f.client.promoteNpm = async (version) => { versions.push(version); f.pointers.npm = version; };
  assert.equal((await publishRelease(f.client, options)).latest, "3.0.0");
  assert.deepEqual(versions, ["3.0.0"]);
});

test("actual archive inspection checks name/version/clean tag commit", async (t) => {
  const root = await homeFixture(t);
  await mkdir(join(root, "package/dist/apps/cli/src"), { recursive: true });
  await writeFile(join(root, "package/package.json"), JSON.stringify({ name: packageName, version: "1.0.0" }));
  await writeFile(join(root, "package/dist/apps/cli/src/build-info.json"), JSON.stringify({ commit: sha, dirty: false }));
  const path = join(root, "fixture.tgz");
  execFileSync("tar", ["-czf", path, "-C", root, "package"]);
  const artifact = await inspectArchive(path, "1.0.0", sha);
  assert.equal(artifact.integrity, integrityOf(await readFile(path)));
  await assert.rejects(inspectArchive(path, "1.0.1", sha), /does not match/);
  await assert.rejects(inspectArchive(path, "1.0.0", "b".repeat(40)), /does not match/);
});

test("GitHub adapter repairs missing assets, verifies bytes, generates first-release changelog and reruns idempotently", async (t) => {
  const root = await homeFixture(t), path = join(root, "package.tgz"), bytes = Buffer.from("verified archive");
  await writeFile(path, bytes);
  let release = null, asset = null, failUpload = true;
  const writes = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    const pathname = new URL(url).pathname;
    const method = init.method;
    if (method !== "GET") writes.push([method, pathname]);
    if (pathname.endsWith("/git/ref/tags/v1.0.0")) return Response.json({ object: { type: "tag", sha: "c".repeat(40) } });
    if (pathname.endsWith(`/git/tags/${"c".repeat(40)}`)) return Response.json({ object: { type: "commit", sha } });
    if (pathname.endsWith("/generate-notes")) return Response.json({ body: "## What's Changed\n* First release by @contributor" });
    if (pathname.endsWith("/releases") && method === "POST") { release = { id: 1, ...JSON.parse(init.body) }; return Response.json(release); }
    if (pathname.endsWith("/tags/v1.0.0")) return release && !release.draft ? Response.json(release) : new Response(null, { status: 404 });
    if (pathname.endsWith("/releases") && method === "GET") return Response.json(release ? [release] : []);
    if (pathname.endsWith("/releases/1/assets") && method === "POST") {
      if (failUpload) { failUpload = false; return new Response(null, { status: 500 }); }
      asset = { id: 2, state: "uploaded", name: "mininglamp-oss-octo-channel-gateway-1.0.0.tgz" }; return Response.json(asset);
    }
    if (pathname.endsWith("/releases/1/assets")) return Response.json(asset ? [asset] : []);
    if (pathname.endsWith("/releases/assets/2")) return new Response(bytes);
    if (pathname.endsWith("/releases/1") && method === "PATCH") { Object.assign(release, JSON.parse(init.body)); return Response.json(release); }
    assert.fail(`${method} ${url}`);
  });
  const client = createReleaseClient(root, { token: "fixture-only", log() {} });
  await assert.rejects(client.ensureRelease("1.0.0", sha, { path, integrity: digest }), /HTTP 500/);
  assert.equal(release.draft, true);
  await client.ensureRelease("1.0.0", sha, { path, integrity: digest });
  assert.equal(writes.filter(([method, path]) => method === "POST" && path.endsWith("/releases")).length, 1);
  assert.equal(release.draft, false);
  assert.match(release.body, /Full Changelog/);
  const count = writes.length;
  await client.ensureRelease("1.0.0", sha, { path, integrity: digest });
  assert.equal(writes.length, count);
  await assert.rejects(client.ensureRelease("1.0.0", sha, { path, integrity: otherDigest }), /integrity conflict/);
  assert.equal(writes.length, count);
});

test("registry HTTP adapter uses npm-compatible Accept, distinguishes missing/auth errors and checks metadata", async (t) => {
  const root = await homeFixture(t);
  let mode = "ok", reads = 0;
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    reads++;
    assert.equal(init.method, "GET");
    assert.equal(init.headers.Accept, "application/json");
    assert.equal(init.headers.Authorization, undefined);
    if (mode === "missing") return new Response(null, { status: 404 });
    if (mode === "auth") return new Response(null, { status: 403 });
    return Response.json({ name: packageName, version: mode === "wrong" ? "2.0.0" : "1.0.0",
      dist: { integrity: digest, tarball: `https://registry.npmjs.org/${packageName}/-/package.tgz` } });
  });
  const client = createReleaseClient(root, { token: "fixture-never-sent-to-npm", log() {} });
  assert.equal((await client.registry("1.0.0")).integrity, digest);
  mode = "missing";
  assert.equal(await client.registry("1.0.0"), null);
  mode = "auth";
  await assert.rejects(client.registry("1.0.0"), /HTTP 403/);
  assert.equal(reads, 3);
  mode = "wrong";
  await assert.rejects(client.registry("1.0.0"), /Invalid registry/);
});
