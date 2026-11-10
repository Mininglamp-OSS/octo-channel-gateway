import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

const execute = promisify(execFile);

/**
 * 启动标记只用于识别明确的 PID 复用，不是授权证明。
 * macOS ps 只有秒精度：同秒复用可能仍被保守阻止；查询失败不允许删除活进程的锁。
 */
export async function processStartIdentity(
  pid: number,
): Promise<string | undefined> {
  if (!Number.isSafeInteger(pid) || pid <= 0) return undefined;
  try {
    if (process.platform === "linux") {
      const [stat, boot] = await Promise.all([
        readFile(`/proc/${pid}/stat`, "utf8"),
        readFile("/proc/sys/kernel/random/boot_id", "utf8"),
      ]);
      // comm 可包含空格与括号，字段3从最后一个右括号之后开始。
      const fields = stat
        .slice(stat.lastIndexOf(")") + 2)
        .trim()
        .split(/\s+/);
      const start = fields[19];
      if (!/^\d+$/.test(start ?? "") || !/^[a-f0-9-]+$/i.test(boot.trim()))
        return undefined;
      return `linux:${boot.trim()}:${start}`;
    }
    if (process.platform === "darwin") {
      const { stdout } = await execute("/bin/ps", ["-p", String(pid), "-o", "lstart="], {
        timeout: 1500,
        maxBuffer: 4096,
        env: { ...process.env, LC_ALL: "C", TZ: "UTC" },
      });
      const value = stdout.trim().replace(/\s+/g, " ");
      if (!/^[A-Z][a-z]{2} [A-Z][a-z]{2} \d{1,2} \d{2}:\d{2}:\d{2} \d{4}$/.test(value))
        return undefined;
      return `darwin:${value}`;
    }
    if (process.platform === "win32") {
      const script = `$ErrorActionPreference='Stop'; $p=Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}'; if ($null -ne $p -and $null -ne $p.CreationDate) { $p.CreationDate.ToUniversalTime().Ticks.ToString([System.Globalization.CultureInfo]::InvariantCulture) }`;
      const { stdout } = await execute("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
        timeout: 3000,
        maxBuffer: 4096,
        windowsHide: true,
      });
      const value = stdout.trim();
      return /^\d+$/.test(value) ? `win32:${value}` : undefined;
    }
  } catch {
    // 缺少工具、权限不足或进程在查询期间退出，统一留给调用方保守处理。
  }
  return undefined;
}
