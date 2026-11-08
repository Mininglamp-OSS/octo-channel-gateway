import { performance } from "node:perf_hooks";
import { attachKernel } from "@mininglamp-oss/octo-runtime-client";
import type { ImBotConfig } from "./contracts.js";
import type { GatewayDependencies, ImCredentialSource } from "./ports.js";
import type { RuntimeLog } from "./support/types.js";
import { createContextLoader } from "./support/context-loader.js";
import {
  shutdownDeadline,
  withinShutdown,
  withShutdownDeadline,
} from "./support/shutdown.js";
import {
  validateImConfig,
  configuredCredential,
} from "./lifecycle/configuration.js";
import { ImChannelManager } from "./lifecycle/manager.js";

/** 渠道自身的业务定义；函数保留在调用进程，不受 Runtime 的配置格式约束。 */
export interface ChannelDefinition extends GatewayDependencies {
  bot: ImBotConfig;
  contextLoading?: { timeout_ms?: number; max_in_flight?: number };
  authorizeSpace?: (spaceId: string) => void;
  credentials?: ImCredentialSource;
  log?: RuntimeLog;
  signal?: AbortSignal;
}
export interface ChannelRegistration {
  readonly endpoint: string;
  readonly status: readonly Record<string, unknown>[];
  /** 停接纳、取消并排空本注册的执行及业务资源；失败拒绝，不关闭 Kernel。 */
  close(): Promise<void>;
}

/** Gateway 的接入入口，不向 Kernel 注册渠道，也不创建或启动执行服务。 */
export class ChannelRegistry {
  static async register(
    endpoint: string,
    definition: ChannelDefinition,
  ): Promise<ChannelRegistration> {
    validateImConfig(definition.bot);
    definition.signal?.throwIfAborted();
    const bot = structuredClone(definition.bot);
    const owner = new AbortController();
    const contexts = createContextLoader(
      definition.loadContexts,
      definition.contextLoading,
      owner.signal,
    );
    const client = attachKernel({ endpoint });
    const signal = definition.signal;
    const log = definition.log ?? (() => {});
    const manager = new ImChannelManager({
      kernel: client,
      signal: owner.signal,
      log,
      createSessionStore: definition.createSessionStore,
      authorizeSpace: definition.authorizeSpace,
      credentials:
        definition.credentials ??
        ((config) => Promise.resolve(configuredCredential(config))),
      prepareContexts: (config, signal) =>
        contexts.load(config, signal, (items) => {
          const selected = items.filter(
            (item) => item.namespace !== "extra.im",
          );
          if (selected.length !== items.length)
            log("warn", "channel.context.reserved_ignored", {
              ignored_items: items.length - selected.length,
            });
          return selected;
        }),
    });
    let closing: Promise<void> | undefined;
    const abort = () => {
      void registration.close().catch(() => {});
    };
    const registration: ChannelRegistration = {
      endpoint,
      get status() {
        return manager.status;
      },
      close() {
        if (closing) return closing;
        client.invocations.stopAdmission();
        signal?.removeEventListener("abort", abort);
        const until = shutdownDeadline();
        const deadline =
          Date.now() + Math.max(0, Math.floor(until - performance.now()));
        closing = withShutdownDeadline(until, async () => {
          try {
            const results = await Promise.allSettled([
              withinShutdown(manager.close(), until, "IM_DISPOSE_FAILED"),
              client.invocations
                .drain({ deadline, reason: "Channel Gateway closed" })
                .then((result) => {
                  if (!result.complete)
                    throw new Error("IM_EXECUTION_CLEANUP_INCOMPLETE");
                }),
              withinShutdown(
                contexts.close(),
                until,
                "IM_CONTEXT_CLEANUP_INCOMPLETE",
              ),
            ]);
            const errors = results
              .filter((result) => result.status === "rejected")
              .map((result) => result.reason);
            if (errors.length)
              throw new AggregateError(errors, "IM_DISPOSE_FAILED");
          } finally {
            owner.abort();
            client.close();
          }
        });
        return closing;
      },
    };
    try {
      const status = await client.status();
      if (!status.execution_ready) throw new Error("KERNEL_UNAVAILABLE");
      signal?.throwIfAborted();
      signal?.addEventListener("abort", abort, { once: true });
      signal?.throwIfAborted();
      await manager.upsert(bot);
      signal?.throwIfAborted();
      return registration;
    } catch (error) {
      try {
        await registration.close();
      } catch (cleanup) {
        throw new AggregateError(
          [error, cleanup],
          "IM_REGISTRATION_CLEANUP_INCOMPLETE",
        );
      }
      throw error;
    }
  }
}
