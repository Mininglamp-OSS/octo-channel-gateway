# Lifecycle and delivery

[简体中文](../../zh-CN/guides/lifecycle-and-delivery.md) | [Documentation](../README.md)

Successful registration means the binding is initialized and managed. A transient connection failure can leave it retrying under the existing reconnect policy; inspect status to distinguish online from retrying. Authentication preflight failures reject without replacing the old binding; permanent startup failures roll back the new binding. gateway.status is the Manager's current Bot diagnostic snapshot, not a full task history. The readonly interface does not make every diagnostic field a permanently stable schema.

## Closing

Await gateway.close when the application finishes. Close stops admission, requests cancellation of owned executions, consumes tails, finishes delivery and business cleanup, closes callback pools and owned session handles, then releases owned channel resources while leaving the injected client open. These stages share a four-second deadline. Repeated close calls return the same Promise. Rejection means cleanup did not complete successfully.

Aborting constructor options.signal triggers whole-Gateway closure, but abort() cannot synchronously report asynchronous cleanup failure; still await close. The SDK does not own the shared Kernel or other Gateway instances. CLI stop/uninstall also does not replace Runtime shutdown commands.

## Embedding and shutdown contract

This contract applies to the ChannelGateway instance API. See [Architecture and ownership](../concepts/architecture.md) for Runtime injection.

- Keep `await gateway.register(bot, agent)`: add or replace by stable Bot identity while running. Success means initialization completed; no separate start is required. Replacement cleans up only that identity's old binding. A brief interruption is possible; automatic restoration of the old configuration is not promised.
- The host needs only `await gateway.close()` to clean up the whole Gateway, without registration handles or individual Bot shutdown. Close must stop message/execution admission, cancel queued registrations, coordinate initialization/replacement in progress and clean up resources that arrive late. Closed instances reject registration; repeated close calls share one Promise.
- Successful close must release Bot sockets, reconnect/heartbeat timers, event listeners, owned executions and observers, delivery tasks, owned session-store handles. No background reconnect or delivery may remain. Clearing a registry or disconnecting a client alone is insufficient.
- Failure of one cleanup step must not skip the remaining resources. Aggregate failures and unfinished items at the end. Timeout does not prove release; a host callback that ignores cancellation must be reported as unfinished. The host records errors and decides its exit policy; rejection must not be interpreted as successful cleanup.
- Gateway manages only its own invocations. It must not call global stopAdmission/drain/close on a borrowed client, shut down a shared Kernel or close a host Engine. The host waits for Gateway cleanup before releasing owned Runtime resources. Failure of an earlier step must not skip later cleanup attempts or hide their errors.

Electron should own Gateway in its main process. During normal before-quit, synchronously preventDefault and start host cleanup once; await success before allowing a second app.quit. Electron does not automatically await a listener's Promise, and closing a window does not necessarily exit the application. This coordination belongs to the host, not the SDK; no SDK waitForShutdown is needed. CLI hosts likewise await close on exit and failure paths. Forced termination, crashes and system interruption cannot guarantee callback execution and require host/Runtime recovery mechanisms. See [Electron before-quit](https://www.electronjs.org/docs/latest/api/app#event-before-quit).

Verification must cover repeated registration and token rotation, concurrent replacement, initialization/rollback failures, register/close races, idempotent close, uncooperative cancellation and shared-client isolation. Inspect actual resources and invocation identities; process exit alone does not prove leak-free cleanup. Run focused checks explicitly locally without expanding CI.

## Connection recovery

After registration, transient disconnects reconnect automatically without another register call. Established connections try immediately, then up to ten one-second retries before the existing 5/10/15-second capped backoff; Retry-After takes precedence. Replacement and close cancel the old binding's reconnect activity, and stale callbacks cannot recreate it. Permanent authentication/authorization failures require host intervention, such as registering corrected credentials. A failed authentication preflight rejects the registration and preserves an existing binding.

## Execution and delivery

Cancellation acknowledgement, execution terminal, resource cleanup, and message delivery are separate facts. Delivery can fail after run.completed, and delivery failure must not rerun the Provider. Preserve original invocation identity when outcomes are unknown or timed out; a missing UI result does not justify creating another execution.

Each Bot has at most 64 work slots and each logical session has a separate queue allowance of 4. Delivery cleanup still occupies the work slot. Delivery receipt caches are bounded and do not guarantee exactly-once delivery across process restarts.

Final response accumulation has a separate limit of 128 messages and 1 MiB of UTF-8 text. Exceeding either reports `IM_FINAL_OUTPUT_LIMIT_EXCEEDED` and enters the existing interrupt/result-unknown path. Partial text is not delivered as a successful final response and does not trigger automatic artifact upload. Invalid interaction form submissions are diagnosed and acknowledged individually so later valid card actions can proceed; transport and acknowledgement failures retain their retry behavior.

## Model silence and timeouts

Runtime reports model silence using `agent_run.event` carrying canonical `run.notice`, code `model_output_idle`, and source `params.silenceMs`. Gateway renders this duration as `模型已 N 秒无输出` on the existing card. A delayed 60000 ms notice still displays 60 seconds. Gateway never starts a silence clock, extrapolates elapsed silence, or cancels an execution because five minutes passed locally.

