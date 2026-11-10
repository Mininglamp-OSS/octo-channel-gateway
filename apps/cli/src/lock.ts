import { createHash, randomUUID } from "node:crypto";
import { link, lstat, open, readFile, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { processStartIdentity } from "./process-identity.js";

export async function acquireProcessLock(
  path: string,
): Promise<() => Promise<void>> {
  const startIdentity = await processStartIdentity(process.pid);
  const record = `${JSON.stringify({ pid: process.pid, id: randomUUID(), startIdentity })}\n`;
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  const handle = await open(temporary, "wx", 0o600);
  try {
    try {
      await handle.writeFile(record, "utf8");
    } finally {
      await handle.close();
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await link(temporary, path);
        return async () => {
          if ((await readLockOwner(path))?.record === record)
            await rm(path, { force: true });
        };
      } catch (error) {
        if (!isNodeError(error, "EEXIST")) throw error;
        const owner = await readLockOwner(path);
        // 旧格式的不完整记录仍需保守拒绝；不能根据时间猜测它已失效。
        if (!owner || (await ownerState(owner)) !== "stale")
          throw new Error("SETUP_IN_PROGRESS", { cause: error });
        // 只哈希文件名，使同一 Home 的不同符号链接路径仍争用同一个回收锁。
        const reclaim = join(
          dirname(path),
          `.reclaim-${createHash("sha256").update(basename(path)).digest("hex")}`,
        );
        const release = await acquireProcessLock(reclaim);
        try {
          const current = await readLockOwner(path);
          if (
            !current ||
            current.record !== owner.record ||
            (await ownerState(current)) !== "stale"
          )
            throw new Error("SETUP_IN_PROGRESS", { cause: error });
          await rm(path, { force: true });
        } finally {
          await release();
        }
      }
    }
    throw new Error("could not acquire setup lock");
  } finally {
    await rm(temporary, { force: true });
  }
}

async function readLockOwner(
  path: string,
): Promise<{ pid: number; record: string; startIdentity?: string } | undefined> {
  try {
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 4096)
      return undefined;
    const record = await readFile(path, "utf8");
    const value = JSON.parse(record) as { pid?: unknown; startIdentity?: unknown };
    if (
      value.startIdentity !== undefined &&
      (typeof value.startIdentity !== "string" ||
        !value.startIdentity ||
        value.startIdentity.length > 1024)
    ) return undefined;
    return typeof value.pid === "number" &&
      Number.isSafeInteger(value.pid) &&
      value.pid > 0
      ? {
          pid: value.pid,
          record,
          startIdentity: value.startIdentity as string | undefined,
        }
      : undefined;
  } catch {
    return undefined;
  }
}

export function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return isNodeError(error, "EPERM");
  }
}

/** 只读诊断，不回收文件；无法识别的锁必须由人工检查，不能推断为失效。 */
export async function inspectProcessLock(path: string): Promise<{
  state: "missing" | "live" | "stale" | "unknown";
  pid?: number;
}> {
  try {
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 4096)
      return { state: "unknown" };
    const owner = await readLockOwner(path);
    if (!owner) return { state: "unknown" };
    return { state: await ownerState(owner), pid: owner.pid };
  } catch (error) {
    return { state: isNodeError(error, "ENOENT") ? "missing" : "unknown" };
  }
}

/** 死 PID 或明确不同的启动标记才可回收；旧记录与查询失败均不冒充活体身份确认。 */
async function ownerState(owner: {
  pid: number;
  startIdentity?: string;
}): Promise<"live" | "stale" | "unknown"> {
  if (!processAlive(owner.pid)) return "stale";
  if (!owner.startIdentity) return "unknown";
  const current = await processStartIdentity(owner.pid);
  if (!current) return processAlive(owner.pid) ? "unknown" : "stale";
  return current === owner.startIdentity ? "live" : "stale";
}

function isNodeError(error: unknown, code: string): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === code
  );
}
