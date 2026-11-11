// 显式本地专项：pnpm run build && node --test scripts/verify-windows-ownership.mjs
// 注入原生命令结果，不调用真实 Task Scheduler，也不安装或停止系统服务。
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WindowsUserTaskBackend } from "../packages/cross-service/dist/windows-task.js";
import { acquireProcessLock } from "../apps/cli/dist/lock.js";
import { inspectOwnership } from "../apps/cli/dist/ownership.js";
import { runCli } from "../apps/cli/dist/main.js";
import { serveStatus } from "../apps/cli/dist/control.js";
import { kernelFixture } from "../test/kernel-fixture.js";

const spec = { id: "gateway", command: "C:\\Program Files\\node.exe", args: ["C:\\gateway\\index.js", "run"],
  workingDirectory: "C:\\gateway", restart: { policy: "never" } };
const action = { pid: process.pid, parent_pid: 700, engine_pid: 700,
  created_at: "2026-11-10T08:00:01.000Z", engine_created_at: "2026-11-10T08:00:00.000Z",
  execute: spec.command, command_line: `"${spec.command}" C:\\gateway\\index.js run`, user_matches: true };
const taskStatus = () => ({ state: "Running", enabled: true, execute: spec.command,
  arguments: "C:\\gateway\\index.js run", working_directory: spec.workingDirectory,
  principal_user_id: "DOMAIN\\current", trigger_user_id: "DOMAIN\\current",
  principal_user_matches: true, trigger_user_matches: true, principal_logon_type: "InteractiveToken",
  running_instances: 1, action_processes: [{ ...action }] });
