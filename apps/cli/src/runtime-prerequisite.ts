import { attachKernel } from "@mininglamp-oss/octo-runtime-client";
import { GatewayCommandError } from "./command-types.js";

/** 固定操作指引，不拼接配置、凭据或底层异常正文。 */
export const runtimeSetupHelp = [
  "Channel Gateway 的 CLI 和 SDK 模式都需要已就绪的 octo-runtime Kernel（2.x / IPC v2）。",
  "1. 安装匹配版本：npm install -g @mininglamp-oss/octo-runtime@^2",
  "2. 启动 Runtime：octo-runtime executor-kernel start",
  "3. 检查 Runtime：octo-runtime doctor --json",
  "4. 将 Gateway 的 --endpoint 或配置 endpoint 指向该 Kernel 的 socket / named pipe，再执行 start。",
  "自定义 Runtime Home 时，启动和诊断须使用同一 --home。2.0 候选未发布时请使用匹配的本地发行包。",
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
