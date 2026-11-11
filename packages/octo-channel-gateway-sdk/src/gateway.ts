import { normalizeHooks, type GatewayHook } from "./hooks.js";
import type { KernelClient } from "@mininglamp-oss/octo-runtime-client";
import type { ImAgentConfig, ImBotConfig } from "./contracts.js";
import type { GatewayDependencies, ImCredentialSource } from "./ports.js";
import type { RuntimeLog } from "./support/types.js";
import {
  abortForShutdown,
  shutdownDeadline,
  withinShutdown,
  withShutdownDeadline,
} from "./support/shutdown.js";
import {
  imBotIdentity,
  validateImConfig,
  IM_MAX_BOTS,
  IM_MAX_CONFIG_OPERATIONS,
} from "./lifecycle/configuration.js";
import { ImChannelManager } from "./lifecycle/manager.js";
import { verifyBotIdentity } from "./transport/auth.js";
import { OwnedExecutions } from "./execution/owned-executions.js";

/** Bot 连接及本绑定的业务回调；执行配置独立传入 register 的第二个参数。 */
export interface GatewayBot
  extends
    Omit<ImBotConfig, "agent" | "api_url" | "bf_token" | "bot_id" | "bot_name">,
    GatewayDependencies {
  apiUrl: string;
  bfToken?: string;
  botId: string;
  botName?: string;
  credentials?: ImCredentialSource;
  authorizeSpace?: (spaceId: string) => void;
}
export interface ChannelGatewayOptions {
  kernel: KernelClient;
  log?: RuntimeLog;
  signal?: AbortSignal;
}
interface Binding {
  manager: ImChannelManager;
  executions: OwnedExecutions;
  closing?: Promise<void>;
}

