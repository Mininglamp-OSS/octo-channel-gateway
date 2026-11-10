import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { spawn } from "node:child_process";
import { once } from "node:events";
import test from "node:test";
import { readConfig } from "../dist/apps/cli/src/config.js";
import { readStatus, serveStatus } from "../dist/apps/cli/src/control.js";
import { runCli, serviceSpec } from "../dist/apps/cli/src/main.js";
import { kernelFixture as createKernelFixture } from "./kernel-fixture.js";
import { waitFor } from "./runtime-fixture.js";
import { parseCliCommand } from "../dist/apps/cli/src/command-tree.js";
import { processStartIdentity } from "../dist/apps/cli/src/process-identity.js";

const kernelFixture = (t) =>
  createKernelFixture(t, { useDefaultEndpoint: true });

test("CLI help and version follow Runtime sections without accessing configuration", async (t) => {
  const home = await fixture(t);
  await writeFile(join(home, "config.json"), "corrupt");
  const invoke = async (args) => {
    let text = "";
    const code = await runCli([...args, "--home", home], {
      output: (line) => {
        text += line;
      },
      errorOutput: (line) => assert.fail(line),
      backend: new Proxy(
        {},
        { get: () => assert.fail("help accessed backend") },
      ),
    });
    assert.equal(code, 0);
    return text;
  };
  const root = await invoke([]);
  assert.equal(await invoke(["--help"]), root);
  assert.equal(await invoke(["-h"]), root);
  assert.equal(await invoke(["--home", "SENSITIVE_OPTION_VALUE", "--help"]), root);
  assert.equal(await invoke(["help"]), root);
  let last = -1;
  for (const heading of [
    "Usage:",
    "Examples:",
    "Available Commands:",
    "Flags:",
  ]) {
    const next = root.indexOf(heading);
    assert.ok(next > last, heading);
    last = next;
  }
  assert.match(
    root,
    /https:\/\/github.com\/Mininglamp-OSS\/octo-channel-gateway/,
  );
  const configure = await invoke(["configure", "--help"]);
  assert.match(configure, /Examples:\n  octo-channel-gateway configure/);
  assert.ok(!configure.includes("--runtime-home"));
  assert.match(configure, /Global Flags:[\s\S]*--home/);
  assert.equal(await invoke(["help", "configure"]), configure);
  const version = await invoke(["--version"]);
  assert.equal(await invoke(["-V"]), version);
  assert.equal(await invoke(["version"]), version);
  const metadata = JSON.parse(
    await readFile(
      new URL("../dist/apps/cli/src/build-info.json", import.meta.url),
      "utf8",
    ),
  );
  assert.ok(version.includes(`commit:${metadata.commit.slice(0, 12)}`));
  assert.ok(version.includes(`build:${metadata.buildTime}`));
  assert.equal(new Date(metadata.buildTime).toISOString(), metadata.buildTime);
});

test("CLI argument failures are actionable, structured and redact user input", async () => {
  const secret = "SENSITIVE_TEST_CREDENTIAL";
  for (const args of [
    [secret],
    ["--" + secret],
    ["--home"],
    ["--runtime-home"],
    ["configure", "--bot_id", secret],
    ["configure", "--bot_id", secret, "--api_url"],
    ["start", secret],
    ["version", secret],
    ["--version", secret],
    ["-V", secret],
    ["--help", secret],
    ["-h", secret],
    ["--help", "--", secret],
    ["--version", "--" + secret],
    ["--help", "--home"],
    ["configure", "--help", secret],
    ["extraset", "-h", secret],
    ["start", "--help", "--runtime-home", secret, secret],
    ["help", secret, "--help"],
    ["extraget", secret],
    ["extraget", "channel-gateway", secret],
    ["extraget", "channel-gateway"],
    ["extraset", "channel-gateway"],
    ["channel-gateway", "extraget"],
    ["configure", "--bf_token", secret, "--" + secret],
  ]) {
    for (const json of [false, true]) {
      let out = "",
        err = "";
      assert.equal(
        await runCli(json ? ["--json", ...args] : args, {
          output: (text) => {
            out += text;
          },
          errorOutput: (text) => {
            err += text;
          },
        }),
        2,
        JSON.stringify(args),
      );
      assert.ok(!(out + err).includes(secret));
      if (json) {
        assert.equal(err, "");
        const { error } = JSON.parse(out);
        assert.equal(error.code, "INVALID_ARGUMENTS");
        assert.match(error.message, /Use --help/);
      } else {
        assert.equal(out, "");
        assert.match(err, /Use --help/);
        assert.match(err, /Usage:/);
        assert.ok(!err.includes("INVALID_ARGUMENTS: INVALID_ARGUMENTS"));
      }
    }
  }
});

