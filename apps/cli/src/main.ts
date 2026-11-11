import { createCliHooks } from "./hooks.js";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { lstat, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createInterface } from "node:readline/promises";
import { setTimeout as delay } from "node:timers/promises";
import { attachKernel } from "@mininglamp-oss/octo-runtime-client";
import {
  ChannelGateway,
  validateImBots,
  type ImBotConfig,
} from "@mininglamp-oss/octo-channel-gateway-sdk";
import { RuntimeLogging } from "@mininglamp-oss/octo-channel-gateway-sdk/host/runtime-log";
import type { JsonObject } from "@mininglamp-oss/octo-channel-gateway-sdk/host/types";
import {
  createServiceBackend,
  type ServiceBackend,
  type ServiceSpec,
} from "@mininglamp-oss/octo-channel-gateway-cross-service";
import {
  GatewayCommandError,
  type GatewayCommandContext,
} from "./command-types.js";
import commands from "./commands.js";
import { CliUsageError, parseCliCommand } from "./command-tree.js";
import { requireRuntime, runtimeSetupHelp } from "./runtime-prerequisite.js";
import { runtimeEndpoint, validateRuntimeHomeConfig } from "./runtime-endpoint.js";
import {
  commandConfig,
  configFile,
  readConfig,
  saveConfig,
  withConfigLock,
} from "./config.js";
import { acquireProcessLock, inspectProcessLock } from "./lock.js";
import { serveStatus } from "./control.js";
import { assertLaunchAllowed, inspectOwnership, ownershipMessage } from "./ownership.js";
import { showChannelLogs } from "./logs.js";

export interface CliDependencies {
  backend?: ServiceBackend;
  input?: NodeJS.ReadableStream;
  output?: (line: string) => void;
  errorOutput?: (line: string) => void;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  readyTimeoutMs?: number;
  /** 仅通知可执行入口；可导入的 CLI 不退出调用进程。 */
  onForeground?: () => void;
}

/** 服务只托管 Gateway；Runtime Home 固定在启动参数中，不读取业务配置。 */
export function serviceSpec(
  home: string,
  enabled = false,
  runtimeHome = join(homedir(), ".octo-runtime"),
): ServiceSpec {
  const key = process.platform === "win32" ? home.toLowerCase() : home;
  const id = `cn.mininglamp.octo-channel-gateway.h${createHash("sha256").update(key).digest("hex").slice(0, 16)}`;
  return {
    id,
    description: "Octo Channel Gateway",
    command: process.execPath,
    args: [
      fileURLToPath(new URL("./index.js", import.meta.url)),
      "run",
      "--home",
      home,
      "--runtime-home",
      runtimeHome,
    ],
    workingDirectory: home,
    enabled,
    ...(process.platform !== "win32"
      ? {
          environment: {
            PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
          },
        }
      : {}),
    restart: { policy: "on-failure", delaySeconds: 5, maxBurst: 3 },
    timeoutStopSeconds: 10,
    names: {
      launchdLabel: id,
      systemdUnit: `${id}.service`,
      windowsTaskName: `\\${id}`,
    },
  };
}

async function stdin(
  input: NodeJS.ReadableStream,
  signal?: AbortSignal,
): Promise<string> {
  if ((input as NodeJS.ReadStream).isTTY)
    throw new Error("GATEWAY_STDIN_REQUIRED");
  signal?.throwIfAborted();
  let text = "";
  return await new Promise<string>((resolve, reject) => {
    const cleanup = () => {
      input.off("data", data);
      input.off("end", end);
      input.off("error", fail);
      signal?.removeEventListener("abort", abort);
      input.pause();
    };
    const fail = (error: unknown) => {
      cleanup();
      reject(error);
    };
    const abort = () => fail(new Error("GATEWAY_COMMAND_CANCELLED"));
    const end = () => {
      cleanup();
      resolve(text);
    };
    const data = (chunk: Buffer | string) => {
      text += String(chunk);
      if (Buffer.byteLength(text) > 1024 * 1024)
        fail(new Error("GATEWAY_CONFIG_TOO_LARGE"));
    };
    input.on("data", data);
    input.once("end", end);
    input.once("error", fail);
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    else input.resume();
  });
}