/** 宿主借入 client；注册按身份覆盖，统一关闭仅清理本实例的资源。 */
export class ChannelGateway {
  readonly #kernel: KernelClient;
  readonly #log?: RuntimeLog;
  readonly #signal?: AbortSignal;
  readonly #owner = new AbortController();
  readonly #bindings = new Map<string, Binding>();
  #queue: Promise<void> = Promise.resolve();
  #operations = 0;
  #closed = false;
  #closing?: Promise<void>;
  readonly #abort = () => {
    void this.close().catch(() => undefined);
  };

  constructor(options: ChannelGatewayOptions) {
    if (!options?.kernel) throw new Error("IM_KERNEL_CLIENT_REQUIRED");
    options.signal?.throwIfAborted();
    this.#kernel = options.kernel;
    this.#log = options.log;
    this.#signal = options.signal;
    this.#signal?.addEventListener("abort", this.#abort, { once: true });
  }
  get status(): readonly Record<string, unknown>[] {
    return [...this.#bindings.values()].flatMap(({ manager }) => [
      ...manager.status,
    ]);
  }

  register(bot: GatewayBot, agent: ImAgentConfig, hooks: readonly GatewayHook[] = []): Promise<void> {
    if (this.#closed) return Promise.reject(new Error("IM_GATEWAY_CLOSED"));
    if (this.#operations >= IM_MAX_CONFIG_OPERATIONS)
      return Promise.reject(new Error("IM_CONFIG_QUEUE_CAPACITY_EXHAUSTED"));
    let config: ImBotConfig;
    let bindingHooks: readonly GatewayHook[];
    let dependencies: Pick<
      GatewayBot,
      | "createSessionStore"
      | "credentials"
      | "authorizeSpace"
    >;
    try {
      bindingHooks = normalizeHooks(hooks, this.#log);
      if (!bot || typeof bot !== "object" || Array.isArray(bot))
        throw new Error("IM_CONFIG_INVALID");
      for (const key of [
        "agent",
        "bot",
        "api_url",
        "bf_token",
        "bot_id",
        "bot_name",
        "loadContexts",
        "contextLoading",
        "loadMaterials",
        "materials",
        "materialLoading",
      ])
        if (Object.hasOwn(bot, key))
          throw new Error("IM_REGISTRATION_API_REMOVED");
      const {
        apiUrl,
        bfToken,
        botId,
        botName,
        createSessionStore,
        credentials,
        authorizeSpace,
        ...settings
      } = bot;
      for (const callback of [
        createSessionStore,
        credentials,
        authorizeSpace,
      ])
        if (callback !== undefined && typeof callback !== "function")
          throw new Error("IM_CALLBACK_INVALID");
      if (typeof botId !== "string" || !botId.trim())
        throw new Error("IM_BOT_ID_REQUIRED");
      const draft = {
        ...settings,
        api_url: apiUrl,
        bf_token: bfToken,
        bot_id: botId,
        bot_name: botName,
        agent,
      };
      validateImConfig(draft);
      config = structuredClone(draft);
      dependencies = {
        createSessionStore,
        credentials,
        authorizeSpace,
      };
    } catch (error) {
      return Promise.reject(error);
    }
    this.#operations++;
    const operation = this.#queue
      .then(async () => {
        this.#assertOpen();
        if (config.enabled !== false) {
          const token = (
            await (dependencies.credentials
              ? dependencies.credentials(
                  structuredClone(config),
                  this.#owner.signal,
                )
              : config.bf_token)
          )?.trim();
          this.#assertOpen();
          if (!token || !/^bf_[A-Za-z0-9_-]+$/.test(token))
            throw new Error("IM_BOT_TOKEN_INVALID");
          const identity = await verifyBotIdentity(
            config.api_url,
            token,
            this.#owner.signal,
          );
          this.#assertOpen();
          if (config.bot_id !== identity.bot_uid)
            throw new Error("IM_BOT_IDENTITY_MISMATCH");
          config.bf_token = token;
          dependencies.authorizeSpace?.(identity.space_id);
          validateImConfig(config);
        }
        const status = await this.#kernel.status();
        this.#assertOpen();
        if (!status.execution_ready) throw new Error("KERNEL_UNAVAILABLE");
        const key = imBotIdentity(config);
        const previous = this.#bindings.get(key);
        if (!previous && this.#bindings.size >= IM_MAX_BOTS)
          throw new Error("IM_ENDPOINT_CAPACITY_EXHAUSTED");
        if (previous) {
          await this.#closeBinding(previous);
          this.#bindings.delete(key);
        }
        this.#assertOpen();
        const executions = new OwnedExecutions(this.#kernel);
        const manager = new ImChannelManager({
          kernel: executions.port,
          log: this.#log,
          hooks: bindingHooks,
          createSessionStore: dependencies.createSessionStore,
          authorizeSpace: dependencies.authorizeSpace,
          credentials: dependencies.credentials,
        });
        const binding: Binding = { manager, executions };
        // 先登记再进入可重入的初始化，close 必须看见所有已取得的资源。
        this.#bindings.set(key, binding);
        try {
          const result = await manager.upsert(config);
          this.#assertOpen();
          // 初始化已交给渠道管理时，暂态断线继续既有重连，不升级成整个宿主退出。
          if (config.enabled !== false && result.state === "failed") {
            const code =
              typeof result.error === "string" &&
              /^IM_[A-Z0-9_]+$/.test(result.error)
                ? result.error
                : "IM_CONNECTION_FAILED";
            throw new Error("IM_CONNECTION_NOT_READY", {
              cause: new Error(code),
            });
          }
        } catch (error) {
          try {
            await this.#closeBinding(binding);
            if (this.#bindings.get(key) === binding) this.#bindings.delete(key);
          } catch (cleanup) {
            throw new AggregateError(
              [error, cleanup],
              "IM_REGISTRATION_CLEANUP_INCOMPLETE",
            );
          }
          throw error;
        }
      })
      .finally(() => {
        this.#operations--;
      });
    this.#queue = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }
  #assertOpen(): void {
    if (this.#closed) throw new Error("IM_GATEWAY_CLOSED");
  }
  #closeBinding(binding: Binding, until = shutdownDeadline()): Promise<void> {
    if (binding.closing) return binding.closing;
    binding.executions.stop();
    // 将真正清理延迟到 Promise 中，保证同步重入 close 也拿到同一结果。
    binding.closing = Promise.resolve().then(() =>
      withShutdownDeadline(until, async () => {
        const results = await Promise.allSettled([
          withinShutdown(binding.manager.close(), until, "IM_DISPOSE_FAILED"),
          binding.executions.drain(until),
        ]);
        const errors = results
          .filter((result) => result.status === "rejected")
          .map((result) => result.reason);
        if (errors.length)
          throw new AggregateError(errors, "IM_DISPOSE_FAILED");
      }),
    );
    return binding.closing;
  }
  close(): Promise<void> {
    if (this.#closing) return this.#closing;
    this.#closed = true;
    const until = shutdownDeadline();
    this.#signal?.removeEventListener("abort", this.#abort);
    this.#closing = Promise.resolve().then(() =>
      withShutdownDeadline(until, async () => {
        const results = await Promise.allSettled([
          withinShutdown(
            this.#queue,
            until,
            "IM_REGISTRATION_CLEANUP_INCOMPLETE",
          ),
          ...[...this.#bindings.values()].map((binding) =>
            this.#closeBinding(binding, until),
          ),
        ]);
        const errors = results
          .filter((result) => result.status === "rejected")
          .map((result) => result.reason);
        if (errors.length)
          throw new AggregateError(errors, "IM_DISPOSE_FAILED");
        this.#bindings.clear();
      }),
    );
    withShutdownDeadline(until, () => abortForShutdown(this.#owner));
    return this.#closing;
  }
}