Periodic card updates require a Runtime service that emits new notices at 60, 120, 180 seconds and subsequent minute boundaries. Each new source duration updates the same card through normal rendering and deduplication. Runtime main commit `67a44ebc` adds this periodic behavior; published Runtime 1.1.14 only emits once per silence interval. The client 1.1.14 notice payload already supports both. Deploy a Runtime containing the periodic change to obtain periodic updates; Gateway has no timer fallback, missed-minute catch-up, or compatibility layer.

Growing public assistant output clears the notice. Ordinary tool/approval phases and terminal events update the card normally; private reasoning, heartbeats, usage and unchanged text snapshots do not invent new model output. Runtime alone enforces the default five-minute model-idle budget under `enforce`; see [execution limits](../reference/configuration.md) for explicit overrides and the `observe` opt-out. User Stop and owned-execution cleanup retain their existing cancellation paths. Timeout wording follows the actual upstream terminal result.

## Artifacts

artifact_delivery.mode defaults to channel. Explicit local file references in a successful final response are checked against frozen path, MIME, count, size, and cancellation budgets before delivery. This does not upload every path appearing in model output. tools mode disables automatic upload and expects business tools to provide recipient-accessible links.

Channel mode uses this fixed, case-insensitive extension allowlist:

| Category | Extensions |
| --- | --- |
| Markdown and plain text | `.md`, `.markdown`, `.txt`, `.log`, `.rst`, `.adoc` |
| Data and configuration | `.json`, `.jsonl`, `.ndjson`, `.xml`, `.csv`, `.tsv`, `.yaml`, `.yml`, `.toml`, `.ini`, `.conf`, `.properties` |
| Web and SQL text | `.html`, `.htm`, `.css`, `.sql` |
| Office and RTF | `.doc`, `.docx`, `.ppt`, `.pptx`, `.xls`, `.xlsx`, `.rtf` |
| Archive attachments | `.zip` |
| Images | `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, `.svg`, `.bmp`, `.ico`, `.tif`, `.tiff` |

These formats support ordinary attachment delivery, not guaranteed inline previews. Gateway does not execute, inline, or extract Office, HTML, SVG, or ZIP contents. Directories (including names with supported extensions), nonregular files, and unlisted types such as mp3, PDF, or unknown extensions are silently skipped. Active local links become bold italic basenames without consuming attachment count or byte budgets. tools mode leaves the body unchanged. A symlink's reference name and real target must both be allowlisted with the same MIME type. `allowed_mime_types` can only narrow the fixed allowlist; an empty array denies all files.

Unreadable, policy-denied, oversized, or failed supported files also lose their inaccessible local links. Other successful attachments are still delivered. File card failures retain successfully uploaded links. Notices contain only brief wording and stable OV codes, without local paths, underlying exceptions, or implementation notes about reexecution. Delivery failures never change the Agent terminal state or rerun the Agent or commands. Text retries for one final effect reuse completed attachment preparation.

### OV error convention

Gateway errors use `OV_<DOMAIN>_<REASON>` and a shared registry in the SDK `errors/` layer. Codes, categories, and user messages are maintained independently. This change integrates artifact preparation and file cards while preserving existing IM connection recovery/confirmation facts and Runtime execution codes. Future Gateway user errors follow the same convention; published codes must not change meaning.

| OV code | Category | Meaning |
| --- | --- | --- |
| `OV_DELIVERY_PATH_INVALID` | validation | Invalid local path, missing resolution base, or unsupported path form on this host |
| `OV_DELIVERY_READ_FAILED` | io | Missing or unreadable file, or a file that changed during reading |
| `OV_DELIVERY_POLICY_DENIED` | permission | File violates host root or MIME policy |
| `OV_DELIVERY_FILE_COUNT_LIMIT` | limit | Too many files |
| `OV_DELIVERY_FILE_SIZE_LIMIT` | limit | Per-file byte limit, including upload HTTP 413 |
| `OV_DELIVERY_TOTAL_SIZE_LIMIT` | limit | Total byte limit |
| `OV_DELIVERY_TIMEOUT` | timeout | Artifact preparation or upload timed out |
| `OV_DELIVERY_UPLOAD_FAILED` | network | Upload or upload confirmation failed |
| `OV_DELIVERY_CARD_FAILED` | network | File card explicitly failed to send |
| `OV_DELIVERY_CARD_UNCONFIRMED` | unknown | File card delivery is unconfirmed |

Notices deduplicate codes within a reply, for example `部分附件未能发送（OV_DELIVERY_READ_FAILED）。`. When logging is configured, ordinary logs record `delivery.failure` with the code, stage, `diag_` diagnostic ID, sanitized native code, and a hashed effect correlation. Diagnostic causes, attachment contents, credentials, and local paths do not appear in user notices or component status mirrors. No additional log files are created without logging configuration. Owner cancellation, identity revocation, and shutdown retain their existing cancellation paths rather than becoming attachment timeouts.

Default maximums are 20 MiB per file, 50 MiB total, 16 files, and 30 seconds. Configuration can tighten these bounds but cannot exceed them. Omitting allowed_roots adds no extra root restriction; an empty array denies all files. This changes neither the Agent workspace nor other path checks. Model Context cannot expand host policy. See [Configuration](../reference/configuration.md) and [artifact policy](../../../packages/octo-channel-gateway-sdk/src/delivery/artifact-policy.ts).
