# Lifecycle and delivery

[简体中文](../../zh-CN/guides/lifecycle-and-delivery.md) | [Documentation](../README.md)

Successful registration means composition and connection initialization completed. registration.status is the Manager's current Bot diagnostic snapshot, not a full task history. The readonly interface does not make every diagnostic field a permanently stable schema.

## Closing

Await registration.close when the application finishes. Close stops admission, requests cancellation of owned executions, consumes tails, finishes delivery and business cleanup, closes callback pools and owned session handles, then releases the client. These stages share a four-second deadline. Repeated close calls return the same Promise. Rejection means cleanup did not complete successfully.

Aborting definition.signal triggers closure, but abort() cannot synchronously report asynchronous cleanup failure; still await close. The SDK does not own the shared Kernel or sibling registrations. CLI stop/uninstall also does not replace Runtime shutdown commands.

## Execution and delivery

Cancellation acknowledgement, execution terminal, resource cleanup, and message delivery are separate facts. Delivery can fail after run.completed, and delivery failure must not rerun the Provider. Preserve original invocation identity when outcomes are unknown or timed out; a missing UI result does not justify creating another execution.

Each Bot has at most 64 work slots and each logical session has a separate queue allowance of 4. Delivery cleanup still occupies the work slot. Delivery receipt caches are bounded and do not guarantee exactly-once delivery across process restarts.

Final response accumulation has a separate limit of 128 messages and 1 MiB of UTF-8 text. Exceeding either reports `IM_FINAL_OUTPUT_LIMIT_EXCEEDED` and enters the existing interrupt/result-unknown path. Partial text is not delivered as a successful final response and does not trigger automatic artifact upload. Invalid interaction form submissions are diagnosed and acknowledged individually so later valid card actions can proceed; transport and acknowledgement failures retain their retry behavior.

## Artifacts

artifact_delivery.mode defaults to channel. Explicit local file references in a successful final response are checked against frozen path, MIME, count, size, and cancellation budgets before delivery. This does not upload every path appearing in model output. tools mode disables automatic upload and expects business tools to provide recipient-accessible links.

Default maximums are 20 MiB per file, 50 MiB total, 16 files, and 30 seconds. Configuration can tighten these bounds but cannot exceed them. Omitting allowed_roots adds no extra root restriction; an empty array denies all files. This changes neither the Agent workspace nor other path checks. Model Context cannot expand host policy. See [Configuration](../reference/configuration.md) and [artifact policy](../../../packages/gateway/src/delivery/artifact-policy.ts).
