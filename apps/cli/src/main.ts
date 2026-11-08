import { Command, CommanderError, Option } from "commander";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { lstat, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createInterface } from "node:readline/promises";
import { setTimeout as delay } from "node:timers/promises";
import { attachKernel } from "@mininglamp-oss/octo-runtime-client";
import {
  ChannelRegistry,
  type ChannelRegistration,
  type ImBotConfig,
} from "../../../packages/gateway/src/index.js";
import { validateImBots } from "../../../packages/gateway/src/lifecycle/configuration.js";
import { RuntimeLogging } from "../../../packages/gateway/src/support/runtime-log.js";
import type { JsonObject } from "../../../packages/gateway/src/support/types.js";
import {
  createServiceBackend,
  type ServiceBackend,
  type ServiceSpec,
} from "./service/index.js";
import {
  GatewayCommandError,
  type GatewayCommand,
  type GatewayCommandContext,
} from "./command-types.js";
import commands from "./commands.js";
import { requireRuntime, runtimeSetupHelp } from "./runtime-prerequisite.js";
import {
  commandConfig,
  configFile,
  readConfig,
  saveConfig,
  withConfigLock,
} from "./config.js";
import { acquireProcessLock } from "./lock.js";
import { readStatus, serveStatus } from "./control.js";
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
const version = (
  JSON.parse(
    readFileSync(new URL("../../../../package.json", import.meta.url), "utf8"),
  ) as { version: string }
).version;

