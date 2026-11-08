import net from "node:net";
import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import { lstat, rm } from "node:fs/promises";

/** CLI 私有状态端点；不进入 Kernel 协议，不转发业务调用。 */
export function controlEndpoint(home: string): string {
  const hash = createHash("sha256")
    .update(process.platform === "win32" ? home.toLowerCase() : home)
    .digest("hex")
    .slice(0, 16);
  return process.platform === "win32"
    ? `\\\\.\\pipe\\octo-channel-gateway-${hash}`
    : join(home, "gateway.sock");
}
export async function serveStatus(
  home: string,
  snapshot: () => unknown,
): Promise<() => Promise<void>> {
  const endpoint = controlEndpoint(home);
  // 调用方已取得进程锁；只回收旧 socket，普通文件和符号链接不能被替换。
  if (process.platform !== "win32") {
    const stat = await lstat(endpoint).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
    if (stat) {
      if (!stat.isSocket() || stat.isSymbolicLink())
        throw new Error("GATEWAY_ENDPOINT_OCCUPIED");
      await rm(endpoint);
    }
  }
  const sockets = new Set<net.Socket>();
  const server = net.createServer((socket) => {
    if (sockets.size >= 16) {
      socket.destroy();
      return;
    }
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
    socket.on("error", () => {});
    socket.setTimeout(1000, () => socket.destroy());
    let bytes = "";
    socket.on("data", (chunk: Buffer) => {
      bytes += chunk.toString("utf8");
      if (Buffer.byteLength(bytes) > 4096) {
        socket.destroy();
        return;
      }
      if (!bytes.includes("\n")) return;
      try {
        const request = JSON.parse(bytes.slice(0, bytes.indexOf("\n"))) as {
          method?: unknown;
          id?: unknown;
        };
        if (
          request.method !== "status" ||
          typeof request.id !== "string" ||
          request.id.length > 128
        ) {
          socket.destroy();
          return;
        }
        socket.end(
          JSON.stringify({ id: request.id, result: snapshot() }) + "\n",
        );
      } catch {
        socket.destroy();
      }
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(endpoint, () => {
      server.off("error", reject);
      resolve();
    });
  });
  server.on("error", () => {});
  let closing: Promise<void> | undefined;
  const close = () =>
    (closing ??= (async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    })());
  try {
    if (process.platform !== "win32") {
      const { chmod } = await import("node:fs/promises");
      await chmod(endpoint, 0o600);
    }
    return close;
  } catch (error) {
    await close();
    throw error;
  }
}
export async function readStatus(
  home: string,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(controlEndpoint(home));
    const id = randomUUID();
    const fail = () => {
      socket.destroy();
      reject(new Error("GATEWAY_UNAVAILABLE"));
    };
    socket.setTimeout(1000, fail);
    socket.once("error", fail);
    socket.once("connect", () =>
      socket.write(JSON.stringify({ id, method: "status" }) + "\n"),
    );
    let bytes = "";
    socket.on("data", (chunk: Buffer) => {
      bytes += chunk.toString("utf8");
      if (Buffer.byteLength(bytes) > 65536) {
        fail();
        return;
      }
      if (!bytes.includes("\n")) return;
      try {
        const response = JSON.parse(bytes.slice(0, bytes.indexOf("\n"))) as {
          id?: unknown;
          result?: Record<string, unknown>;
        };
        if (
          response.id !== id ||
          !response.result ||
          typeof response.result.pid !== "number"
        )
          throw new Error("INVALID_RESPONSE");
        resolve(response.result);
        socket.destroy();
      } catch {
        fail();
      }
    });
    socket.once("end", () => {
      if (!bytes.includes("\n")) fail();
    });
  });
}
