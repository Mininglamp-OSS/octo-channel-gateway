import { homedir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { attachKernel } from "@mininglamp-oss/octo-runtime-client";
import { createKernelService } from "@mininglamp-oss/octo-runtime/host";
import { runtimeModule } from "./runtime-module.mjs";

/** 观察公开四参数输入；仅重排字段供真实公开协议校验，不恢复旧配置模型。 */
export function clientInput(content, sessionId, providerSession, agentEnv) {
  const { parts, ...metadata } = content;
  return Object.fromEntries(Object.entries({ ...metadata, inputs: parts, sessionId, providerSession, agentEnv })
    .filter(([, value]) => value !== undefined));
}

/** 人工验证的宿主显式绑定 executable/Home，并拥有唯一 Engine。 */
export async function createVerificationCodex(options = {}) {
  const { createCodexAdapter, createManagedCodexEngine } = await runtimeModule("adapter-codex");
  const engine = createManagedCodexEngine({
    codexHome: process.env.CODEX_HOME ?? join(homedir(), ".codex"),
    command: process.env.OCTO_CODEX_COMMAND ?? "codex",
    ...options,
  });
  return { adapter: createCodexAdapter({ engine: engine.provider }),
    async close() {
      engine.beginShutdown();
      return engine.close({ deadline: performance.now() + 4000 });
    } };
}

/** 本地独立 Kernel，返回公开 client；关闭同时回收宿主拥有的依赖。 */
export async function createVerificationKernel({ home, endpoint, adapters, codexOptions }) {
  const owned = adapters ? undefined : await createVerificationCodex(codexOptions);
  let service, client, closing;
  const close = () => closing ??= (async () => {
    const errors = [];
    let complete = true, result;
    // 各资源分别收尾，某一步失败也必须释放剩余宿主资源。
    for (const operation of [
      () => client?.invocations.drain({ deadline: Date.now() + 4000, reason: "verification shutdown" }),
      () => client?.close(),
      async () => result = await service?.close(),
      () => owned?.close(),
    ]) {
      try { const value = await operation(); complete = complete && (value?.complete ?? true); }
      catch (error) { errors.push(error); }
    }
    if (errors.length) throw new AggregateError(errors, "VERIFICATION_CLEANUP_FAILED");
    return { ...result, complete };
  })();
  try {
    service = createKernelService({ home, endpoint, adapters: adapters ?? [owned.adapter] });
    await service.initialize();
    client = attachKernel({ endpoint });
    return { client, close };
  } catch (error) {
    try { await close(); }
    catch (cleanup) { throw new AggregateError([error, cleanup], "VERIFICATION_STARTUP_FAILED"); }
    throw error;
  }
}
