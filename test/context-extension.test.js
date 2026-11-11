import assert from "node:assert/strict";
import test from "node:test";
import {
  assertContextEnvelope,
  contextHash,
  mergeContext,
  resolveContextConfiguration
} from "@mininglamp-oss/octo-runtime-client/protocol";
import { renderModelContexts } from "../dist/packages/gateway/src/execution/model-input.js";

const empty = () => ({ schema: "octo.context-envelope/v3", items: [] });
const external = () => ({
  ...empty(),
  items: [
    {
      namespace: "eva.project",
      name: "current",
      payload: { type: { nested: true }, project_id: "p1" }
    }
  ]
});

test("unknown items survive merge and hash but do not enter model or execution controls", () => {
  const context = external();
  assert.doesNotThrow(() => assertContextEnvelope(context));
  assert.deepEqual(mergeContext(empty(), context), context);
  assert.notEqual(contextHash(context), contextHash(empty()));
  assert.equal(renderModelContexts(context), "");
  context.items[0].payload.project_id = "p2";
  assert.notEqual(contextHash(context), contextHash(external()));
});

test("private items pass through defaults and mandatory configuration without registration", () => {
  for (const layer of ["defaults", "mandatory"]) {
    const configuration = { defaults: empty(), mandatory: empty(), [layer]: external() };
    assert.deepEqual(resolveContextConfiguration(configuration, empty()), external());
  }
});

test("payload validation belongs to the adapter while malformed envelopes are rejected", () => {
  assert.doesNotThrow(() =>
    assertContextEnvelope({
      ...empty(),
      items: [
        { namespace: "octo.security", name: "approval_policy", payload: { mode: "silently_allow" } }
      ]
    })
  );
  const context = external();
  context.items[0].payload = [];
  assert.throws(() => assertContextEnvelope(context), /CONTEXT_SCHEMA_INVALID/);
});

test("extra payload is rendered completely without Worker projection or registration", () => {
  const context = external();
  context.items[0].namespace = "extra.project";
  context.items[0].payload.guidance = "本轮项目";
  context.items[0].payload.additional = { complete: true };
  const rendered = renderModelContexts(context);
  assert.match(rendered, /本轮项目/);
  assert.match(rendered, /project_id/);
  assert.match(rendered, /"additional":\{"complete":true\}/);
});
