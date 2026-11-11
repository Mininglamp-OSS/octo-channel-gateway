import { join } from "node:path";
import type { ServiceStatus } from "@mininglamp-oss/octo-channel-gateway-cross-service";
import { readStatus } from "./control.js";
import { inspectProcessLock, processAlive } from "./lock.js";
import { GatewayCommandError } from "./command-types.js";

/** 管理器、锁与 IPC 分别取证，任何单一状态均不能证明托管进程就绪。 */
export async function inspectOwnership(home: string, service: ServiceStatus) {
  const lock = await inspectProcessLock(join(home, "service.lock"));
  const runtime = await readStatus(home).catch(() => ({ available: false } as Record<string, unknown>));
  const runtimePid = typeof runtime.pid === "number" && processAlive(runtime.pid) ? runtime.pid : undefined;
  const managerPid = Number.isSafeInteger(service.pid) && service.pid! > 0 ? service.pid : undefined;
  const ownerPid = lock.state === "live" ? lock.pid : runtimePid;
  const mismatch = ownerPid !== undefined && managerPid !== undefined && ownerPid !== managerPid;
  const conflictingIpc = runtimePid !== undefined && lock.state === "live" && runtimePid !== lock.pid;
  const state = conflictingIpc ? "unknown"
    : mismatch || (ownerPid !== undefined && ["not_installed", "stopped", "failed"].includes(service.state)) ? "unmanaged"
    : ownerPid !== undefined && managerPid === ownerPid && lock.state === "live" ? "managed"
    : ownerPid === undefined && ["missing", "stale"].includes(lock.state) ? "none" : "unknown";
  const ready = state === "managed" && service.state === "running" && runtimePid === managerPid && runtime.phase === "ready";
  const ownership = { state, home, manager_pid: managerPid, lock_pid: lock.pid, runtime_pid: runtimePid,
    lock_state: lock.state, ready, config_loaded: "not_verified" };
  return { service, runtime, ownership };
}

export type OwnershipSnapshot = Awaited<ReturnType<typeof inspectOwnership>>;

export function ownershipMessage({ ownership: owner }: OwnershipSnapshot): string {
  const detail = `Home: ${owner.home}\nOwnership: ${owner.state}\nManager PID: ${owner.manager_pid ?? "unavailable"}; lock PID: ${owner.lock_pid ?? "unavailable"}; IPC PID: ${owner.runtime_pid ?? "unavailable"}`;
  const action = owner.state === "unmanaged"
    ? "Stop the foreground run in its terminal (Ctrl+C), or stop the identified owner after checking it, then run start. Do not delete a live service.lock or gateway.sock."
    : owner.state === "unknown"
      ? "Ownership cannot be confirmed. Check the native service manager and the lock owner before retrying."
      : "";
  return `${detail}${action ? `\n${action}` : ""}\nSaved configuration is not verified as loaded; a foreground run must be restarted in its terminal.`;
}

export function assertLaunchAllowed(snapshot: OwnershipSnapshot): void {
  if (["unmanaged", "unknown"].includes(snapshot.ownership.state))
    throw new GatewayCommandError("GATEWAY_HOME_OCCUPIED", ownershipMessage(snapshot));
}
