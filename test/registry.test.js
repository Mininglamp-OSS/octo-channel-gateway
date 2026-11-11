import { ChannelGateway } from "@mininglamp-oss/octo-channel-gateway";
import assert from "node:assert/strict";
import test from "node:test";
import { GatewayTransport } from "../packages/octo-channel-gateway-sdk/dist/transport/channel.js";
import { kernelFixture } from "./kernel-fixture.js";

const agent = { adapter_type: "test", workdir: process.cwd() };
const bot = () => ({
  botId: "registry",
  bfToken: "bf_test",
  apiUrl: "https://example.test/api",
});

test("registration connects through public client, snapshots config and leaves Kernel live", async (t) => {
  const fixture = await kernelFixture(t);
  t.mock.method(globalThis, "fetch", async () => Response.json({ bot_uid: "registry", space_id: "space" }));
  t.mock.method(GatewayTransport.prototype, "start", async function () {});
  let closed = 0;
  t.mock.method(GatewayTransport.prototype, "close", async () => {
    closed++;
  });
  const definition = { bot: { ...bot(), botName: "" } };
  const registration = new ChannelGateway({ kernel: fixture.client });
  await registration.register(definition.bot, agent);
  t.after(() => registration.close());
  definition.bot.botId = "mutated";
  assert.equal(registration.status[0].bot_name, "registry");
  assert.equal(registration.status[0].state, "online");
  const closing = registration.close();
  assert.equal(closing, registration.close());
  await closing;
  assert.equal(closed, 1);
  assert.equal((await fixture.client.status()).execution_ready, true);
});

test("registration closes host handles on abort without stopping a sibling", async (t) => {
  const fixture = await kernelFixture(t);
  t.mock.method(globalThis, "fetch", async () => Response.json({ bot_uid: "registry", space_id: "space" }));
  t.mock.method(GatewayTransport.prototype, "start", async function () {});
  t.mock.method(GatewayTransport.prototype, "close", async () => {});
  const controller = new AbortController();
  let closes = 0;
  const { MemoryImSessionStore } =
    await import("../packages/octo-channel-gateway-sdk/dist/application/session-store.js");
  const store = new MemoryImSessionStore();
  const originalClose = store.close.bind(store);
  store.close = async () => {
    closes++;
    await originalClose();
  };
  const registration = new ChannelGateway({ kernel: fixture.client, signal: controller.signal });
  await registration.register({ ...bot(), createSessionStore: () => store }, agent);
  const sibling = new ChannelGateway({ kernel: fixture.client });
  await sibling.register(bot(), agent);
  t.after(() => sibling.close());
  controller.abort();
  await registration.close();
  assert.equal(closes, 1);
  assert.equal(sibling.status[0].state, "online");
  assert.equal((await fixture.client.status()).execution_ready, true);
});

test("registration rejects invalid input or unreachable Kernel and retains cleanup failure", async (t) => {
  await assert.rejects(
    new ChannelGateway({ kernel: {} }).register({ enabled: false }, agent),
    /IM_BOT_ID_REQUIRED/,
  );
  const fixture = await kernelFixture(t);
  t.mock.method(globalThis, "fetch", async () => Response.json({ bot_uid: "registry", space_id: "space" }));
  t.mock.method(GatewayTransport.prototype, "start", async () => {});
  t.mock.method(GatewayTransport.prototype, "close", async () => {
    throw new Error("private failure");
  });
  const registration = new ChannelGateway({ kernel: fixture.client });
  await registration.register(bot(), agent);
  const closing = registration.close();
  await assert.rejects(closing, /IM_DISPOSE_FAILED/);
  assert.equal(closing, registration.close());
  assert.equal((await fixture.client.status()).execution_ready, true);
});
