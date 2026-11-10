import type { KernelClient } from "@mininglamp-oss/octo-runtime-client";
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";
import { withinShutdown } from "../support/shutdown.js";
import type { GatewayExecutionContext } from "../support/types.js";

/** 只跟踪本绑定的 invoke 身份，不停止或排空宿主共享 client。 */
export class OwnedExecutions {
  readonly #ids = new Set<string>();
  #stopped = false;
  readonly port: GatewayExecutionContext;
  constructor(private readonly client: KernelClient) {
    this.port = {
      invoke: ((...args: Parameters<KernelClient["invoke"]>) => {
        if (this.#stopped) throw new Error("IM_GATEWAY_CLOSED");
        this.#pending();
        const run = client.invoke(...args);
        this.#ids.add(run.invocationId);
        return run;
      }) as KernelClient["invoke"],
      interrupt: (id, reason) => {
        if (
          !this.#ids.has(id) &&
          client.invocations
            .snapshot()
            .some((record) => record.key.invocation_id === id)
        )
          return Promise.reject(new Error("IM_INVOCATION_NOT_OWNED"));
        return client.interrupt(id, reason);
      },
      respondInteraction: (id, response) => {
        if (
          !this.#ids.has(id) &&
          client.invocations
            .snapshot()
            .some((record) => record.key.invocation_id === id)
        )
          return Promise.reject(new Error("IM_INVOCATION_NOT_OWNED"));
        return client.respondInteraction(id, response);
      },
    };
  }
  #pending() {
    const records = this.client.invocations.snapshot();
    const live = new Set(records.map((record) => record.key.invocation_id));
    for (const id of this.#ids) if (!live.has(id)) this.#ids.delete(id);
    return records.filter((record) => this.#ids.has(record.key.invocation_id));
  }
  stop(): void {
    this.#stopped = true;
  }
  async drain(until: number): Promise<void> {
    this.stop();
    const cancellations = new Set<string>();
    const errors: unknown[] = [];
    while (true) {
      const pending = this.#pending();
      if (!pending.length) break;
      if (performance.now() >= until) {
        errors.push(
          new Error("IM_EXECUTION_CLEANUP_INCOMPLETE", { cause: pending }),
        );
        break;
      }
      const results = await Promise.allSettled(
        pending.map(async (record) => {
          const id = record.key.invocation_id;
          // 查询仅用于收尾原身份；禁止重放或取消其他使用者的执行。
          if (!cancellations.has(id)) {
            cancellations.add(id);
            await withinShutdown(
              this.client.interrupt(id, "Channel Gateway closed"),
              until,
              "IM_EXECUTION_CLEANUP_INCOMPLETE",
            );
          }
          if (this.#pending().some((item) => item.key.invocation_id === id))
            await withinShutdown(
              this.client.get(record.key, record.ref?.kernel_instance_id),
              until,
              "IM_EXECUTION_CLEANUP_INCOMPLETE",
            );
        }),
      );
      for (const result of results)
        if (result.status === "rejected") errors.push(result.reason);
      if (errors.length) break;
      await delay(Math.min(25, Math.max(0, until - performance.now())));
    }
    if (errors.length)
      throw new AggregateError(errors, "IM_EXECUTION_CLEANUP_INCOMPLETE");
  }
}
