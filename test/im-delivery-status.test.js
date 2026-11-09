import assert from "node:assert/strict";
import test from "node:test";
import { ImRuntime as GatewayRuntime } from "../dist/packages/gateway/src/application/im-channel.js";
import { ImDeliveryDispatcher as GatewayDelivery } from "../dist/packages/gateway/src/delivery/dispatcher.js";
import { GatewayTransport } from "../dist/packages/gateway/src/transport/channel.js";

for (const [name, Dispatcher] of [["Gateway", GatewayDelivery]]) {
  test(`${name} exposes only the count of its bounded receipt cache`, async () => {
    const delivery = new Dispatcher(new AbortController().signal);
    assert.equal(delivery.receiptCount, 0);
    for (let index = 0; index < 10_000; index++)
      await delivery.deliver(
        `private-effect-${index}`,
        async () => `private-message-${index}`,
      );
    assert.equal(delivery.receiptCount, 512);
    const cached = await delivery.deliver("private-effect-9999", async () =>
      assert.fail("duplicate send"),
    );
    assert.equal(cached.messageId, "private-message-9999");
    assert.equal(delivery.receiptCount, 512);
    assert.equal(delivery.receipts, undefined, "no public receipt-list getter");
  });

  test(`${name} counts existing receipts without changing in-flight or failed delivery behavior`, async () => {
    const delivery = new Dispatcher(new AbortController().signal);
    let release;
    const operation = delivery.deliver(
      "pending",
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    assert.equal(delivery.receiptCount, 1);
    release("message");
    assert.equal((await operation).messageId, "message");
    assert.equal(delivery.receiptCount, 1);
    const unknown = await delivery.deliver(
      "unknown",
      async () => {
        throw new Error("unknown");
      },
      { transient: true },
    );
    assert.equal(unknown.state, "unknown");
    assert.equal(delivery.receiptCount, 2);
  });
}

test("Gateway status expose receipt totals instead of delivery details", () => {
  const config = {
    bot_id: "fixture",
    api_url: "https://im-test.deepminer.com.cn/api",
    agent: { adapter_type: "codex" },
  };
  const transport = new GatewayTransport(config, async () => undefined, {});
  assert.equal(transport.status.cardDeliveries, 0);
  for (const Runtime of [GatewayRuntime]) {
    const runtime = new Runtime(
      Runtime === GatewayRuntime
        ? config
        : {
            bot_id: "fixture",
            agent: { adapter_type: "codex", workdir: process.cwd() },
          },
      {},
    );
    assert.equal(runtime.status.deliveries, 0);
  }
});
