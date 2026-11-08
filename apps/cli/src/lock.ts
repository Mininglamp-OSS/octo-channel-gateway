import { createHash, randomUUID } from "node:crypto";
import { link, open, readFile, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
export async function acquireProcessLock(
  path: string,
): Promise<() => Promise<void>> {
  const record = `${JSON.stringify({ pid: process.pid, id: randomUUID() })}\n`;
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
        if (!owner || processAlive(owner.pid))
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
            processAlive(current.pid)
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
): Promise<{ pid: number; record: string } | undefined> {
  try {
    const record = await readFile(path, "utf8");
    const value = JSON.parse(record) as { pid?: unknown };
    return typeof value.pid === "number" &&
      Number.isSafeInteger(value.pid) &&
      value.pid > 0
      ? { pid: value.pid, record }
      : undefined;
  } catch {
    return undefined;
  }
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return isNodeError(error, "EPERM");
  }
}

function isNodeError(error: unknown, code: string): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === code
  );
}
