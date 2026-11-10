import assert from "node:assert/strict";
import test from "node:test";
import {
  createMaterialLoader,
  mergeConfiguredMaterials,
} from "../dist/packages/gateway/src/support/material-loader.js";

const signal = () => new AbortController().signal;
const item = (name, text) => ({
  name,
  parts: [{ type: "text", text }],
});
const control = (...texts) => ({
  name: "instructions",
  parts: texts.map((text) => ({ type: "text", text })),
});
const config = {
  materials: [
      control("我是明略科技的Octo助理"),
      item("first", "base"),
      item("last", "last"),
  ],
};

test("dynamic contexts replace whole items at the base position, append in order and never mutate config", () => {
  const dynamic = [
    item("first", "dynamic"),
    control("override", "override", "  preserved\n"),
    item("new", "new"),
  ];
  const merged = mergeConfiguredMaterials(config.materials, dynamic);
  assert.deepEqual(
    merged.map((i) => i.name),
    ["instructions", "first", "last", "new"],
  );
  assert.equal(
    merged[0].parts.map(({ text }) => text).join("\n"),
    "override\noverride\n  preserved\n",
  );
  merged[1].parts[0].text = "changed";
  assert.equal(dynamic[0].parts[0].text, "dynamic");
  assert.equal(config.materials[1].parts[0].text, "base");
});

test("sync and async callbacks load afresh, receive JSON copies and release every slot", async () => {
  for (const asynchronous of [false, true]) {
    let calls = 0;
    const loader = createMaterialLoader(
      (copy, options) => {
        assert.equal(options.signal.aborted, false);
        copy.materials.length = 0;
        const value = [item("first", String(++calls))];
        return asynchronous ? Promise.resolve(value) : value;
      },
      undefined,
      signal(),
    );
    for (let i = 1; i <= 2000; i++) {
      const result = await loader.load(config, signal());
      assert.equal(result[1].parts[0].text, String(i));
      assert.equal(loader.inFlight, 0);
    }
    assert.equal(config.materials.length, 3);
    await loader.close();
  }
});

test("unsettled timeout occupies capacity, late rejection is consumed and close aborts callbacks", async () => {
  let rejectOperation;
  let callbackSignal;
  const loader = createMaterialLoader(
    (_config, { signal }) => {
      callbackSignal = signal;
      return new Promise((_, reject) => {
        rejectOperation = reject;
      });
    },
    { timeout_ms: 5, max_in_flight: 1 },
    signal(),
  );
  await assert.rejects(
    loader.load(config, signal()),
    /IM_MATERIAL_LOADING_TIMEOUT/,
  );
  assert.equal(callbackSignal.aborted, true);
  assert.equal(loader.inFlight, 1);
  for (let i = 0; i < 100; i++)
    await assert.rejects(
      loader.load(config, signal()),
      /IM_MATERIAL_LOADING_BUSY/,
    );
  rejectOperation(new Error("late private failure"));
  await loader.close();
  assert.equal(loader.inFlight, 0);
});

test("owner cancellation completes waiting callers and closes cooperative I/O", async () => {
  const owner = new AbortController();
  const loader = createMaterialLoader(
    (_config, { signal }) =>
      new Promise((resolve) => {
        signal.addEventListener(
          "abort",
          () => resolve([item("late", "discarded")]),
          {
            once: true,
          },
        );
      }),
    undefined,
    owner.signal,
  );
  const pending = assert.rejects(
    loader.load(config, signal()),
    /IM_MATERIAL_LOADING_CANCELLED/,
  );
  await Promise.resolve();
  owner.abort();
  await pending;
  await loader.close();
  assert.equal(loader.inFlight, 0);
});

test("invalid, cyclic, oversized and duplicate results fail before invoke", async () => {
  const cycle = item("cycle", "");
  cycle.parts[0].self = cycle;
  const sparse = item("sparse", "");
  sparse.parts[0].values = new Array(2 ** 30);
  const customJson = item("custom", "");
  Object.defineProperty(customJson.parts[0], "toJSON", {
    value: () => {
      throw new Error("must not execute");
    },
  });
  for (const result of [
    [cycle],
    [sparse],
    [customJson],
    [item("large", "x".repeat(9 * 1024 * 1024))],
    [item("same", "a"), item("same", "b")],
    [item("bad", Infinity)],
    Array(33).fill(item("over", "")),
    { items: [] },
  ]) {
    const loader = createMaterialLoader(() => result, undefined, signal());
    await assert.rejects(loader.load(config, signal()));
    assert.equal(loader.inFlight, 0);
    await loader.close();
  }
});

test(
  "ten thousand completed context loads retain bounded heap after warmup",
  { skip: !global.gc },
  async (t) => {
    const loader = createMaterialLoader(
      () => [item("first", "dynamic")],
      undefined,
      signal(),
    );
    const batch = async (count) => {
      for (let i = 0; i < count; i++) {
        await loader.load(config, signal());
        if (i % 100 === 0)
          await new Promise((resolve) => setImmediate(resolve));
      }
      await new Promise((resolve) => setImmediate(resolve));
      global.gc();
    };
    await batch(1000);
    const before = process.memoryUsage().heapUsed;
    await batch(10000);
    const growth = process.memoryUsage().heapUsed - before;
    t.diagnostic(`retained heap growth after 10000 loads: ${growth} bytes`);
    assert.ok(growth < 8 * 1024 * 1024);
    assert.equal(loader.inFlight, 0);
    await loader.close();
  },
);