/** 服务只托管 Gateway；endpoint 保存进系统定义，不能启动/安装共享 Runtime。 */
export function serviceSpec(
  home: string,
  endpoint?: string,
  enabled = false,
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
      ...(endpoint ? ["--endpoint", endpoint] : []),
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
  const release = await acquireProcessLock(join(home, "service.lock"));
  const registrations: ChannelRegistration[] = [];
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
    if (config.enabled !== false)
      for (const bot of bots) {
        controller.signal.throwIfAborted();
        registrations.push(
          await ChannelRegistry.register(endpoint, {
            bot: bot as ImBotConfig,
            log,
            signal: controller.signal,
            contextLoading: config.context_loading as
              { timeout_ms?: number; max_in_flight?: number } | undefined,
            authorizeSpace: spaces
              ? (spaceId) => {
                  if (!spaces.includes(spaceId))
                    throw new Error("IM_TENANT_NOT_ACTIVE");
                }
              : undefined,
          }),
        );
      }
    controller.signal.throwIfAborted();
    closeStatus = await serveStatus(home, () => ({
      pid: process.pid,
      phase: "ready",
      endpoint,
      bots: registrations.flatMap((registration) => [...registration.status]),
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
        ...registrations.map((registration) => registration.close()),
        Promise.resolve().then(() => closeStatus?.()),
      ]);
      logger?.channel("channel-gateway")("info", "service.closed", {
        state: "closed",
      });
      await logger?.close();
      if (cleanup.some((result) => result.status === "rejected"))
        throw new Error("IM_DISPOSE_FAILED");
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
  let json = raw.includes("--json");
  let help = "",
    action = "";
  let business: GatewayCommand | undefined;
  const command = new Command("octo-channel-gateway")
    .description("Octo Channel Gateway SDK and service CLI")
    .exitOverride()
    .configureOutput({
      writeOut(text) {
        help += text;
      },
      writeErr() {},
    })
    .option("--home <path>", "Gateway Home directory")
    .option("--endpoint <path>", "Existing Runtime Kernel socket or named pipe")
    .option("--json", "Print JSON")
    .version(version);
  for (const name of [
    "doctor",
    "install",
    "uninstall",
    "start",
    "stop",
    "restart",
    "status",
    "run",
    "logs",
    "extraset",
    "extraget",
  ]) {
    const child = command.command(name).description(`${name} Channel Gateway`);
    if (["extraset", "extraget"].includes(name)) child.argument("[component]");
    if (name === "install")
      child.option("--autostart <boolean>", "Automatic startup", "true");
    if (name === "logs")
      child
        .option("--lines <count>", "Number of log lines", "200")
        .option("--follow", "Follow logs");
    child.action(() => {
      if (child.args.length && child.args[0] !== "channel-gateway")
        throw new Error("INVALID_ARGUMENTS");
      action = name;
    });
  }
  for (const definition of commands.commands) {
    const child = command
      .command(definition.name)
      .description(definition.description);
    for (const option of definition.options ?? [])
      child.addOption(
        new Option(
          `--${option.name}${option.type === "string" ? " <value>" : ""}`,
          option.description,
        ).makeOptionMandatory(Boolean(option.required)),
      );
    child.action(() => {
      action = definition.name;
      business = definition;
    });
  }
  try {
    // 保留原组件层级的用法，同时提供独立二进制的平铺命令。
    const args = raw.map((item) =>
      /^--(?:json)=/.test(item) ? "--json" : item,
    );
    for (let index = 0; index < args.length; index++) {
      if (["--home", "--endpoint"].includes(args[index])) {
        index++;
        continue;
      }
      if (args[index].startsWith("-")) continue;
      if (args[index] === "help") continue;
      if (args[index] === "channel-gateway") args.splice(index, 1);
      break;
    }
    command.parse(args, { from: "user" });
    if (help || !action) {
      output(help.trimEnd() || command.helpInformation().trimEnd());
      return 0;
    }
    const flags = command.opts<{
      home?: string;
      endpoint?: string;
      json?: boolean;
    }>();
    json = Boolean(flags.json);
    const home = resolve(
      flags.home ??
        join(dependencies.env?.HOME ?? homedir(), ".octo-channel-gateway"),
    );
    const input = dependencies.input ?? process.stdin;
    const emit = (value: unknown, text?: string) =>
      output(!json && text ? text : JSON.stringify(value, null, 2));
    if (action === "logs") {
      const selected = command.commands
        .find((child) => child.name() === "logs")!
        .opts<{ lines: string; follow?: boolean }>();
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
    const config = await readConfig(home);
    const endpoint =
      flags.endpoint ??
      (typeof config.endpoint === "string" ? config.endpoint : undefined);
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
        const selected = command.commands.find(
          (child) => child.name() === action,
        )!;
        const result = await business.run!(context, {
          options: selected.opts<Record<string, string | boolean>>(),
          arguments: selected.args,
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
      const value = JSON.parse(
        await stdin(input, dependencies.signal),
      ) as JsonObject;
      if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error("GATEWAY_CONFIG_OBJECT_REQUIRED");
      // 接受旧命令的 config 外壳，仅保存 Gateway 自身设置，不解析插件 module。
      const next =
        value.config &&
        typeof value.config === "object" &&
        !Array.isArray(value.config)
          ? {
              ...value.config,
              ...(value.enabled === undefined
                ? {}
                : { enabled: value.enabled }),
            }
          : value;
      delete next.module;
      validateImBots(next.bots ?? []);
      await withConfigLock(home, () =>
        saveConfig(home, { ...next, ...(endpoint ? { endpoint } : {}) }),
      );
      emit(
        { saved: true, file: configFile(home), reload_required: true },
        `Configuration saved: ${configFile(home)}\nRestart Channel Gateway to apply.`,
      );
      return 0;
    }
    if (["run", "start", "restart"].includes(action))
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
    let spec = serviceSpec(home, endpoint);
    const inspect = async () => {
      let status = await backend.inspect(spec);
      if (status.enabled)
        status = await backend.inspect({ ...spec, enabled: true });
      return status;
    };
    const snapshot = async () => ({
      service: await inspect(),
      runtime: await readStatus(home).catch(() => ({ available: false })),
    });
    if (action === "status" || action === "doctor") {
      const status = await snapshot();
      let kernel: unknown = {
        available: false,
        error: "KERNEL_ENDPOINT_REQUIRED",
      };
      if (endpoint) {
        const client = attachKernel({ endpoint });
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
        `Service: ${status.service.state}\nGateway: ${"pid" in status.runtime ? "ready" : "unavailable"}${action === "doctor" ? `\nKernel: ${"execution_ready" in (kernel as object) ? ((kernel as { execution_ready: boolean }).execution_ready ? "ready" : "unready") : "unavailable"}` : ""}\nLogs: ${join(home, "logs")}`,
      );
      return 0;
    }
    return await withConfigLock(home, async () => {
      if (["install", "start", "restart"].includes(action) && !endpoint)
        throw new GatewayCommandError(
          "KERNEL_ENDPOINT_REQUIRED",
          runtimeSetupHelp,
        );
      if (action === "install") {
        const auto = command.commands
          .find((child) => child.name() === "install")!
          .opts<{ autostart: string }>().autostart;
        if (!["true", "false"].includes(auto))
          throw new Error("INVALID_ARGUMENTS");
        spec = { ...spec, enabled: auto === "true" };
        await backend.install(spec);
        await saveConfig(home, {
          ...(await readConfig(home)),
          endpoint: endpoint!,
        });
      } else if (action === "start") {
        if ((await backend.inspect(spec)).state === "not_installed") {
          spec = { ...spec, enabled: true };
          await backend.install(spec);
          await saveConfig(home, {
            ...(await readConfig(home)),
            endpoint: endpoint!,
          });
        }
        await backend.start(spec);
      } else if (action === "restart") await backend.restart(spec);
      else if (action === "stop") await backend.stop(spec);
      else if (action === "uninstall") await backend.uninstall(spec);
      else throw new Error("INVALID_ARGUMENTS");
      if (action === "start" || action === "restart") {
        const end = Date.now() + (dependencies.readyTimeoutMs ?? 30_000);
        while (true) {
          try {
            await readStatus(home);
            break;
          } catch {
            if (Date.now() >= end) throw new Error("GATEWAY_UNAVAILABLE");
            await delay(100);
          }
        }
      }
      emit(
        { action, service: await inspect() },
        `${action} succeeded\nLogs: ${join(home, "logs")}`,
      );
      return 0;
    });
  } catch (error) {
    if (
      error instanceof CommanderError &&
      ["commander.helpDisplayed", "commander.version"].includes(error.code)
    ) {
      output(help.trimEnd());
      return 0;
    }
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
    const code =
      error instanceof CommanderError
        ? "INVALID_ARGUMENTS"
        : /^[A-Z][A-Z0-9_]{1,95}$/.test(candidate)
          ? candidate
          : "GATEWAY_COMMAND_FAILED";
    const message = error instanceof GatewayCommandError ? error.message : code;
    (json ? output : errorOutput)(
      json
        ? JSON.stringify({ error: { code, message } })
        : `${code}: ${message}`,
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
