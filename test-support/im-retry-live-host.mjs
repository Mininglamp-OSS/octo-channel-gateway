import { spawn } from "node:child_process";
import { createVerificationCodex, createVerificationKernel } from "./verification-kernel.mjs";

// 两个 Engine 均归验收宿主；首轮绑定故障端点，下一次明确重试使用正常 Engine。
export async function createRetryKernel({ faultUrl, ...options }) {
  const fault = await createVerificationCodex({
    spawnFn(command, args, spawnOptions) {
      const env = { ...spawnOptions.env, NO_PROXY: "127.0.0.1,localhost", no_proxy: "127.0.0.1,localhost" };
      for (const key of ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy"]) delete env[key];
      return spawn(command, [...args,
        "-c", 'model_provider="octo_retry_live"',
        "-c", 'model_providers.octo_retry_live.name="Octo retry live fault"',
        "-c", `model_providers.octo_retry_live.base_url="${faultUrl}"`,
        "-c", 'model_providers.octo_retry_live.wire_api="responses"',
        "-c", "model_providers.octo_retry_live.requires_openai_auth=false",
        "-c", "model_providers.octo_retry_live.request_max_retries=0",
        "-c", "model_providers.octo_retry_live.stream_max_retries=0",
      ], { ...spawnOptions, env });
    },
  });
  let normal, kernel, closing, first = true;
  const close = () => closing ??= (async () => {
    const errors = [];
    const cleanup = async (operation) => {
      try {
        if ((await operation())?.complete === false)
          throw new Error("VERIFICATION_ENGINE_CLEANUP_INCOMPLETE");
      } catch (error) { errors.push(error); }
    };
    // 先停止 Kernel，再独立回收两个 Engine；任何关闭失败都不能跳过剩余资源。
    await cleanup(() => kernel?.close());
    await Promise.all([cleanup(() => fault.close()), cleanup(() => normal?.close())]);
    if (errors.length) throw new AggregateError(errors, "VERIFICATION_CLEANUP_FAILED");
  })();
  try {
    normal = await createVerificationCodex();
    const adapter = { ...normal.adapter, createExecutionScope() {
      const selected = first ? fault : normal;
      first = false;
      return selected.adapter.createExecutionScope();
    } };
    kernel = await createVerificationKernel({ ...options, adapters: [adapter] });
    return { ...kernel, close };
  } catch (error) {
    try { await close(); }
    catch (cleanup) { throw new AggregateError([error, cleanup], "VERIFICATION_STARTUP_FAILED"); }
    throw error;
  }
}
