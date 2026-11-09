import { createHash } from "node:crypto";
import { isAbsolute, posix, win32 } from "node:path";
import { GatewayCommandError, type JsonObject } from "./command-types.js";

export function validateRuntimeHomeConfig(config: JsonObject): void {
  if (Object.hasOwn(config, "endpoint") || Object.hasOwn(config, "runtime_endpoint"))
    throw new GatewayCommandError("GATEWAY_CONFIG_INVALID", "Use runtime_home instead of endpoint/runtime_endpoint; provide the Runtime directory, not its socket.");
  if (config.runtime_home !== undefined &&
      (typeof config.runtime_home !== "string" || !config.runtime_home.trim() || !isAbsolute(config.runtime_home) || config.runtime_home.includes("\0")))
    throw new GatewayCommandError("GATEWAY_CONFIG_INVALID", "runtime_home must be an absolute directory path; omit it to use ~/.octo-runtime.");
}

/** 只计算公开 Runtime 地址约定，不访问 Runtime Home 或依赖私有 SDK。 */
export function runtimeEndpoint(
  runtimeHome: string,
  platform: NodeJS.Platform = process.platform,
): string {
  if (platform === "win32") {
    const home = win32.resolve(runtimeHome).toLowerCase();
    const hash = createHash("sha256").update(home).digest("hex").slice(0, 16);
    return `\\\\.\\pipe\\octo-runtime-kernel-${hash}`;
  }
  return posix.join(posix.resolve(runtimeHome), "executor-kernel.sock");
}
