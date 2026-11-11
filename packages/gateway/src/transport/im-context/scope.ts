import type { ContextItem } from "@mininglamp-oss/octo-runtime-client/protocol";
import type { ScopedOctoBotConfig } from "../../contracts.js";
import type { ImGapPlan } from "../../application/context-gap.js";
import type { ImMessage } from "../wukong.js";
import { getJson } from "../api/client.js";
import { getGroupMd, getThreadMd } from "../api/rules.js";
import { getChannelMessagePage } from "../api/conversations.js";
import { groupScope } from "../normalize.js";
import { resolveMessageIdentities, type MessageIdentity, type MessageIdentityCache } from "../message-identities.js";

export interface ImContextBuildOptions {
  initialSession: boolean;
  turnIndex?: number;
  configuredItems?: readonly ContextItem[];
  historyGap?: ImGapPlan;
  identityCache?: MessageIdentityCache;
  onHistoryGapPrepared?(plan: ImGapPlan): void;
}

type HistoryPage = Awaited<ReturnType<typeof getChannelMessagePage>>;
type ReadonlyData<T> = T extends object ? { readonly [K in keyof T]: ReadonlyData<T[K]> } : T;

/** 只冻结本模块持有的 JSON 数据；不会冻结调用方对象或 AbortSignal。 */
function freeze<T>(value: T): ReadonlyData<T> {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value as ReadonlyData<T>;
}

/** 本轮同一读取复用 Promise，包括失败；取消后不再交付已缓存结果。 */
function once<T>(signal: AbortSignal, read: () => Promise<T>): () => Promise<ReadonlyData<T>> {
  let pending: Promise<ReadonlyData<T>> | undefined;
  return async () => {
    signal.throwIfAborted();
    pending ??= Promise.resolve().then(read).then(freeze);
    const result = await pending;
    signal.throwIfAborted();
    return result;
  };
}

/** 本轮渠道块的只读输入和共享读取器，不是公开 Hook ctx，不保存会话进度。 */
export function createImContextBuildScope(
  config: ScopedOctoBotConfig,
  incoming: ImMessage,
  botToken: string,
  signal: AbortSignal,
  options: ImContextBuildOptions,
) {
  const message = freeze(structuredClone(incoming));
  const { channelId, channelType } = message;
  const { api_url: apiUrl, bot_id: botId, spaceId } = config;
  const identityConfig = { api_url: apiUrl, bot_id: botId, spaceId };
  const identityCache = options.identityCache;
  const group = freeze(typeof channelId === "string" ? groupScope(channelId) : { groupNo: "" });
  const source = freeze({ service: apiUrl, spaceId, botId, channelId, channelType });
  const isGroup = [2, 5].includes(channelType);
  const identityReads = new Map<string, Promise<ReadonlyData<MessageIdentity> | undefined>>();
  const historyReads = new Map<string, () => Promise<ReadonlyData<HistoryPage>>>();

  const readers = Object.freeze({
    groupRules: once(signal, () => getGroupMd({ apiUrl, botToken, groupNo: group.groupNo, signal })),
    topicRules: once(signal, () => getThreadMd({ apiUrl, botToken, groupNo: group.groupNo, shortId: group.shortId!, signal })),
    conversation: once(signal, () => {
      const path = `/v1/bot/groups/${encodeURIComponent(group.groupNo)}`;
      return getJson<Record<string, unknown>>(apiUrl, botToken,
        channelType === 5 && group.shortId ? `${path}/threads/${encodeURIComponent(group.shortId)}` : path,
        AbortSignal.any([signal, AbortSignal.timeout(5_000)]),
        { retryOn429: false, logRateLimit: false, maxResponseBytes: 1_048_576 });
    }),
    /** 按UID共享已开始或已完成的读取；不同批次只补查新增UID，单批最多200。 */
    async identities(requested: readonly string[]): Promise<Readonly<Record<string, ReadonlyData<MessageIdentity>>>> {
      signal.throwIfAborted();
      const uids = [...new Set(requested)].filter((uid) => uid && Buffer.byteLength(uid) <= 64);
      for (const uid of uids) {
        if (identityReads.has(uid)) continue;
        const cached = identityCache?.get(identityConfig, uid);
        if (cached) identityReads.set(uid, Promise.resolve(freeze(cached)));
      }
      const missing = uids.filter((uid) => !identityReads.has(uid)).slice(0, 200);
      if (missing.length) {
        const pending = resolveMessageIdentities(identityConfig, missing, botToken, signal, identityCache);
        for (const uid of missing) identityReads.set(uid, pending.then((values) => freeze(values.get(uid))));
      }
      const values = await Promise.all(uids.map(async (uid) => [uid, await identityReads.get(uid)] as const));
      signal.throwIfAborted();
      // UID来自外部数据；无原型字典避免constructor/__proto__被误认成已查到的身份。
      return Object.freeze(Object.assign(Object.create(null) as Record<string, ReadonlyData<MessageIdentity>>,
        Object.fromEntries(values.filter((entry): entry is readonly [string, ReadonlyData<MessageIdentity>] => entry[1] !== undefined))));
    },
    /** 相同窗口只请求一次；不同窗口保留独立预算和结果。 */
    history(window: { readonly beforeSeq: number; readonly afterSeq: number; readonly limit: number }) {
      const { beforeSeq, afterSeq, limit } = window;
      const key = JSON.stringify([beforeSeq, afterSeq, limit]);
      let read = historyReads.get(key);
      if (!read) {
        read = once(signal, () => getChannelMessagePage({ apiUrl, botToken, channelId, channelType,
          limit, startMessageSeq: beforeSeq - 1, endMessageSeq: afterSeq, pullMode: 0,
          ...(isGroup ? { retryOn429: false, signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]) } : { signal }),
        }));
        historyReads.set(key, read);
      }
      return read();
    },
  });

  return Object.freeze({
    channelId, channelType, isGroup, botId, message, group, source, signal, readers,
    turnIndex: options.turnIndex ?? 1,
    initialSession: options.initialSession,
    historyPlan: freeze(structuredClone(options.historyGap)),
  });
}

export type ImContextBuildScope = ReturnType<typeof createImContextBuildScope>;
