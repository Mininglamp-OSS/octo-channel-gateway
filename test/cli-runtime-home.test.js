import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { runCli, serviceSpec } from "../apps/cli/dist/main.js";
import { readConfig } from "../apps/cli/dist/config.js";
import { parseCliCommand } from "../apps/cli/dist/command-tree.js";
import { renderLaunchdPlist, renderSystemdUnit, renderWindowsTaskXml } from "../packages/cross-service/dist/index.js";
import { runtimeEndpoint } from "../apps/cli/dist/runtime-endpoint.js";
import { componentEndpoint } from "@mininglamp-oss/octo-runtime/host";

test("service launch arguments keep Runtime Home out of business configuration", async (t) => {
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
  assert.deepEqual(await readConfig(gatewayHome), {});
  assert.equal(spec.args.at(-1), join(userHome, ".octo-runtime"));
  assert.ok(spec.args.includes(gatewayHome));
  assert.ok(spec.args.includes("--runtime-home"));
  await assert.rejects(access(join(userHome, ".octo-runtime")), { code: "ENOENT" });
  const other = join(userHome, "other-runtime");
  assert.equal(await runCli(["install", "--runtime-home", other], { ...dependencies, errorOutput() {} }), 2);
  assert.deepEqual(await readConfig(gatewayHome), {});
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
  for (const runtime_home of ["/absolute/runtime", "./runtime", "~/.octo-runtime", "", 5, null]) {
    assert.equal(await runCli(["extraset", "--home", home], { input: Readable.from([JSON.stringify({ runtime_home })]), output() {}, errorOutput() {} }), 2);
    assert.deepEqual(await readConfig(home), saved);
  }
});


test("Runtime Home is scoped to start/run and survives native argument serialization", () => {
  for (const name of ["start", "run"]) {
    assert.equal(parseCliCommand([name, "--runtime-home", "/tmp/custom runtime"], []).flags.runtimeHome, "/tmp/custom runtime");
    const help = parseCliCommand([name, "--help"], []).help;
    assert.match(help, /Flags:[\s\S]*--runtime-home/);
    assert.ok(!help.split("Global Flags:")[1].includes("--runtime-home"));
  }
  for (const name of ["install", "restart", "stop", "status", "doctor", "extraset", "extraget", "logs", "uninstall"]) {
    assert.throws(() => parseCliCommand([name, "--runtime-home", "/tmp/other"], []), { code: "INVALID_ARGUMENTS" });
    assert.ok(!parseCliCommand([name, "--help"], []).help.includes("--runtime-home"));
  }
  assert.ok(!parseCliCommand(["--help"], []).help.includes("--runtime-home"));
  const spec = { ...serviceSpec("/tmp/gateway", true, "/tmp/runtime & project"), command: "/usr/bin/node", environment: {} };
  const plist = renderLaunchdPlist(spec);
  assert.match(plist, /<string>--runtime-home<\/string>\s*<string>\/tmp\/runtime &amp; project<\/string>/);
  assert.ok(renderSystemdUnit(spec).includes('"--runtime-home" "/tmp/runtime & project"'));
  const win = { ...spec, command: "C:\\Node\\node.exe", workingDirectory: "C:\\Gateway", args: ["cli.js", "run", "--runtime-home", "C:\\Runtime & Project"] };
  assert.ok(renderWindowsTaskXml(win, "DOMAIN\\tester").includes('--runtime-home &quot;C:\\Runtime &amp; Project&quot;'));
});