async function homeFixture(t) {
  const home = await mkdtemp(join(tmpdir(), "gateway-windows-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  return home;
}
function backendFixture(home, payload) {
  return new WindowsUserTaskBackend({ platform: "win32", windowsUserId: "DOMAIN\\current",
    homeDirectory: "C:\\Users\\current", windowsDefinitionDirectory: home, environment: {},
    runner: { async run(command, args) {
      const query = /powershell/i.test(command);
      if (query) {
        assert.match(args.at(-1), /GetInstances\(0\)/);
        assert.match(args.at(-1), /EnginePID/);
        assert.match(args.at(-1), /Get-CimInstance -ClassName Win32_Process/);
        assert.match(args.at(-1), /GetOwnerSid/);
      } else assert.equal(args[0], "/Query", "must not mutate native tasks");
      return { command, args, exitCode: 0, stderr: "", stdout: query ? JSON.stringify(payload) : "exists" };
    } },
  });
}
async function liveOwner(t, home) {
  t.after(await acquireProcessLock(join(home, "service.lock")));
  t.after(await serveStatus(home, () => ({ pid: process.pid, phase: "ready" })));
}

test("Windows task's verified Exec child supplies manager PID and permits normal ready status", async (t) => {
  const home = await homeFixture(t);
  await liveOwner(t, home);
  const status = await backendFixture(home, taskStatus()).inspect(spec);
  assert.equal(status.pid, process.pid);
  assert.equal((await inspectOwnership(home, status)).ownership.ready, true);
});

test("Windows supports engine reporting the Exec PID itself", async (t) => {
  const home = await homeFixture(t), payload = taskStatus();
  payload.action_processes[0].engine_pid = process.pid;
  assert.equal((await backendFixture(home, payload).inspect(spec)).pid, process.pid);
});

for (const [name, mutate] of [
  ["ordinary foreground process", p => { p.action_processes[0].parent_pid = 99; }],
  ["different executable", p => { p.action_processes[0].execute = "C:\\other.exe"; }],
  ["different Home or arguments", p => { p.action_processes[0].command_line += " --home other"; }],
  ["other account", p => { p.action_processes[0].user_matches = false; }],
  ["recycled parent PID", p => { p.action_processes[0].engine_created_at = "2026-11-10T09:00:00.000Z"; }],
  ["unavailable creation time", p => { p.action_processes[0].created_at = ""; }],
  ["ambiguous action processes", p => { p.action_processes.push({ ...action, pid: process.pid + 1 }); }],
  ["multiple native instances", p => { p.running_instances = 2; }],
  ["missing native process permissions", p => { p.action_processes = []; }],
  ["malformed native pid", p => { p.action_processes[0].pid = "123"; }],
  ["task no longer running", p => { p.state = "Ready"; }],
]) test(`Windows does not invent manager PID: ${name}`, async (t) => {
  const home = await homeFixture(t), payload = taskStatus(); mutate(payload);
  await liveOwner(t, home);
  const status = await backendFixture(home, payload).inspect(spec);
  assert.equal(status.pid, undefined);
  assert.equal((await inspectOwnership(home, status)).ownership.ready, false);
});

for (const requestedAction of ["start", "restart"]) {
  test(`${requestedAction} cleans a newly launched Windows task when action PID cannot be verified`, async (t) => {
    const home = await homeFixture(t);
    const kernel = requestedAction === "start" ? await kernelFixture(t, { useDefaultEndpoint: true }) : undefined;
    let started = false, stops = 0;
    const backend = { kind: "windows-user-task",
      inspect: async () => ({ manager: "windows-user-task", state: started ? "running" : "stopped", enabled: true, drift: [] }),
      install: async () => {},
      async start() { started = true; await liveOwner(t, home); },
      async restart() { started = true; await liveOwner(t, home); },
      async stop() { stops++; started = false; },
    };
    const lines = [];
    const code = await runCli([requestedAction, "--home", home, "--json", ...(kernel ? ["--runtime-home", kernel.directory] : [])],
      { backend, output: line => lines.push(line), errorOutput: line => lines.push(line), readyTimeoutMs: 0 });
    assert.equal(code, 4);
    assert.equal(JSON.parse(lines.at(-1)).error.code, "GATEWAY_UNAVAILABLE");
    assert.equal(stops, 1);
    assert.equal(started, false);
  });
}

test("failed native launch with unknown PID preserves cleanup failure diagnostics", async (t) => {
  const home = await homeFixture(t); let started = false, stops = 0;
  const lines = [];
  const code = await runCli(["restart", "--home", home, "--json"], {
    backend: { kind: "windows-user-task",
      inspect: async () => ({ manager: "windows-user-task", state: started ? "running" : "stopped", enabled: true, drift: [] }),
      async restart() { started = true; await liveOwner(t, home); throw new Error("NATIVE_START_FAILED"); },
      async stop() { stops++; throw new Error("NATIVE_STOP_FAILED"); },
    }, output: line => lines.push(line), errorOutput: line => lines.push(line), readyTimeoutMs: 0,
  });
  assert.equal(code, 4); assert.equal(stops, 1);
  assert.match(JSON.parse(lines.at(-1)).error.message, /NATIVE_START_FAILED.*cleanup failed \(NATIVE_STOP_FAILED\)/);
});

for (const requestedAction of ["start", "restart", "install"]) {
  test(`${requestedAction} works with verified Windows task process ownership`, async (t) => {
    const home = await homeFixture(t);
    const kernel = requestedAction === "start" ? await kernelFixture(t, { useDefaultEndpoint: true }) : undefined;
    const payload = taskStatus();
    payload.state = requestedAction === "install" ? "Running" : "Ready";
    if (requestedAction === "install") await liveOwner(t, home);
    const native = backendFixture(home, payload);
    const begin = async () => { payload.state = "Running"; await liveOwner(t, home); };
    const backend = { kind: "windows-user-task", inspect: () => native.inspect(spec),
      install: async () => {}, start: begin, restart: begin,
      stop: async () => assert.fail("verified native process must not be cleaned up"),
    };
    const lines = [];
    const code = await runCli([requestedAction, "--home", home, "--json", ...(kernel ? ["--runtime-home", kernel.directory] : [])],
      { backend, output: line => lines.push(line), errorOutput: line => lines.push(line), readyTimeoutMs: 0 });
    assert.equal(code, 0, lines.join("\n"));
    assert.equal(JSON.parse(lines.at(-1)).ownership.ready, true);
  });
}

for (const observation of ["none", "throws"]) {
  test(`native launch failure cleans the new task when later ownership ${observation}`, async (t) => {
    const home = await homeFixture(t); let started = false, stops = 0;
    const lines = [];
    const code = await runCli(["restart", "--home", home, "--json"], {
      backend: {
        async inspect() {
          if (started && observation === "throws") throw new Error("STATUS_QUERY_FAILED");
          return { manager: "windows-user-task", state: started ? "running" : "stopped", enabled: true, drift: [] };
        },
        async restart() { started = true; throw new Error("NATIVE_START_FAILED"); },
        async stop() { stops++; started = false; },
      }, output: line => lines.push(line), errorOutput: line => lines.push(line), readyTimeoutMs: 0,
    });
    assert.equal(code, 4); assert.equal(stops, 1); assert.equal(started, false);
    assert.match(JSON.parse(lines.at(-1)).error.message, /NATIVE_START_FAILED.*attempted managed service was stopped/);
  });
}

for (const mode of ["native error", "readiness query", "install query"]) {
  for (const original of [false, true]) {
    if (mode === "native error" && !original) continue; // 上方已覆盖相同的新启动失败路径。
    test(`${mode} failure ${original ? "retains the original instance" : mode === "install query" ? "does not stop an unstarted definition" : "cleans a new launch"} when status is unavailable`, async (t) => {
      const home = await homeFixture(t); let attempted = false, stops = 0;
      if (original) await liveOwner(t, home);
      const actionName = mode === "install query" ? "install" : "restart";
      const backend = {
        async inspect() {
          if (attempted) throw new Error("STATUS_QUERY_FAILED");
          return { manager: "windows-user-task", state: original ? "running" : "stopped", enabled: true, drift: [],
            ...(original ? { pid: process.pid } : {}) };
        },
        async [actionName]() { attempted = true; if (mode === "native error") throw new Error("NATIVE_START_FAILED"); },
        async stop() { stops++; },
      };
      const lines = [];
      const code = await runCli([actionName, "--home", home, "--json"], {
        backend, output: line => lines.push(line), errorOutput: line => lines.push(line), readyTimeoutMs: 0,
      });
      assert.equal(code, 4);
      // install 对原本 stopped 的定义没有启动职责；无须停止一个未请求启动的任务。
      assert.equal(stops, original || mode === "install query" ? 0 : 1);
      const message = JSON.parse(lines.at(-1)).error.message;
      assert.match(message, original ? /cleanup could not be confirmed.*retained/ : mode === "install query" ? /No managed launch was requested/ : /attempted managed service was stopped/);
    });
  }
}

test("native command error does not stop a newly confirmed ready instance", async (t) => {
  const home = await homeFixture(t); let started = false, stops = 0;
  const lines = [];
  const code = await runCli(["restart", "--home", home, "--json"], {
    backend: {
      inspect: async () => ({ manager: "windows-user-task", state: started ? "running" : "stopped", enabled: true, drift: [],
        ...(started ? { pid: process.pid } : {}) }),
      async restart() { started = true; await liveOwner(t, home); throw new Error("NATIVE_START_FAILED"); },
      async stop() { stops++; },
    }, output: line => lines.push(line), errorOutput: line => lines.push(line), readyTimeoutMs: 0,
  });
  assert.equal(code, 1); assert.equal(stops, 0); assert.equal(started, true);
  assert.match(lines.at(-1), /NATIVE_START_FAILED/);
});
