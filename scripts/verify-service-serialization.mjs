// Explicit local verification: npm run build && node --test scripts/verify-service-serialization.mjs
// Fake manager only: never run systemctl, launchctl or Task Scheduler.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, lstat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { SystemdUserBackend } from "../dist/packages/cross-service/src/systemd.js";
import { withConfigLock } from "../dist/apps/cli/src/config.js";

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "gateway-service-serialization-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test("direct backend callers need a guard across install/uninstall", { timeout: 10_000 }, async (t) => {
  const root = await fixture(t);
  const unit = "serialization-fixture.service";
  const definition = join(root, ".config", "systemd", "user", unit);
  let enabled = false;
  let holdDisable = false;
  const entered = Promise.withResolvers();
  const release = Promise.withResolvers();
  const runner = { async run(command, args) {
    assert.equal(command, "systemctl");
    assert.equal(args[0], "--user");
    const operation = args[1];
    if (operation === "show") return {
      command, args, exitCode: 0, stderr: "",
      stdout: `LoadState=loaded\nActiveState=inactive\nSubState=dead\nMainPID=0\nUnitFileState=${enabled ? "enabled" : "disabled"}\nExecMainStatus=0`,
    };
    if (operation === "enable") enabled = true;
    if (operation === "disable") {
      enabled = false;
      if (holdDisable) { entered.resolve(); await release.promise; }
    }
    return { command, args, exitCode: 0, stdout: "", stderr: "" };
  } };
  const options = { platform: "linux", homeDirectory: root, environment: {}, runner };
  const first = new SystemdUserBackend(options);
  const second = new SystemdUserBackend(options);
  const spec = { id: "serialization-fixture", command: process.execPath,
    workingDirectory: root, enabled: true, names: { systemdUnit: unit } };
  await first.install(spec);
  holdDisable = true;
  const uninstall = first.uninstall(spec);
  // Consume a possible early rejection while waiting for the deterministic barrier.
  void uninstall.catch((error) => entered.reject(error));
  try {
    await entered.promise;
    await second.install({ ...spec, args: ["--version"] });
  } finally {
    release.resolve();
    await uninstall;
  }
  assert.equal(enabled, true, "the competing install enabled the native registration");
  await assert.rejects(lstat(definition), { code: "ENOENT" });
});

test("CLI config guard rejects another process before mutation and releases afterward", { timeout: 10_000 }, async (t) => {
  const home = await fixture(t);
  const configModule = new URL("../dist/apps/cli/src/config.js", import.meta.url).href;
  const childSource = `
    import { withConfigLock } from ${JSON.stringify(configModule)};
    try {
      await withConfigLock(${JSON.stringify(home)}, async () => console.log("MUTATION_ENTERED"));
    } catch (error) {
      if (error.message !== "SETUP_IN_PROGRESS") throw error;
      console.log(error.message);
    }
  `;
  const invokeChild = () => promisify(execFile)(process.execPath,
    ["--input-type=module", "-e", childSource], { timeout: 5_000 });
  await withConfigLock(home, async () => {
    const result = await invokeChild();
    assert.equal(result.stdout.trim(), "SETUP_IN_PROGRESS");
    assert.equal(result.stderr, "");
  });
  const result = await invokeChild();
  assert.equal(result.stdout.trim(), "MUTATION_ENTERED");
  assert.equal(result.stderr, "");
});
