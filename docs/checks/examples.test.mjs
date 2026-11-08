import assert from "node:assert/strict";
import test from "node:test";
import { validateImConfig } from "@mininglamp-oss/octo-channel-gateway";
import { assertContextEnvelope } from "@mininglamp-oss/octo-runtime-client/protocol";
import { withChannel } from "../examples/registration.mts";
import { createDefinition } from "../examples/definition.mts";
import { kernelFixture } from "../../test/kernel-fixture.js";

test("documented registration scopes cleanup and preserves the real Kernel on success and failure", async (t) => {
  const kernel = await kernelFixture(t);
  const definition = {
    bot: {
      bot_id: "docs",
      api_url: "https://example.test/api",
      enabled: false,
      adapter: { adapter_type: "test", workdir: kernel.directory },
    },
  };
  let registration;
  assert.equal(
    await withChannel(kernel.endpoint, definition, async (value) => {
      registration = value;
      assert.equal(value.endpoint, kernel.endpoint);
      return "served";
    }),
    "served",
  );
  await registration.close();
  const failure = new Error("application stopped");
  await assert.rejects(
    withChannel(kernel.endpoint, definition, async () => {
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
  validateImConfig(definition.bot);
  const controller = new AbortController();
  const items = await definition.loadContexts(definition.bot, {
    signal: controller.signal,
  });
  assertContextEnvelope({ schema: "octo.context-envelope/v3", items });
  const credential = await definition.credentials(
    definition.bot,
    controller.signal,
  );
  assert.ok(!JSON.stringify(items).includes(credential));
  controller.abort(new Error("host cancelled"));
  await assert.rejects(
    definition.loadContexts(definition.bot, { signal: controller.signal }),
    /host cancelled/,
  );
});
