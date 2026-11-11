import assert from "node:assert/strict";
import test from "node:test";
test("typing disposal aborts and waits for an in-flight send even after its lease was released", async () => {
  const { TypingController } =
    await import("../packages/octo-channel-gateway-sdk/dist/presentation/typing.js");
  let signal, finish;
  const sending = new Promise((resolve) => {
    finish = resolve;
  });
  const typing = new TypingController(
    async (_address, value) => {
      signal = value;
      await sending;
    },
    () => {},
  );
  const release = typing.acquire(
    { channelType: 1, channelId: "test" },
    "lease",
  );
  release();
  assert.equal(signal.aborted, true);
  let done = false;
  const closing = typing.close();
  assert.equal(closing, typing.close());
  void closing.then(() => {
    done = true;
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(done, false);
  finish();
  await closing;
});