test("subcommand input errors show contextual help and extraset documents a usable Codex configuration", async (t) => {
  const home = await fixture(t);
  const invoke = async (args, input, json = false) => {
    let out = "",
      err = "";
    const code = await runCli(
      [...args, "--home", home, ...(json ? ["--json"] : [])],
      {
        input,
        output: (line) => {
          out += line;
        },
        errorOutput: (line) => {
          err += line;
        },
      },
    );
    return { code, out, err };
  };
  for (const [args, input, name] of [
    [["configure"], undefined, "configure"],
    [["logs", "--lines", "bad"], undefined, "logs"],
    [["install", "--autostart", "bad"], undefined, "install"],
    [["start", "--invalid"], undefined, "start"],
    [
      ["extraset"],
      Object.assign(Readable.from([]), { isTTY: true }),
      "extraset",
    ],
    [["extraset"], Readable.from([]), "extraset"],
    [["extraset"], Readable.from(["PRIVATE_INVALID_JSON"]), "extraset"],
  ]) {
    const { code, out, err } = await invoke(args, input);
    assert.equal(code, 2);
    assert.equal(out, "");
    assert.ok(err.includes(`Usage:\n  octo-channel-gateway ${name}`), err);
    assert.match(err, /Examples:/);
    assert.ok(!err.includes("PRIVATE_INVALID_JSON"));
  }
  const json = await invoke(
    ["extraset"],
    Object.assign(Readable.from([]), { isTTY: true }),
    true,
  );
  assert.equal(json.code, 2);
  assert.equal(json.err, "");
  assert.equal(JSON.parse(json.out).error.code, "GATEWAY_STDIN_REQUIRED");
  assert.ok(!json.out.includes("Usage:"));
  await assert.rejects(access(join(home, "config.json")), { code: "ENOENT" });
  const help = (await invoke(["extraset", "--help"])).out;
  assert.ok(!help.includes("gateway.json"));
  const example = JSON.parse(help.match(/<<'JSON'\n([\s\S]*?)\nJSON\n/)[1]);
  assert.equal(example.bots[0].agent.adapter_type, "codex");
  assert.equal(example.bots[0].agent.model, "gpt-6.1-sol");
  assert.equal(example.bots[0].api_url, "https://im.deepminer.com.cn/api");
  assert.equal(example.bots[0].bot_name, "My Codex Bot");
  assert.equal(Object.hasOwn(example.bots[0], "approval_mode"), false);
  assert.equal(example.bots[0].agent.effort, "high");
  assert.equal(
    (await invoke(["extraset"], Readable.from([JSON.stringify(example)]))).code,
    0,
  );
  assert.deepEqual(await readConfig(home), example);
});

test("command declarations wire nested arguments, examples and options consistently", () => {
  const leaf = {
    name: "inspect",
    description: "Inspect a fixture",
    arguments: [{ name: "id", required: true }],
    options: [
      {
        name: "mode",
        type: "string",
        required: true,
        description: "Inspection mode",
      },
    ],
    examples: ["octo-channel-gateway fixture inspect one --mode brief"],
    run() {},
  };
  const definitions = [
    { name: "fixture", description: "Fixture commands", commands: [leaf] },
  ];
  const parsed = parseCliCommand(
    [
      "--home",
      "channel-gateway",
      "fixture",
      "inspect",
      "one",
      "--mode",
      "brief",
      "--json",
    ],
    definitions,
  );
  assert.equal(parsed.business, leaf);
  assert.deepEqual(parsed.arguments, ["one"]);
  assert.deepEqual(parsed.options, { mode: "brief" });
  assert.equal(parsed.flags.home, "channel-gateway");
  assert.equal(parsed.flags.json, true);
  const help = parseCliCommand(
    ["fixture", "inspect", "--help"],
    definitions,
  ).help;
  assert.match(help, /Usage:\n  octo-channel-gateway fixture inspect/);
  assert.match(help, /Arguments:/);
  assert.match(
    help,
    /Examples:\n  octo-channel-gateway fixture inspect one --mode brief/,
  );
  assert.match(
    parseCliCommand(["fixture"], definitions).help,
    /Available Commands:/,
  );
  assert.throws(
    () =>
      parseCliCommand(["fixture", "inspect", "--mode", "brief"], definitions),
    /required argument is missing/,
  );
});

