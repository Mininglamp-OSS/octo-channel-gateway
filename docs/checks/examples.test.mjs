import assert from "node:assert/strict";
import test from "node:test";
import { validateImConfig } from "@mininglamp-oss/octo-channel-gateway";
import { assertModelInputParts } from "@mininglamp-oss/octo-runtime-client/protocol";
import { withChannel } from "../examples/registration.mts";
import { createDefinition } from "../examples/definition.mts";
import { kernelFixture } from "../../test/kernel-fixture.js";

test("documented registration scopes cleanup and preserves the real Kernel on success and failure", async (t) => {
  const kernel = await kernelFixture(t);
  const definition = {
    bot: {
      botId: "docs",
      apiUrl: "https://example.test/api",
      enabled: false,
    },
    agent: { adapter_type: "test", workdir: kernel.directory },
  };
  let registration;
  assert.equal(
    await withChannel(kernel.client, [definition], async (value) => {
      registration = value;
      assert.equal(value.status.length, 1);
      return "served";
    }),
    "served",
  );
  await registration.close();
  const failure = new Error("application stopped");
  await assert.rejects(
    withChannel(kernel.client, [definition], async () => {
      throw failure;
    }),
    (error) => error === failure,
  );
  assert.equal((await kernel.client.status()).execution_ready, true);
});

test("documented host callbacks keep credentials separate and observe cancellation", async () => {
  const definition = createDefinition({
    botId: "docs",
    apiUrl: "https://example.test/api",
    workdir: process.cwd(),
    readToken: async () => "documentation-only-credential",
    readBrief: async (signal) => {
      signal.throwIfAborted();
      return "Application material";
    },
  });
  const config = { api_url: definition.bot.apiUrl, bot_id: definition.bot.botId, agent: definition.agent };
  validateImConfig(config);
  const controller = new AbortController();
  const items = await definition.bot.loadMaterials(config, {
    signal: controller.signal,
  });
  assertModelInputParts(items.flatMap((item) => item.parts));
  const credential = await definition.bot.credentials(
    config,
    controller.signal,
  );
  assert.ok(!JSON.stringify(items).includes(credential));
  controller.abort(new Error("host cancelled"));
  await assert.rejects(
    definition.bot.loadMaterials(config, { signal: controller.signal }),
    /host cancelled/,
  );
});
