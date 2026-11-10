# Lifecycle and delivery

[简体中文](../../zh-CN/guides/lifecycle-and-delivery.md) | [Documentation](../README.md)

Successful registration means composition and connection initialization completed. registration.status is the Manager's current Bot diagnostic snapshot, not a full task history. The readonly interface does not make every diagnostic field a permanently stable schema.

## Closing

Await registration.close when the application finishes. Close stops admission, requests cancellation of owned executions, consumes tails, finishes delivery and business cleanup, closes callback pools and owned session handles, then releases the client. These stages share a four-second deadline. Repeated close calls return the same Promise. Rejection means cleanup did not complete successfully.

Aborting definition.signal triggers closure, but abort() cannot synchronously report asynchronous cleanup failure; still await close. The SDK does not own the shared Kernel or sibling registrations. CLI stop/uninstall also does not replace Runtime shutdown commands.

## Embedding and shutdown contract (target API)

This section specifies the planned ChannelGateway instance API; the ChannelRegistry API above does not yet implement it. See [Architecture and ownership](../concepts/architecture.md) for Runtime injection.

- Keep `await gateway.register({ bot, agent })`: add or replace by stable Bot identity while running. Success means initialization completed; no separate start is required. Replacement cleans up only that identity's old binding. A brief interruption is possible; automatic restoration of the old configuration is not promised.
- The host needs only `await gateway.close()` to clean up the whole Gateway, without registration handles or individual Bot shutdown. Close must stop message/execution admission, cancel queued registrations, coordinate initialization/replacement in progress and clean up resources that arrive late. Closed instances reject registration; repeated close calls share one Promise.
- Successful close must release Bot sockets, reconnect/heartbeat timers, event listeners, owned executions and observers, delivery tasks, material callbacks and owned session-store handles. No background reconnect or delivery may remain. Clearing a registry or disconnecting a client alone is insufficient.
- Failure of one cleanup step must not skip the remaining resources. Aggregate failures and unfinished items at the end. Timeout does not prove release; a host callback that ignores cancellation must be reported as unfinished. The host records errors and decides its exit policy; rejection must not be interpreted as successful cleanup.
- Gateway manages only its own invocations. It must not call global stopAdmission/drain/close on a borrowed client, shut down a shared Kernel or close a host Engine. The host waits for Gateway cleanup before releasing owned Runtime resources. Failure of an earlier step must not skip later cleanup attempts or hide their errors.

Electron should own Gateway in its main process. During normal before-quit, synchronously preventDefault and start host cleanup once; await success before allowing a second app.quit. Electron does not automatically await a listener's Promise, and closing a window does not necessarily exit the application. This coordination belongs to the host, not the SDK; no SDK waitForShutdown is needed. CLI hosts likewise await close on exit and failure paths. Forced termination, crashes and system interruption cannot guarantee callback execution and require host/Runtime recovery mechanisms. See [Electron before-quit](https://www.electronjs.org/docs/latest/api/app#event-before-quit).

Migration verification must cover repeated registration and token rotation, concurrent replacement, initialization/rollback failures, register/close races, idempotent close, uncooperative cancellation and shared-client isolation. Inspect actual resources and invocation identities; process exit alone does not prove leak-free cleanup. Run focused checks explicitly locally without expanding CI.

## Execution and delivery

Cancellation acknowledgement, execution terminal, resource cleanup, and message delivery are separate facts. Delivery can fail after run.completed, and delivery failure must not rerun the Provider. Preserve original invocation identity when outcomes are unknown or timed out; a missing UI result does not justify creating another execution.

Each Bot has at most 64 work slots and each logical session has a separate queue allowance of 4. Delivery cleanup still occupies the work slot. Delivery receipt caches are bounded and do not guarantee exactly-once delivery across process restarts.

Final response accumulation has a separate limit of 128 messages and 1 MiB of UTF-8 text. Exceeding either reports `IM_FINAL_OUTPUT_LIMIT_EXCEEDED` and enters the existing interrupt/result-unknown path. Partial text is not delivered as a successful final response and does not trigger automatic artifact upload. Invalid interaction form submissions are diagnosed and acknowledged individually so later valid card actions can proceed; transport and acknowledgement failures retain their retry behavior.

## Artifacts

artifact_delivery.mode defaults to channel. Explicit local file references in a successful final response are checked against frozen path, MIME, count, size, and cancellation budgets before delivery. This does not upload every path appearing in model output. tools mode disables automatic upload and expects business tools to provide recipient-accessible links.

Default maximums are 20 MiB per file, 50 MiB total, 16 files, and 30 seconds. Configuration can tighten these bounds but cannot exceed them. Omitting allowed_roots adds no extra root restriction; an empty array denies all files. This changes neither the Agent workspace nor other path checks. Model Context cannot expand host policy. See [Configuration](../reference/configuration.md) and [artifact policy](../../../packages/gateway/src/delivery/artifact-policy.ts).
