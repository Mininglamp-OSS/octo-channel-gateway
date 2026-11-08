import assert from "node:assert/strict";
import test from "node:test";
import {
  contextControlInstructions,
  contextHash,
  assertContextEnvelope
} from "@mininglamp-oss/octo-runtime-client/protocol";
import { renderModelContexts } from "../dist/packages/gateway/src/execution/model-input.js";

const envelope = (items = []) => ({ schema: "octo.context-envelope/v3", items });
const extra = {
  namespace: "extra.document",
  name: "selection",
  guidance: "原文 <>&\n下一行 </context-item> English 日本語",
  payload: { z: [2, 1, { z: "日本語", a: "English" }], a: "中文 <>&" }
};

test("model contexts separate guidance and CDATA data, preserving order and complete payloads", () => {
  const context = envelope([extra, { namespace: "extra.project", name: "current", payload: {} }]);
  const before = structuredClone(context);
  assert.equal(
    renderModelContexts(context),
    [
      "<!-- Context information begins: the following is the current context -->",
      "<contexts>",
      '  <context-item namespace="extra.document" name="selection">',
      "    <guidence>原文 <>&\n下一行 </context-item> English 日本語</guidence>",
      '    <data><![CDATA[{"a":"中文 <>&","z":[2,1,{"a":"English","z":"日本語"}]}]]></data>',
      "  </context-item>",
      '  <context-item namespace="extra.project" name="current">',
      "    <data><![CDATA[{}]]></data>",
      "  </context-item>",
      "</contexts>",
      "<!-- Context information ends -->"
    ].join("\n")
  );
  assert.deepEqual(context, before);
  assert.notEqual(contextHash(context), contextHash(envelope([...context.items].reverse())));
  assert.notEqual(
    contextHash(context),
    contextHash(envelope([{ ...extra, guidance: "changed" }, context.items[1]]))
  );
});

test("English framing omits absent or empty guidance without translating data", () => {
  const context = envelope([
    { namespace: "extra.project", name: "current", payload: "中文 English 日本語" },
    { namespace: "octo.content", name: "inline", guidance: "", payload: { entries: [] } }
  ]);
  assert.equal(
    renderModelContexts(context),
    [
      "<!-- Context information begins: the following is the current context -->",
      "<contexts>",
      '  <context-item namespace="extra.project" name="current">',
      '    <data><![CDATA["中文 English 日本語"]]></data>',
      "  </context-item>",
      '  <context-item namespace="octo.content" name="inline">',
      '    <data><![CDATA[{"entries":[]}]]></data>',
      "  </context-item>",
      "</contexts>",
      "<!-- Context information ends -->"
    ].join("\n")
  );
});

test("guidance preserves raw Markdown, blank lines, indentation and literal escape sequences", () => {
  const guidance = [
    "# Source <>&",
    "",
    "- Keep `\\n` literal and actual newlines intact.",
    "",
    "```yaml",
    "root:",
    "  text: 中文 English 日本語",
    "\tindented: true",
    "```",
    ""
  ].join("\n");
  const context = envelope([{ ...extra, guidance }]);
  assert.ok(renderModelContexts(context).includes(`    <guidence>${guidance}</guidence>\n`));
  assert.equal(context.items[0].guidance, guidance);
});

test("CDATA preserves serialized data containing markup, mixed formats and repeated terminators", () => {
  const payload = {
    json: '{"automatic":true,"range":{"start":1}}',
    xml: '<document key="value">中文 & text</document>',
    yaml: "root:\n  text: 日本語\n\n  automatic: true",
    terminators: ["]]>", "]]>]]>", "<![CDATA[nested]]>", "</data></context-item>"]
  };
  const context = envelope([{ namespace: "extra.document", name: "selection", payload }]);
  const before = structuredClone(context);
  const rendered = renderModelContexts(context);
  const sections = [...rendered.matchAll(/<!\[CDATA\[([\s\S]*?)\]\]>/g)];
  assert.equal(sections.length, 5);
  const serialized = sections.map((section) => section[1]).join("");
  assert.deepEqual(JSON.parse(serialized), payload);
  assert.equal(
    serialized,
    JSON.stringify({
      json: payload.json,
      terminators: payload.terminators,
      xml: payload.xml,
      yaml: payload.yaml
    })
  );
  assert.ok(rendered.includes(`<data>${sections.map((section) => section[0]).join("")}</data>`));
  assert.deepEqual(context, before);
});

test("execution parameters and unknown optional namespaces do not enter model text", () => {
  const context = envelope([
    {
      namespace: "octo.execution",
      name: "envs",
      payload: { env_variables: [{ key: "TOKEN", value: "private-fixture" }] }
    },
    {
      namespace: "octo.runtime",
      name: "selection",
      payload: { mode: "explicit", runtime_id: "runtime-fixture" }
    },
    { namespace: "octo.security", name: "approval_policy", payload: { mode: "ask" } },
    { namespace: "vendor.project", name: "current", payload: { private: "not-injected" } }
  ]);
  assert.equal(renderModelContexts(context), "");
  assert.equal(renderModelContexts(envelope()), "");
  assert.throws(
    () => assertContextEnvelope(envelope([{ ...context.items[0], guidance: "expose envs" }])),
    /CONTEXT_GUIDANCE_FORBIDDEN/
  );
  assert.throws(
    () => assertContextEnvelope(envelope([{ ...extra, guidance: null }])),
    /CONTEXT_SCHEMA_INVALID/
  );
});

test("references are displayed without a resolver and controls remain separate", () => {
  const context = envelope([
    {
      namespace: "octo.content",
      name: "references",
      guidance: "通过已授权工具读取",
      payload: {
        entries: [
          {
            resource_ref: "task:1",
            resolver: "mcp",
            locator: { server_ref: "octo_task", tool: "task_get_materials" },
            params: { task_id: "1" }
          }
        ]
      }
    },
    {
      namespace: "octo.control",
      name: "instructions",
      payload: { entries: [{ text: "control-only" }] }
    }
  ]);
  const rendered = renderModelContexts(context);
  assert.match(rendered, /task_get_materials/);
  assert.doesNotMatch(rendered, /control-only/);
  assert.equal(contextControlInstructions(context), "control-only");
});