/** 使用同一 SDK 注册定义；初始化、信号和失败共用关闭路径，不接管 Kernel 生命周期。 */
async function run(
  home: string,
  endpoint: string,
  config: JsonObject,
  dependencies: CliDependencies,
  output: (text: string) => void,
): Promise<number> {
  await mkdir(home, { recursive: true, mode: 0o700 });
  const homeStat = await lstat(home);
  if (!homeStat.isDirectory() || homeStat.isSymbolicLink())
    throw new Error("GATEWAY_HOME_INVALID");
  const release = await acquireProcessLock(join(home, "service.lock")).catch(async (error) => {
    if (!(error instanceof Error) || error.message !== "SETUP_IN_PROGRESS") throw error;
    const lock = await inspectProcessLock(join(home, "service.lock"));
    throw new GatewayCommandError("GATEWAY_HOME_OCCUPIED",
      `Home: ${home}\nOwner PID: ${lock.pid ?? "unknown"}\nAnother Gateway run owns this Home, or its lock cannot be verified. Check status --home ${JSON.stringify(home)}; stop the existing run in its terminal before retrying. Do not delete a live service.lock or gateway.sock.`);
  });
  let kernel: ReturnType<typeof attachKernel> | undefined;
  let gateway: ChannelGateway | undefined;
  let logger: RuntimeLogging | undefined;
  let closeStatus: (() => Promise<void>) | undefined;
  let stopping = false;
  let wake!: () => void;
  const stopped = new Promise<void>((resolve) => {
    wake = resolve;
  });
  const controller = new AbortController();
  const stop = () => {
    stopping = true;
    controller.abort();
    wake();
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  dependencies.signal?.addEventListener("abort", stop, { once: true });
  if (dependencies.signal?.aborted) stop();
  try {
    logger = new RuntimeLogging({ directory: join(home, "logs") });
    const log = logger.channel("channel-gateway");
    const bots = config.bots ?? [];
    validateImBots(bots);
    const spaces = config.authorized_space_ids;
    if (
      spaces !== undefined &&
      (!Array.isArray(spaces) ||
        spaces.some((space) => typeof space !== "string" || !space.trim()))
    )
      throw new Error("IM_AUTHORIZED_SPACES_INVALID");
    if (Object.hasOwn(config, "material_loading")) throw new Error("IM_MATERIAL_API_REMOVED");
    kernel = attachKernel({ endpoint });
    gateway = new ChannelGateway({ kernel, log, signal: controller.signal });
    if (config.enabled !== false)
      for (const bot of bots) {
        controller.signal.throwIfAborted();
        const { api_url, bf_token, bot_id, bot_name, agent, ...settings } = bot as ImBotConfig;
        await gateway.register({
            ...settings, apiUrl: api_url, bfToken: bf_token, botId: bot_id, botName: bot_name,
            authorizeSpace: spaces
              ? (spaceId) => {
                  if (!spaces.includes(spaceId))
                    throw new Error("IM_TENANT_NOT_ACTIVE");
                }
              : undefined,
          }, agent, createCliHooks(agent, log));
      }
    controller.signal.throwIfAborted();
    closeStatus = await serveStatus(home, () => ({
      pid: process.pid,
      phase: "ready",
      endpoint,
      bots: gateway?.status ?? [],
    }));
    log("info", "service.ready", { state: "ready" });
    output(JSON.stringify({ component: "channel-gateway", state: "ready" }));
    await stopped;
    return 0;
  } catch (error) {
    if (!stopping) throw error;
    return 0;
  } finally {
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
    dependencies.signal?.removeEventListener("abort", stop);
    try {
      const cleanup = await Promise.allSettled([
        Promise.resolve().then(() => gateway?.close()),
        Promise.resolve().then(() => closeStatus?.()),
      ]);
      cleanup.push(...await Promise.allSettled([
        Promise.resolve().then(() => kernel?.close()),
      ]));
      const incomplete = cleanup.some(result => result.status === "rejected");
      cleanup.push(...await Promise.allSettled([
        Promise.resolve().then(() => logger?.channel("channel-gateway")(
          incomplete ? "error" : "info", "service.closed",
          { state: incomplete ? "cleanup_incomplete" : "closed" },
        )),
      ]));
      cleanup.push(...await Promise.allSettled([
        Promise.resolve().then(() => logger?.close()),
      ]));
      const errors = cleanup.filter(result => result.status === "rejected").map(result => result.reason);
      if (errors.length) throw new AggregateError(errors, "IM_DISPOSE_FAILED");
    } finally {
      await release();
    }
  }
}

/** 可导入 CLI：支持注入服务后端进行离线验证，不退出调用进程。 */
export async function runCli(
  raw: string[],
  dependencies: CliDependencies = {},
): Promise<number> {
  const output =
    dependencies.output ??
    ((text) => {
      process.stdout.write(text + "\n");
    });
  const errorOutput =
    dependencies.errorOutput ??
    ((text) => {
      process.stderr.write(text + "\n");
    });
  let json = raw.some((arg) => arg === "--json" || arg.startsWith("--json="));
  let usageHelp = "";
  try {
    const parsed = parseCliCommand(raw, commands.commands);
    usageHelp = parsed.commandHelp;
    const { action, business, flags } = parsed;
    if (parsed.help) {
      output(parsed.help);
      return 0;
    }
    json = Boolean(flags.json);
    const home = resolve(
      flags.home ??
        join(dependencies.env?.HOME ?? homedir(), ".octo-channel-gateway"),
    );
    const input = dependencies.input ?? process.stdin;
    if (action === "extraset" && (input as NodeJS.ReadStream).isTTY)
      throw new CliUsageError("GATEWAY_STDIN_REQUIRED",
        "Provide a complete JSON configuration through stdin. Copy and adapt the example below, then run it in your shell.", usageHelp);
    if (action === "install" && !["true", "false"].includes(String(parsed.options.autostart)))
      throw new CliUsageError("INVALID_ARGUMENTS", "--autostart must be true or false.", usageHelp);
    if (action === "logs" && (!Number.isInteger(Number(parsed.options.lines)) || Number(parsed.options.lines) < 1 || Number(parsed.options.lines) > 10000))
      throw new CliUsageError("INVALID_ARGUMENTS", "--lines must be an integer between 1 and 10000.", usageHelp);
    const emit = (value: unknown, text?: string) =>
      output(!json && text ? text : JSON.stringify(value, null, 2));
    if (action === "logs") {
      const selected = parsed.options;
      await showChannelLogs({
        home,
        channel: "channel-gateway",
        lines: Number(selected.lines),
        follow: Boolean(selected.follow),
        json,
        output,
        errorOutput,
        signal: dependencies.signal,
      });
      return 0;
    }
    const config = action === "run" || action === "extraget" || business
      ? await readConfig(home)
      : {};
    if (flags.runtimeHome !== undefined &&
        (!flags.runtimeHome.trim() || /[\0\r\n]/.test(flags.runtimeHome)))
      throw new GatewayCommandError(
        "GATEWAY_CONFIG_INVALID",
        "--runtime-home must be a non-empty, single-line directory path.",
      );
    const runtimeHome = resolve(
      flags.runtimeHome ?? join(dependencies.env?.HOME ?? homedir(), ".octo-runtime"),
    );
    const endpoint = runtimeEndpoint(runtimeHome);
    if (business) {
      const controller = new AbortController();
      const stop = () => controller.abort();
      process.once("SIGINT", stop);
      process.once("SIGTERM", stop);
      dependencies.signal?.addEventListener("abort", stop, { once: true });
      if (dependencies.signal?.aborted) stop();
      const context: GatewayCommandContext = {
        name: "channel-gateway",
        home,
        signal: controller.signal,
        interactive: Boolean((input as NodeJS.ReadStream).isTTY),
        ...commandConfig(home, controller.signal),
        output,
        readStdin: () => stdin(input, controller.signal),
        async prompt(question) {
          const terminal = createInterface({ input, output: process.stderr });
          try {
            return await terminal.question(question, {
              signal: controller.signal,
            });
          } finally {
            terminal.close();
          }
        },
      };
      try {
        const result = await business.run!(context, {
          options: parsed.options,
          arguments: parsed.arguments,
        });
        if (result?.value !== undefined || result?.message)
          emit(result.value, result.message);
        return result?.exitCode ?? 0;
      } finally {
        process.off("SIGINT", stop);
        process.off("SIGTERM", stop);
        dependencies.signal?.removeEventListener("abort", stop);
      }
    }
    if (action === "extraget") {
      output(JSON.stringify(config));
      return 0;
    }
    if (action === "extraset") {
      const text = await stdin(input, dependencies.signal);
      if (!text.trim()) throw new CliUsageError("GATEWAY_STDIN_REQUIRED",
        "Provide a complete JSON configuration through stdin. Copy and adapt the example below, then run it in your shell.", usageHelp);
      let value: JsonObject;
      try { value = JSON.parse(text) as JsonObject; }
      catch { throw new CliUsageError("GATEWAY_CONFIG_INVALID", "Input must be valid JSON. Supply one complete configuration object.", usageHelp); }
      if (!value || typeof value !== "object" || Array.isArray(value))
        throw new CliUsageError("GATEWAY_CONFIG_OBJECT_REQUIRED",
          "Supply one JSON configuration object, not an array or primitive value.", usageHelp);
      // 独立 CLI 只接收直接配置，拒绝外壳，避免将错误输入保存为空 Bot 配置。
      if (Object.hasOwn(value, "config") || Object.hasOwn(value, "module"))
        throw new CliUsageError("GATEWAY_CONFIG_INVALID",
          "Supply Gateway configuration directly, with bots at the top level. config and module are not supported fields.", usageHelp);
      const next = value;
      if (Object.hasOwn(next, "material_loading"))
        throw new GatewayCommandError("IM_MATERIAL_API_REMOVED", "Remove material_loading; the material loader has been removed.");
      validateImBots(next.bots ?? []);
      validateRuntimeHomeConfig(next);
      await withConfigLock(home, () => saveConfig(home, next));
      emit(
        { saved: true, file: configFile(home), reload_required: true },
        `Configuration saved: ${configFile(home)}\nRestart the active Gateway to apply. For a foreground run, stop it in its terminal (Ctrl+C) and run it again; service restart only manages the native service.`,
      );
      return 0;
    }
    if (["run", "start"].includes(action))
      await requireRuntime(endpoint);
    if (action === "run") {
      if (!endpoint)
        throw new GatewayCommandError(
          "KERNEL_ENDPOINT_REQUIRED",
          runtimeSetupHelp,
        );
      dependencies.onForeground?.();
      return await run(home, endpoint, config, dependencies, output);
    }
    const backend = dependencies.backend ?? createServiceBackend();
    let spec = serviceSpec(home, false, runtimeHome);
    const inspect = async () => {
      let status = await backend.inspect(spec);
      if (status.enabled)
        status = await backend.inspect({ ...spec, enabled: true });
      if (action === "start" || action === "install") return status;
      // 管理命令没有期望的启动参数；只报告身份/存在性漂移，不能拿默认参数比较已安装定义。
      return {
        ...status,
        definition_comparison: "not_requested",
        drift: status.drift.filter((entry) => ![
          "definition_content", "manager.command", "manager.arguments", "manager.working_directory",
        ].includes(entry)),
      };
    };
    const snapshot = async () => inspectOwnership(home, await inspect());
    if (action === "status" || action === "doctor") {
      const status = await snapshot();
      let kernel: unknown = {
        available: false,
        error: "GATEWAY_UNAVAILABLE",
      };
      const runningEndpoint = "endpoint" in status.runtime ? status.runtime.endpoint : undefined;
      if (action === "doctor" && typeof runningEndpoint === "string" && runningEndpoint) {
        const client = attachKernel({ endpoint: runningEndpoint });
        try {
          kernel = await client.status();
        } catch {
          kernel = { available: false };
        } finally {
          client.close();
        }
      }
      emit(
        {
          ...status,
          ...(action === "doctor"
            ? { manager: await backend.probe(), kernel }
            : {}),
        },
        `Service: ${status.service.state}\nManaged Gateway: ${status.ownership.ready ? "ready" : "unconfirmed"}\n${ownershipMessage(status)}${action === "doctor" ? `\nKernel: ${"execution_ready" in (kernel as object) ? ((kernel as { execution_ready: boolean }).execution_ready ? "ready" : "unready") : "unavailable"}` : ""}\nLogs: ${join(home, "logs")}`,
      );
      return 0;
    }
    return await withConfigLock(home, async () => {
      const before = await snapshot();
      if (["install", "start", "restart"].includes(action)) assertLaunchAllowed(before);
      const safeCode = (value: unknown) => {
        const code = value instanceof Error && "code" in value ? value.code
          : value instanceof Error ? value.message : undefined;
        return typeof code === "string" && /^[A-Z][A-Z0-9_]{1,95}$/.test(code) ? code : "GATEWAY_SERVICE_COMMAND_FAILED";
      };
      const stopAttempt = async () => {
        try {
          await backend.stop(spec);
          return "The attempted managed service was stopped.";
        } catch (error) {
          return `Managed service cleanup failed (${safeCode(error)}); inspect the native manager to stop its retries.`;
        }
      };
      // 保留已确认的原实例；新启动无法关联 PID 也必须清理原生任务，不能留下无人认领的重试。
      const isOriginalProcess = (current: Awaited<ReturnType<typeof snapshot>>) =>
        before.ownership.manager_pid !== undefined && current.ownership.manager_pid === before.ownership.manager_pid;
      let launchAttempted = false;
      const cleanupUnconfirmed = async (current?: Awaited<ReturnType<typeof snapshot>>) => {
        if (current ? isOriginalProcess(current) : before.ownership.manager_pid !== undefined)
          return current ? "The original managed process was retained."
            : "Ownership and cleanup could not be confirmed; the previously identified managed process was retained. Inspect the native manager before retrying.";
        return await stopAttempt();
      };
      const readLaunchSnapshot = async () => {
        try { return await snapshot(); }
        catch (error) {
          const cleanup = launchAttempted ? await cleanupUnconfirmed() : "No managed launch was requested.";
          throw new GatewayCommandError("GATEWAY_UNAVAILABLE",
            `Native ${action} status could not be read (${safeCode(error)}). ${cleanup}`);
        }
      };
      try {
        if (action === "install") {
          const auto = parsed.options.autostart;
          if (auto !== "true" && auto !== "false")
            throw new Error("INVALID_ARGUMENTS");
          spec = { ...spec, enabled: auto === "true" };
          launchAttempted = ["running", "starting"].includes(before.service.state);
          await backend.install(spec);
        } else if (action === "start") {
          // 每次 start 的命令行都是期望定义；先同步参数，保证已安装服务不会沿用旧 Runtime。
          const installed = await backend.inspect(spec);
          spec = {
            ...spec,
            enabled: installed.state === "not_installed" ? true : installed.enabled,
          };
          launchAttempted = true;
          await backend.install(spec);
          await backend.start(spec);
        } else if (action === "restart") {
          // 后端重启已安装定义，不能用当前命令默认值覆盖持久化 argv。
          launchAttempted = true;
          await backend.restart(spec);
        } else if (action === "stop") await backend.stop(spec);
        else if (action === "uninstall") await backend.uninstall(spec);
        else throw new Error("INVALID_ARGUMENTS");
      } catch (error) {
        // 原生 start/restart 可在抢锁失败后直接返回非零；仍须核对归属并停止托管重试。
        if (launchAttempted) {
          const failed = await snapshot().catch(() => undefined);
          // 原生命令可在受理启动后失败；即使 lock/IPC 尚未建立或观测失败，也不能遗漏清理。
          if (failed && (failed.ownership.ready || isOriginalProcess(failed))) throw error;
          const cleanup = await cleanupUnconfirmed(failed);
          throw new GatewayCommandError(failed?.ownership.state === "unmanaged" ? "GATEWAY_HOME_OCCUPIED" : "GATEWAY_UNAVAILABLE",
            `${failed ? ownershipMessage(failed) : "Gateway ownership could not be read."}\nNative ${action} failed (${safeCode(error)}). ${cleanup}`);
        }
        throw error;
      }
      if (action === "install") {
        const installed = await readLaunchSnapshot();
        if (installed.ownership.state === "unmanaged" || installed.ownership.state === "unknown") {
          const cleanup = await cleanupUnconfirmed(installed);
          throw new GatewayCommandError("GATEWAY_HOME_OCCUPIED", `${ownershipMessage(installed)}\n${cleanup}`);
        }
      }
      if (action === "start" || action === "restart") {
        const end = Date.now() + (dependencies.readyTimeoutMs ?? 30_000);
        while (true) {
          const current = await readLaunchSnapshot();
          const replaced = action !== "restart" || before.ownership.manager_pid === undefined ||
            current.ownership.manager_pid !== before.ownership.manager_pid;
          if (current.ownership.ready && replaced) break;
          if (Date.now() >= end) {
            // 短暂交接可以等待；截止后原生任务仍存在但身份未知时也停止本次启动。
            const cleanup = await cleanupUnconfirmed(current);
            throw new GatewayCommandError(current.ownership.state === "unmanaged" ? "GATEWAY_HOME_OCCUPIED" : "GATEWAY_UNAVAILABLE",
              `The manager accepted ${action}, but readiness of the intended ${action === "restart" ? "replacement " : ""}process was not confirmed.\n${ownershipMessage(current)}\n${cleanup}`);
          }
          await delay(100);
        }
      }
      const after = await snapshot();
      const remaining = ["stop", "uninstall"].includes(action) && ["unmanaged", "unknown"].includes(after.ownership.state);
      emit(
        { action, ...after, ...(remaining ? { warning: "GATEWAY_INSTANCE_REMAINS" } : {}) },
        `${action} succeeded${remaining ? `; an unmanaged or unverified Gateway may remain\n${ownershipMessage(after)}` : ""}\nLogs: ${join(home, "logs")}`,
      );
      return 0;
    });
  } catch (error) {
    const candidate =
      error instanceof GatewayCommandError
        ? error.code
        : error &&
            typeof error === "object" &&
            "code" in error &&
            typeof error.code === "string"
          ? error.code
          : error instanceof Error
            ? error.message
            : "";
    const code = /^[A-Z][A-Z0-9_]{1,95}$/.test(candidate)
      ? candidate
      : "GATEWAY_COMMAND_FAILED";
    const message = error instanceof GatewayCommandError
      ? error.message
      : code === "IM_AGENT_MCP_INVALID"
        ? "agent.mcp must contain valid MCP server definitions. See the optional execution configuration documentation."
      : code === "IM_AGENT_ENVS_INVALID"
        ? "agent.envs must contain valid env_variables key/value entries. See the optional execution configuration documentation."
      : code === "INVALID_ARGUMENTS"
        ? "Invalid command arguments. Use --help to see the available commands and flags."
        : code;
    (json ? output : errorOutput)(
      json
        ? JSON.stringify({ error: { code, message } })
        : error instanceof CliUsageError
          ? `${message}\n\n${error.help}`
          : `${code}: ${message}${/INVALID|REQUIRED/.test(code) && usageHelp ? `\n\n${usageHelp}` : ""}`,
    );
    return /INCOMPLETE|DISPOSE_FAILED/.test(code)
      ? 5
      : /UNAVAILABLE/.test(code)
        ? 4
        : /NOT_INSTALLED/.test(code)
          ? 3
          : /INVALID|REQUIRED/.test(code)
            ? 2
            : 1;
  }
}
