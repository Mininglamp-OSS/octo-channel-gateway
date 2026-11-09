import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { runCli } from "../dist/apps/cli/src/main.js";
import { readConfig } from "../dist/apps/cli/src/config.js";
import { runtimeEndpoint } from "../dist/apps/cli/src/runtime-endpoint.js";
import { componentEndpoint } from "@mininglamp-oss/octo-runtime/host";

test("default Gateway configuration stays separate from Runtime and service reads saved Home", async (t) => {
  const userHome = await mkdtemp(join(tmpdir(), "ocg-home-"));
  t.after(() => rm(userHome, { recursive: true, force: true }));
  let spec;
  const backend = {
    async install(value) { spec = value; },
    async inspect() { return { state: "stopped", enabled: false, drift: [] }; },
  };
  const dependencies = { env: { HOME: userHome }, backend, output() {} };
  assert.equal(await runCli(["install"], dependencies), 0);
  const gatewayHome = join(userHome, ".octo-channel-gateway");
  assert.equal((await readConfig(gatewayHome)).runtime_home, join(userHome, ".octo-runtime"));
  assert.ok(spec.args.includes(gatewayHome));
  assert.ok(!spec.args.includes("--runtime-home"));
  await assert.rejects(access(join(userHome, ".octo-runtime")), { code: "ENOENT" });
  const other = join(userHome, "other-runtime");
  assert.equal(await runCli(["install", "--runtime-home", other], dependencies), 0);
  assert.equal((await readConfig(gatewayHome)).runtime_home, other);
});

test("Runtime address agrees with the published Runtime contract on supported platforms", () => {
  for (const [platform, home] of [["darwin", "/tmp/runtime"], ["linux", "/tmp/runtime"], ["win32", "C:\\Users\\Tester\\Runtime"], ["win32", "c:/Users/TESTER/Runtime/"]])
    assert.equal(runtimeEndpoint(home, platform), componentEndpoint(home, "executor-kernel", platform));
});

test("extraset accepts agent settings and empty display name without materializing a Runtime", async (t) => {
  const home = await mkdtemp(join(tmpdir(), "ocg-agent-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  const config = { bots: [{ bot_id: "qa", bot_name: "", api_url: "https://example.test/api", agent: { adapter_type: "codex", model: "model-id", effort: "high", workdir: home } }] };
  assert.equal(await runCli(["extraset", "--home", home], { input: Readable.from([JSON.stringify(config)]), output() {} }), 0);
  assert.deepEqual(await readConfig(home), config);
  assert.equal(await runCli(["configure", "--home", home, "--bot_id", "qa", "--api_url", "https://example.test/api", "--bot_name", "QA", "--model", "next-model"], { output() {} }), 0);
  const saved = await readConfig(home);
  assert.equal(saved.bots[0].bot_name, "QA");
  assert.deepEqual(saved.bots[0].agent, { ...config.bots[0].agent, model: "next-model" });
  for (const runtime_home of ["./runtime", "~/.octo-runtime", "", 5]) {
    assert.equal(await runCli(["extraset", "--home", home], { input: Readable.from([JSON.stringify({ runtime_home })]), output() {}, errorOutput() {} }), 2);
    assert.deepEqual(await readConfig(home), saved);
  }
});
