import { createHash } from "node:crypto";
import { posix, win32 } from "node:path";
import { GatewayCommandError, type JsonObject } from "./command-types.js";

export function validateRuntimeHomeConfig(config: JsonObject): void {
  if (["runtime_home", "endpoint", "runtime_endpoint"].some((key) => Object.hasOwn(config, key)))
    throw new GatewayCommandError("GATEWAY_CONFIG_INVALID", "Runtime connection settings are not business configuration. Use start/run --runtime-home <path> instead.");
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
