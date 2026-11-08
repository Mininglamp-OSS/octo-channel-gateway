import { invokeWire, gatewayDraft, gatewayWire } from "../test-support/kernel-mock.js";
import { octoCliEnvironment } from "@mininglamp-oss/octo-channel-gateway";
import {
  assertInvokeRequest,
  invocationInput,
  InvokeInput,
} from "@mininglamp-oss/octo-runtime-client/protocol";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { sanitizePublicValue } from "../dist/packages/gateway/src/support/public-display.js";
import { adapter } from "./fixtures/tool-environment-adapter.js";
import { nativeHost } from "./native-host-fixture.js";
import { invokeRequest } from "./runtime-fixture.js";

const token = `bf_${randomUUID()}`;
const base = "https://im-test.deepminer.com.cn";
const context = {
  schema: "octo.context-envelope/v3",
  items: [
    {
      namespace: "octo.execution",
      name: "envs",
      payload: {
        env_variables: [
          { key: "OCTO_BOT_TOKEN", value: "wrong-context" },
          { key: "OCTO_TOKEN", value: randomUUID() },
          { key: "OCTO_API_BASE_URL", value: "wrong-context" },
          { key: "EXTRA_TOOL_VALUE", value: "kept" },
          { key: "EXPECTED_TOKEN", value: token },
        ],
      },
    },
  ],
};

test("channel tool URL normalization removes only the final api segment", () => {
  for (const [input, expected] of [
    [`${base}/api/`, base],
    [base, base],
    [`${base}:8443/api`, `${base}:8443`],
    [`${base}/api/tools`, `${base}/api/tools`],
  ])
    assert.equal(
      octoCliEnvironment(input, token).env_variables[1].value,
      expected,
    );
  for (const input of [
    "file:///tmp/api",
    "https://user:pass@example.com/api",
    `${base}/api?x=1`,
    `${base}/api#x`,
  ])
    assert.throws(() => octoCliEnvironment(input, token), /IM_API_URL_INVALID/);
  assert.throws(() => octoCliEnvironment(base, ""), /IM_BOT_TOKEN_INVALID/);
});

test("tool overrides cross real Kernel RPC and reach child tools without changing Context", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "octo-tool-env-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const manifest = join(root, "adapters.json");
  await writeFile(
    manifest,
    JSON.stringify({
      version: 1,
      adapters: [
        {
          type: "tool-env",
          module: resolve("test/fixtures/tool-environment-adapter.js"),
          export: "adapter",
        },
      ],
    }),
  );
  const host = await nativeHost([adapter], {
    logging: { directory: join(root, "logs") },
  });
  t.after(() => host.close());
  const original = structuredClone(context);
  const execute = async (value, index) => {
    const ctx = structuredClone(context);
    ctx.items[0].payload.env_variables.find(
      (item) => item.key === "EXPECTED_TOKEN",
    ).value = value;
    const request = invokeRequest({
      invocationId: `tool-${index}`,
      runId: `tool-${index}`,
      approvalMode: "full_access",
      context: ctx,
    });
    const input = invocationInput(request, "canonical");
    input.agentEnv.items.unshift({
      namespace: "octo.execution",
      name: "adapter",
      payload: { type: "tool-env" },
    });
    const events = [];
    const prepared = gatewayWire(gatewayDraft(input), octoCliEnvironment(`${base}/api`, value));
    for await (const event of invokeWire(host.kernel.client, prepared))
      events.push(event);
    assert.deepEqual(
      JSON.parse(
        events.findLast((event) => event.type === "message.update").payload
          .text,
      ),
      {
        tokenMatches: true,
        canonicalMatches: true,
        baseMatches: true,
        extraKept: true,
      },
    );
  };
  await Promise.all([execute(token, 1), execute(`bf_${randomUUID()}`, 2)]);
  assert.deepEqual(context, original);
  await host.close();
  const log = (await readdir(join(root, "logs"))).find((name) =>
    /^kernel-\d{8}T\d{2}\.log$/.test(name),
  );
  assert.ok(!(await readFile(join(root, "logs", log), "utf8")).includes(token));
  const request = invokeRequest({
    context,
    executionEnvOverrides: octoCliEnvironment(`${base}/api`, token),
  });
  assert.equal(
    sanitizePublicValue(request).executionEnvOverrides,
    "[REDACTED]",
  );
  assert.throws(
    () =>
      InvokeInput.check({
        ...invocationInput(request),
        executionEnvOverrides: request.executionEnvOverrides,
      }),
    /local invoke environment/,
  );
  for (const invalid of [
    { env_variables: [{ key: "BAD-KEY", value: "x" }] },
    { env_variables: [{ key: "X", value: "a\0b" }] },
    {
      env_variables: [
        { key: "X", value: "a" },
        { key: "X", value: "b" },
      ],
    },
    { env_variables: [{ key: "X", value: "a".repeat(65536) }] },
  ])
    assert.throws(() =>
      assertInvokeRequest({ ...request, executionEnvOverrides: invalid }),
    );
});
