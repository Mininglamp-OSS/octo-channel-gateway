# Session management

[简体中文](../../zh-CN/guides/sessions.md) | [Documentation](../README.md)

Gateway scopes sessions by trusted Bot/API/space identity and conversation address. Display names are not identities. Groups and threads also pass group settings, authorization, and mention admission; broadcasts cannot initiate reset/new/stop. An explicit empty allowed_sender_ids denies all senders, while an empty group_ids adds no group restriction. Disable group entry with groups_enabled=false.

## Continuation and controls

The current binding stores providerSession returned by the Provider and passes it explicitly on the next turn; it is not a transcript. Gateway fetches bounded history for cold starts, the first turn after reset, and continuation gaps: at most 20 messages and 8000 Unicode code points for the serialized messages array. Retries use frozen material rather than recollecting context for the same attempt.

| Control      | Behavior                                                                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| /reset, /new | Clear the logical session, Provider binding, rules, and history position; increment generation; allocate a new session on the next ordinary input |
| /stop        | Locate the active invocationId and request interruption, then wait for a terminal and business cleanup                                            |

reset does not call a model, implicitly cancel old execution, delete artifacts, or change the fixed workdir. Late results from an old generation cannot update the new binding or be delivered as its results. Stream disconnection resumes observation only; unknown execution results must not be automatically replayed. Codex recovery has explicit budgets and does not imply safe automatic retries for every Provider.

## Storage

The default MemoryImSessionStore is bounded process-local storage: bindings allow up to 1024 entries / 4 MiB / 24 hours; occurrences allow 4096 / 16 MiB / 120 seconds. Expiry, eviction, or process exit can lose continuation. It is not a complete transcript store.

For persistence, `createSessionStore(config)` synchronously returns an ImSessionStore handle. read/save/reset/occurrence/remember are synchronous contracts. read returns an independent snapshot; reset atomically deduplicates the control ID and increments generation. Optional patchGap/patchRules atomically check sessionId/generation. Do not return a Promise while claiming a synchronous write succeeded.

The host owns databases, migrations, tenant partitioning, retention, and concurrency. Closing registration releases factory-created handles; a handle's close must not close a shared database used by other registrations. See the [session store contract](../../../packages/octo-channel-gateway-sdk/src/application/session-store.ts) and [SDK reference](../reference/sdk.md).
