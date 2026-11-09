import assert from "node:assert/strict";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import { readConfig } from "../dist/apps/cli/src/config.js";
import { readStatus, serveStatus } from "../dist/apps/cli/src/control.js";
import { runCli, serviceSpec } from "../dist/apps/cli/src/main.js";
import { kernelFixture as createKernelFixture } from "./kernel-fixture.js";
import { waitFor } from "./runtime-fixture.js";

const kernelFixture = (t) => createKernelFixture(t, { useDefaultEndpoint: true });

async function fixture(t) {
  const home = await mkdtemp(join(tmpdir(), "ocg-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  return home;
}
test("CLI help exposes the independent service and legacy component form", async () => {
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
  assert.equal(await runCli(["channel-gateway", "--help"], { output() {} }), 0);
});
test("install remembers endpoint, defaults to autostart, and uninstall preserves config", async (t) => {
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
  assert.equal(await invoke("install", "--runtime-home", endpoint), 0);
  assert.equal(calls[0][1].enabled, true);
  assert.ok(!calls[0][1].args.includes(endpoint));
  assert.equal((await readConfig(home)).runtime_home, endpoint);
  assert.equal(await invoke("stop"), 0);
  assert.ok(!calls[1][1].args.includes(endpoint));
  assert.equal(await invoke("uninstall"), 0);
  assert.equal((await readConfig(home)).runtime_home, endpoint);
  assert.equal(serviceSpec(home).args.includes("executor-kernel"), false);
});
test("configuration accepts the old wrapper and logs remain readable after corruption", async (t) => {
  const home = await fixture(t);
  assert.equal(
    await runCli(["extraset", "--home", home], {
      input: Readable.from([
        JSON.stringify({ config: { bots: [] }, enabled: false }),
      ]),
      output() {},
    }),
    0,
  );
  assert.deepEqual(await readConfig(home), { bots: [], enabled: false });
  let config;
  assert.equal(
    await runCli(["extraget", "channel-gateway", "--home", home], {
      output(line) {
        config = JSON.parse(line);
      },
    }),
    0,
  );
  assert.deepEqual(config, { bots: [], enabled: false });
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
  await writeFile(join(home, "config.json"), JSON.stringify({ bots: [] }), {
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
    close;
  const backend = {
    kind: "fixture",
    async inspect() {
      return {
        state: installed ? "running" : "not_installed",
        enabled: installed,
        drift: [],
      };
    },
    async install(spec) {
      installed = true;
      calls.push(["install", spec]);
    },
    async start(spec) {
      calls.push(["start", spec]);
      close = await serveStatus(home, () => ({
        pid: process.pid,
        phase: "ready",
        endpoint,
        bots: [],
      }));
    },
    async restart(spec) {
      calls.push(["restart", spec]);
    },
  };
  t.after(async () => {
    await close?.();
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
  assert.equal(await invoke("restart"), 0);
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
  for (const action of ["start", "restart", "run"]) {
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
      assert.match(message, /npm install -g @mininglamp-oss\/octo-runtime@\^1\.1\.12/);
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
  assert.match(
    JSON.parse(output[0]).error.message,
    /octo-runtime start/,
  );
  await assert.rejects(access(join(home, "config.json")), { code: "ENOENT" });
});