async function fixture(t) {
  const home = await mkdtemp(join(tmpdir(), "ocg-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  return home;
}

test("CLI saves optional Agent execution settings, preserves them on configure and rejects invalid updates", async (t) => {
  const home = await fixture(t);
  const config = JSON.parse(
    await readFile(
      new URL("../docs/examples/gateway-execution.json", import.meta.url),
      "utf8",
    ),
  );
  const invoke = async (args, value) => {
    let output = "";
    const code = await runCli([...args, "--home", home, "--json"], {
      input: Readable.from(value === undefined ? [] : [JSON.stringify(value)]),
      output: (text) => {
        output += text;
      },
      errorOutput: assert.fail,
    });
    return { code, output };
  };
  assert.equal((await invoke(["extraset"], config)).code, 0);
  assert.deepEqual(await readConfig(home), config);
  const bot = config.bots[0];
  assert.equal(
    (
      await invoke([
        "configure",
        "--bot_id",
        bot.bot_id,
        "--api_url",
        bot.api_url,
        "--bot_name",
        "Updated",
      ])
    ).code,
    0,
  );
  const saved = await readConfig(home);
  assert.equal(saved.bots[0].bot_name, "Updated");
  assert.deepEqual(saved.bots[0].agent, bot.agent);
  for (const [field, payload, code] of [
    [
      "mcp",
      { mcpServers: { PRIVATE_SERVER: { type: "invalid" } } },
      "IM_AGENT_MCP_INVALID",
    ],
    [
      "envs",
      { env_variables: [{ key: "PRIVATE-BAD-KEY", value: "PRIVATE_VALUE" }] },
      "IM_AGENT_ENVS_INVALID",
    ],
  ]) {
    const invalid = structuredClone(saved);
    invalid.bots[0].agent[field] = payload;
    const result = await invoke(["extraset"], invalid);
    assert.equal(result.code, 2);
    assert.equal(JSON.parse(result.output).error.code, code);
    assert.ok(!result.output.includes("PRIVATE"));
    assert.deepEqual(await readConfig(home), saved);
  }
});
test("CLI help exposes only independent service commands", async () => {
  let help = "";
  assert.equal(
    await runCli(["--help"], {
      output: (text) => {
        help = text;
      },
    }),
    0,
  );
  for (const name of [
    "doctor",
    "install",
    "uninstall",
    "start",
    "stop",
    "restart",
    "logs",
    "configure",
    "extraset",
    "extraget",
  ])
    assert.ok(help.includes(name), name);
  for (const name of ["extraset", "extraget"]) {
    const help = parseCliCommand([name, "--help"], []).help;
    assert.ok(help.includes(`octo-channel-gateway ${name} [options]`));
    assert.ok(!help.includes("[component]"));
    assert.ok(!help.includes("Arguments:"));
  }
});
test("install persists default launch arguments without writing business configuration", async (t) => {
  const home = await fixture(t),
    endpoint = join(home, "runtime"),
    calls = [];
  let installed = false,
    enabled = false;
  const backend = {
    kind: "launchd-user",
    async inspect(spec) {
      return {
        manager: this.kind,
        state: installed ? "stopped" : "not_installed",
        enabled,
        drift: [],
      };
    },
    async install(spec) {
      calls.push(["install", spec]);
      installed = true;
      enabled = spec.enabled;
    },
    async stop(spec) {
      calls.push(["stop", spec]);
    },
    async uninstall(spec) {
      calls.push(["uninstall", spec]);
      installed = false;
    },
  };
  const invoke = (...args) =>
    runCli([...args, "--home", home], { backend, output() {} });
  assert.equal(await invoke("install"), 0);
  assert.equal(calls[0][1].enabled, true);
  assert.ok(!calls[0][1].args.includes(endpoint));
  assert.deepEqual(await readConfig(home), {});
  assert.equal(await invoke("stop"), 0);
  assert.ok(!calls[1][1].args.includes(endpoint));
  assert.equal(await invoke("uninstall"), 0);
  assert.deepEqual(await readConfig(home), {});
  assert.equal(serviceSpec(home).args.includes("executor-kernel"), false);
});
test("configuration accepts direct input, rejects wrappers and remains readable after corruption", async (t) => {
  const home = await fixture(t);
  assert.equal(
    await runCli(["extraset", "--home", home], {
      input: Readable.from([JSON.stringify({ bots: [], enabled: false })]),
      output() {},
    }),
    0,
  );
  assert.deepEqual(await readConfig(home), { bots: [], enabled: false });
  let config;
  assert.equal(
    await runCli(["extraget", "--home", home], {
      output(line) {
        config = JSON.parse(line);
      },
    }),
    0,
  );
  assert.deepEqual(config, { bots: [], enabled: false });
  for (const value of [
    { config: { bots: [] } },
    { bots: [], module: "channel-gateway" },
  ]) {
    assert.equal(
      await runCli(["extraset", "--home", home], {
        input: Readable.from([JSON.stringify(value)]),
        output() {},
        errorOutput() {},
      }),
      2,
    );
    assert.deepEqual(await readConfig(home), config);
  }
  assert.equal(
    await runCli(["extraget", "other-channel", "--home", home], {
      output() {},
      errorOutput() {},
    }),
    2,
  );
  await writeFile(join(home, "config.json"), "broken", { mode: 0o600 });
  assert.equal(
    await runCli(["logs", "--home", home], { output() {}, errorOutput() {} }),
    0,
  );
});
test("foreground service serves status, handles cancellation, releases lock and preserves Kernel", async (t) => {
  const home = await fixture(t),
    kernel = await kernelFixture(t);
  await writeFile(join(home, "config.json"), JSON.stringify({ bots: [], runtime_home: join(home, "ignored-runtime") }), {
    mode: 0o600,
  });
  const controller = new AbortController();
  const running = runCli(
    ["run", "--home", home, "--runtime-home", kernel.directory],
    { signal: controller.signal, output() {} },
  );
  try {
    await waitFor(async () => {
      try {
        return (await readStatus(home)).phase === "ready";
      } catch {
        return false;
      }
    });
    assert.equal((await readStatus(home)).endpoint, kernel.endpoint);
    const duplicate = await runCli(
      ["run", "--home", home, "--runtime-home", kernel.directory],
      { output() {}, errorOutput() {} },
    );
    assert.notEqual(duplicate, 0);
  } finally {
    controller.abort();
    assert.equal(await running, 0);
  }
  await assert.rejects(access(join(home, "service.lock")), { code: "ENOENT" });
  assert.equal((await kernel.client.status()).execution_ready, true);
  const close = await serveStatus(home, () => ({ pid: process.pid }));
  await close();
});

test("start installs only Gateway, waits for status, and restart reuses the endpoint", async (t) => {
  const kernel = await kernelFixture(t);
  const home = await fixture(t),
    endpoint = kernel.endpoint,
    calls = [];
  let installed = false,
    close, child;
  const replaceProcess = async () => {
    if (child) { const exited = once(child, "exit"); child.kill(); await exited; }
    child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
    await once(child, "spawn");
    await writeFile(join(home, "service.lock"), JSON.stringify({ pid: child.pid, startIdentity: await processStartIdentity(child.pid) }));
  };
  const backend = {
    kind: "fixture",
    async inspect() {
      return {
        state: installed ? "running" : "not_installed",
        enabled: installed,
        pid: child?.pid,
        drift: [],
      };
    },
    async install(spec) {
      installed = true;
      calls.push(["install", spec]);
    },
    async start(spec) {
      calls.push(["start", spec]);
      await close?.();
      await replaceProcess();
      close = await serveStatus(home, () => ({
        pid: child.pid,
        phase: "ready",
        endpoint,
        bots: [],
      }));
    },
    async restart(spec) {
      calls.push(["restart", spec]);
      await replaceProcess();
    },
  };
  t.after(async () => {
    await close?.();
    if (child) { const exited = once(child, "exit"); child.kill(); await exited; }
  });
  const invoke = (...args) =>
    runCli([...args, "--home", home], {
      backend,
      output() {},
      errorOutput() {},
      readyTimeoutMs: 10,
    });
  assert.equal(await invoke("start", "--runtime-home", kernel.directory), 0);
  assert.deepEqual(
    calls.map(([action]) => action),
    ["install", "start"],
  );
  assert.equal(calls[0][1].args.at(-2), "--runtime-home");
  assert.equal(calls[0][1].args.at(-1), kernel.directory);
  assert.deepEqual(await readConfig(home), {});
  const nextKernel = await kernelFixture(t);
  assert.equal(await invoke("start", "--runtime-home", nextKernel.directory), 0);
  assert.equal(calls[2][1].args.at(-1), nextKernel.directory);
  assert.deepEqual(calls.slice(2).map(([action]) => action), ["install", "start"]);
  assert.equal(await invoke("restart"), 0);
  assert.deepEqual(calls.slice(4).map(([action]) => action), ["restart"]);
  assert.ok(
    calls.every(
      ([, spec]) =>
        !spec.args.includes(endpoint) && !spec.args.includes("executor-kernel"),
    ),
  );
  await close();
  close = undefined;
  assert.equal(await invoke("restart"), 4);
});

test("startup explains the Runtime prerequisite before changing Gateway services", async (t) => {
  const home = await fixture(t);
  const backend = new Proxy(
    {},
    {
      get() {
        throw new Error("Service manager must not be touched");
      },
    },
  );
  for (const action of ["start", "run"]) {
    for (const json of [false, true]) {
      const output = [];
      const code = await runCli(
        [action, "--home", home, ...(json ? ["--json"] : [])],
        {
          backend,
          env: { HOME: home },
          output: (text) => output.push(text),
          errorOutput: (text) => output.push(text),
        },
      );
      assert.equal(code, 4);
      const message = json
        ? JSON.parse(output[0]).error.message
        : output.join("\n");
      assert.match(
        message,
        /npm install -g @mininglamp-oss\/octo-runtime@latest/,
      );
      assert.match(message, /octo-runtime start/);
      assert.match(message, /octo-runtime doctor --json/);
      assert.match(message, /--runtime-home/);
    }
  }
  const output = [];
  assert.equal(
    await runCli(
      [
        "start",
        "--home",
        home,
        "--runtime-home",
        join(home, "absent.sock"),
        "--json",
      ],
      {
        backend,
        output: (text) => output.push(text),
        errorOutput: (text) => output.push(text),
      },
    ),
    4,
  );
  assert.equal(JSON.parse(output[0]).error.code, "KERNEL_UNAVAILABLE");
  assert.match(JSON.parse(output[0]).error.message, /octo-runtime start/);
  await assert.rejects(access(join(home, "config.json")), { code: "ENOENT" });
});

test("doctor follows the running Gateway endpoint and management does not read business config", async (t) => {
  const home = await fixture(t), kernel = await kernelFixture(t);
  // 管理不受损坏业务配置影响，也不能回退到当前用户默认 Kernel。
  await writeFile(join(home, "config.json"), "broken", { mode: 0o600 });
  let close = await serveStatus(home, () => ({ pid: process.pid, endpoint: kernel.endpoint }));
  t.after(async () => { await close?.(); });
  const backend = {
    async inspect() { return { state: "running", enabled: true, drift: ["definition_content"] }; },
    async probe() { return { supported: true }; },
  };
  let report;
  const invoke = () => runCli(["doctor", "--home", home, "--json"], {
    backend, env: { HOME: home }, output: (text) => { report = JSON.parse(text); },
  });
  assert.equal(await invoke(), 0);
  assert.equal(report.kernel.execution_ready, true);
  assert.equal(report.runtime.endpoint, kernel.endpoint);
  assert.deepEqual(report.service.drift, []);
  assert.equal(report.service.definition_comparison, "not_requested");
  await close(); close = undefined;
  assert.equal(await invoke(), 0);
  assert.deepEqual(report.kernel, { available: false, error: "GATEWAY_UNAVAILABLE" });
  assert.equal(await readFile(join(home, "config.json"), "utf8"), "broken");
});
