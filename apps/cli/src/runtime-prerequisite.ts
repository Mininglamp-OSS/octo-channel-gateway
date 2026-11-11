import { attachKernel } from "@mininglamp-oss/octo-runtime-client";
import { GatewayCommandError } from "./command-types.js";

/** 固定操作指引，不拼接配置、凭据或底层异常正文。 */
export const runtimeSetupHelp = [
  "Channel Gateway 的 CLI 和 SDK 模式都需要已就绪的 octo-runtime Kernel（1.1.14 起 / IPC v2）。",
  "1. 安装当前发行版（最低 1.1.14，支持 1.x）：npm install -g @mininglamp-oss/octo-runtime@latest",
  "2. 启动 Runtime：octo-runtime start",
  "3. 检查 Runtime：octo-runtime doctor --json",
  "4. Gateway 默认连接 ~/.octo-runtime 中的 Kernel；自定义位置用 start/run --runtime-home 指定 Runtime 目录。",
  "Gateway --home 默认 ~/.octo-channel-gateway，仅保存自己的配置和日志。自定义 Runtime Home 时，Runtime 启动和诊断须使用同一 --home。",
].join("\n");

/** 启动前只查询公开 client；不安装、启动或关闭共享 Runtime。 */
export async function requireRuntime(
  endpoint: string | undefined,
): Promise<void> {
  if (!endpoint)
    throw new GatewayCommandError("KERNEL_ENDPOINT_REQUIRED", runtimeSetupHelp);
  const client = attachKernel({ endpoint });
  try {
    const status = await client.status();
    if (!status.execution_ready) throw new Error("KERNEL_UNAVAILABLE");
  } catch {
    throw new GatewayCommandError("KERNEL_UNAVAILABLE", runtimeSetupHelp);
  } finally {
    client.close();
  }
}
