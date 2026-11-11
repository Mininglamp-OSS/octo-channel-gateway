import { constants } from "node:fs";
import { chmod, lstat, mkdir, open, rename, rm } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import type { JsonObject } from "@mininglamp-oss/octo-channel-gateway-sdk/host/types";
import type { GatewayCommandContext } from "./command-types.js";
import { acquireProcessLock } from "./lock.js";

export const configFile = (home: string) => join(home, "config.json");
const revision = (value: JsonObject) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

/** 凭据配置只通过已打开的普通文件读取；文件缺失与损坏/权限失败区分。 */
export async function readConfig(home: string): Promise<JsonObject> {
  const path = configFile(home);
  let handle;
  try {
    handle = await open(
      path,
      constants.O_RDONLY |
        (constants.O_NOFOLLOW ?? 0) |
        (constants.O_NONBLOCK ?? 0),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
  try {
    const stat = await handle.stat();
    const link = await lstat(path);
    if (
      !stat.isFile() ||
      stat.nlink !== 1 ||
      link.isSymbolicLink() ||
      stat.ino !== link.ino ||
      stat.dev !== link.dev
    )
      throw new Error("GATEWAY_CONFIG_FILE_INVALID");
    if (process.platform !== "win32" && stat.mode & 0o077)
      throw new Error("GATEWAY_CONFIG_PERMISSIONS_INVALID");
    if (stat.size > 1024 * 1024) throw new Error("GATEWAY_CONFIG_TOO_LARGE");
    const buffer = Buffer.alloc(1024 * 1024 + 1);
    let count = 0;
    while (count < buffer.length) {
      const { bytesRead } = await handle.read(
        buffer,
        count,
        buffer.length - count,
        null,
      );
      if (!bytesRead) break;
      count += bytesRead;
    }
    if (count > 1024 * 1024) throw new Error("GATEWAY_CONFIG_TOO_LARGE");
    const value: unknown = JSON.parse(
      buffer.subarray(0, count).toString("utf8"),
    );
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error("GATEWAY_CONFIG_OBJECT_REQUIRED");
    return value as JsonObject;
  } finally {
    await handle.close();
  }
}

/** 原子替换自身配置；操作锁与修订校验阻止 configure 的丢失更新。 */
export async function withConfigLock<T>(
  home: string,
  action: () => Promise<T>,
): Promise<T> {
  await mkdir(home, { recursive: true, mode: 0o700 });
  const stat = await lstat(home);
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw new Error("GATEWAY_HOME_INVALID");
  const release = await acquireProcessLock(join(home, "config.lock"));
  try {
    return await action();
  } finally {
    await release();
  }
}
export async function saveConfig(
  home: string,
  config: JsonObject,
): Promise<void> {
  const text = JSON.stringify(config, null, 2) + "\n";
  if (Buffer.byteLength(text) > 1024 * 1024)
    throw new Error("GATEWAY_CONFIG_TOO_LARGE");
  const target = configFile(home),
    temporary = `${target}.${randomUUID()}.tmp`;
  try {
    const handle = await open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(text);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, target);
    if (process.platform !== "win32") await chmod(target, 0o600);
  } finally {
    await rm(temporary, { force: true });
  }
}
export function commandConfig(
  home: string,
  signal: AbortSignal,
): Pick<GatewayCommandContext, "readConfig" | "saveConfig"> {
  return {
    async readConfig() {
      signal.throwIfAborted();
      const config = await readConfig(home);
      return { config, revision: revision(config) };
    },
    async saveConfig(config, expected) {
      signal.throwIfAborted();
      const copy = structuredClone(config);
      return withConfigLock(home, async () => {
        signal.throwIfAborted();
        if (revision(await readConfig(home)) !== expected)
          throw new Error("GATEWAY_CONFIG_CONFLICT");
        await saveConfig(home, copy);
        return {
          saved: true,
          name: "channel-gateway",
          file: configFile(home),
          reload_required: true,
        };
      });
    },
  };
}
