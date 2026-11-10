import type { BusinessMaterial } from "../materials.js";
import { assertMaterials } from "../materials.js";
import type { JsonObject, JsonValue } from "./types.js";

/**
 * 宿主业务函数：每轮接收独立 Bot 配置快照，返回 BusinessMaterial 列表而非 envelope。
 * 函数引用在注册时固定，每次调用可读取宿主最新的 Agent 提示词。
 * 存储、授权及读取一致性归宿主；同步读取和异步 IO 均支持，IO 须传递 signal。
 * SQLite 同步驱动可直接返回数组，异步驱动可返回 Promise；async 不会使同步查询自动非阻塞。
 * SDK 在调用进程绑定函数，不把它写入 JSON/IPC。
 */
export type LoadMaterials = (
  config: JsonObject,
  options: { readonly signal: AbortSignal },
) => readonly BusinessMaterial[] | Promise<readonly BusinessMaterial[]>;
export interface ChannelDependencies {
  readonly loadMaterials?: LoadMaterials;
}

/**
 * 只合并本轮数据，不保留历史。动态同 key 整项替换且保留静态位置，新项按返回顺序追加。
 * parts 整体替换而不拼接；空动态列表不删除静态项。
 * 两个来源先分别校验，避免同源重复 key 被覆盖掩盖；返回副本隔离宿主与插件的后续修改。
 * 最终合并后的名称、parts 和整体预算仍须校验。
 */
export function mergeConfiguredMaterials(
  base: readonly BusinessMaterial[], dynamic: readonly BusinessMaterial[],
): BusinessMaterial[] {
  assertMaterials(base);
  assertMaterials(dynamic);
  const items = [...base];
  const positions = new Map(items.map((item, index) => [item.name, index]));
  for (const item of dynamic) {
    const position = positions.get(item.name);
    if (position === undefined) { positions.set(item.name, items.length); items.push(item); }
    else items[position] = item;
  }
  assertMaterials(items);
  return structuredClone(items);
}

/**
 * 每次注册使用一个有界回调池。
 * 超时只结束本轮等待，不能强制结束外部 Promise；实际操作结束前仍须占额，防止挂起 IO 累积。
 */
export function createMaterialLoader(
  callback: LoadMaterials | undefined,
  settings: JsonValue | undefined,
  owner: AbortSignal,
) {
  if (callback !== undefined && typeof callback !== "function") throw new Error("IM_MATERIAL_LOADER_INVALID");
  const options = settings ?? {};
  if (
    !options ||
    typeof options !== "object" ||
    Array.isArray(options) ||
    Object.keys(options).some(
      (key) => !["timeout_ms", "max_in_flight"].includes(key),
    )
  )
    throw new Error("IM_MATERIAL_LOADING_CONFIG_INVALID");
  const timeout = options.timeout_ms ?? 5_000;
  const capacity = options.max_in_flight ?? 8;
  if (
    typeof timeout !== "number" ||
    !Number.isInteger(timeout) ||
    timeout < 1 ||
    timeout > 30_000 ||
    typeof capacity !== "number" ||
    !Number.isInteger(capacity) ||
    capacity < 1 ||
    capacity > 32
  )
    throw new Error("IM_MATERIAL_LOADING_CONFIG_INVALID");
  const pending = new Set<Promise<unknown>>();
  const stop = new AbortController();
  return {
    async load(
      config: JsonObject,
      signal: AbortSignal,
    ): Promise<BusinessMaterial[]> {
      const base = config.materials ?? [];
      if (!Array.isArray(base)) throw new Error("IM_MATERIAL_INVALID");
      if (!callback)
        return mergeConfiguredMaterials(
          base as unknown as BusinessMaterial[],
          [],
        );
      owner.throwIfAborted();
      stop.signal.throwIfAborted();
      signal.throwIfAborted();
      // 满额直接拒绝，不再建立等待队列；否则排队的配置副本和闭包也可能无限增长。
      if (pending.size >= capacity) throw new Error("IM_MATERIAL_LOADING_BUSY");
      const abort = new AbortController();
      const combined = AbortSignal.any([
        owner,
        stop.signal,
        signal,
        abort.signal,
      ]);
      let timer: ReturnType<typeof setTimeout> | undefined;
      let onAbort: (() => void) | undefined;
      const operation = Promise.resolve()
        .then(() => {
          combined.throwIfAborted();
          // 每轮重新调用同一业务函数，不在启动时预取；下一轮可读到宿主已更新的数据。
          return callback(structuredClone(config), { signal: combined });
        })
        .then((items) => {
          // 超时或取消后的迟到结果不能再校验、复制或进入本轮模型输入。
          combined.throwIfAborted();
          return mergeConfiguredMaterials(
            base as unknown as BusinessMaterial[],
            items,
          );
        });
      pending.add(operation);
      // 跟踪真实操作，而非 race 的等待结果；迟到 reject 也必须被消费，避免未处理拒绝。
      void operation
        .finally(() => pending.delete(operation))
        .catch(() => undefined);
      try {
        return await Promise.race([
          operation,
          new Promise<never>((_, reject) => {
            onAbort = () => reject(new Error("IM_MATERIAL_LOADING_CANCELLED"));
            combined.addEventListener("abort", onAbort, { once: true });
            if (combined.aborted) onAbort();
            timer = setTimeout(() => {
              reject(new Error("IM_MATERIAL_LOADING_TIMEOUT"));
              abort.abort();
            }, timeout);
          }),
        ]);
      } finally {
        clearTimeout(timer);
        if (onAbort) combined.removeEventListener("abort", onAbort);
      }
    },
    async close(): Promise<void> {
      // 等待实际 IO 退出；注册的全部关闭阶段共用同一个截止时间。
      stop.abort();
      await Promise.allSettled([...pending]);
    },
    get inFlight(): number {
      return pending.size;
    },
  };
}
