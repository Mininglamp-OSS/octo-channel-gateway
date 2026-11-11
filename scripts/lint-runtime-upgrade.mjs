// 仅显式本地运行：pnpm build && node scripts/lint-runtime-upgrade.mjs。
// 检查本次升级边界及可静态发现的遗留；不加入默认测试或 GitHub CI。
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertAgentEnv, assertInvokeInput } from "@mininglamp-oss/octo-runtime-client/protocol";
import { prepareKernelInput } from "../packages/octo-channel-gateway-sdk/dist/execution/kernel-input.js";
import { modelContextPresentation } from "../packages/octo-channel-gateway-sdk/dist/execution/model-input.js";
import { addRulesRecovery } from "../packages/octo-channel-gateway-sdk/dist/application/rules-context.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const walk = (path) => readdirSync(resolve(root, path), { withFileTypes: true }).flatMap((entry) => {
  const child = join(path, entry.name);
  return entry.isDirectory() ? walk(child) : [child];
});
const failures = [];
async function check(name, run) {
  try { await run(); console.log(`PASS ${name}`); }
  catch (error) { failures.push(name); console.error(`FAIL ${name}: ${error.message}`); }
}

await check("manifest, lock and installed public Runtime/client are aligned to 1.1.14", () => {
  const manifest = JSON.parse(read("package.json"));
  for (const [section, name] of [["dependencies", "octo-runtime-client"], ["devDependencies", "octo-runtime"]]) {
    assert.equal(manifest[section][`@mininglamp-oss/${name}`], "^1.1.14");
    assert.equal(JSON.parse(read(`node_modules/@mininglamp-oss/${name}/package.json`)).version, "1.1.14");
    assert.match(read("pnpm-lock.yaml"), new RegExp(`${name}@1\\.1\\.14`));
  }
  assert.doesNotMatch(read("pnpm-lock.yaml"), /octo-runtime(?:-client)?@1\.1\.13|specifier: \^1\.1\.13/);
});

await check("current documentation and executable examples contain no obsolete requirements or API usage", () => {
  const obsoleteApi = /\b(?:loadMaterials|loadContexts|material_loading|materials)["']?\s*[:(]|\b(?:ChannelRegistry|ChannelDefinition|ChannelRegistration|BusinessMaterial|build_im_contexts)\b/;
  // 文档以 JSON extraset 为主，带引号的键与 SDK 对象属性均须检出。
  for (const example of ['{"materials":[]}', '{"material_loading":{}}', "{ 'loadMaterials': callback }", "{ loadContexts() {} }"])
    assert.ok(obsoleteApi.test(example), `Lint detector missed ${example}`);
  const files = ["README.md", "apps/cli/src/runtime-prerequisite.ts", ...walk("docs")];
  for (const file of files) {
    if (!/\.(md|mts|json|ts)$/.test(file)) continue;
    const source = read(file);
    assert.doesNotMatch(source, /1\.1\.13|verify-runtime-1\.1\.13/, file);
    const examples = file.endsWith(".md")
      ? [...source.matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map((m) => m[1]).join("\n") : source;
    assert.doesNotMatch(examples, obsoleteApi, file);
  }
});

await check("removed modules and obsolete compiled artifacts are absent", () => {
  for (const path of ["packages/octo-channel-gateway-sdk/src/materials.ts", "packages/octo-channel-gateway-sdk/src/support/material-loader.ts",
    "scripts/verify-materials.mjs", "scripts/verify-runtime-1.1.13.mjs",
    "packages/octo-channel-gateway-sdk/src/transport/contexts.ts", "packages/octo-channel-gateway-sdk/src/transport/message-trigger.ts"])
    assert.equal(existsSync(resolve(root, path)), false, path);
  const generated = new Set(["dist/index.js", "dist/index.d.ts", "dist/apps/cli/src/index.js"]);
  for (const path of [...walk("dist"), ...walk("packages/octo-channel-gateway-sdk/dist"), ...walk("apps/cli/dist"), ...walk("packages/cross-service/dist")]) {
    assert.doesNotMatch(path, /\/(?:materials|material-loader)\.(?:js|d\.ts)(?:\.map)?$/, path);
    if (!path.endsWith(".js") && !path.endsWith(".d.ts")) continue;
    if (generated.has(path)) continue;
    const source = path.replace("/dist/", "/src/").replace(/(?:\.d)?\.ts$|\.js$/, ".ts");
    assert.ok(existsSync(resolve(root, source)), `Orphan build output: ${path}`);
  }
});

await check("production source modules are reachable and relative imports resolve", () => {
  // 仅检查静态相对 import/export 、字面量 dynamic import 与 Worker URL；类型引用计入依赖。
  // 不是通用的未使用变量/分支证明，类型检查与独立审查负责其余部分。
  const files = [...walk("packages/octo-channel-gateway-sdk/src"), ...walk("apps/cli/src")].filter((p) => p.endsWith(".ts"));
  const graph = new Map();
  for (const file of files) {
    const source = read(file);
    const imports = [...source.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*|\bnew\s+URL\(\s*)["']([^"']+)["']/g)].filter((m) => !m[0].startsWith("new") || m[1].endsWith(".js")).map((m) => m[1]).filter(target => target.startsWith(".") || target.startsWith("@mininglamp-oss/octo-channel-gateway-sdk"));
    graph.set(file, imports.map((target) => {
      let candidate;
      if (target.startsWith(".")) candidate = relative(root, resolve(root, dirname(file), target.replace(/\.js$/, ".ts")));
      else {
        const packageRoot = "packages/octo-channel-gateway-sdk";
        const manifest = JSON.parse(read(packageRoot + "/package.json"));
        const key = target.replace("@mininglamp-oss/octo-channel-gateway-sdk", ".").replace(/^\.\//, "./");
        candidate = join(packageRoot, manifest.exports[key].import.replace("./dist/", "src/").replace(/\.js$/, ".ts"));
      }
      assert.ok(existsSync(resolve(root, candidate)), `${file}: unresolved ${target}`);
      return candidate;
    }));
  }
  const reachable = new Set();
  function visit(file) { if (reachable.has(file)) return; reachable.add(file); for (const next of graph.get(file) ?? []) visit(next); }
  visit("packages/octo-channel-gateway-sdk/src/index.ts");
  visit("apps/cli/src/index.ts");
  assert.deepEqual(files.filter((file) => !reachable.has(file)), [], "Unreachable production modules");
});

await check("channel drafts render only into inputs; private AgentEnv stays opaque; old item fields reject", () => {
  const schema = "octo.context-envelope/v3";
  const fact = { namespace: "extra.im", name: "upgrade-check", payload: { guidance: "channel-only", data_format: "text", text: "event-only ]]>" } };
  const execution = { namespace: "adapter.business", name: "private", payload: { guidance: { opaque: true }, data_format: "private", value: 42 } };
  const request = {
    protocol_mode: "canonical", inputs: [{ type: "text", text: "question" }],
    contexts: { schema, items: [fact] }, agentItems: [execution],
  };
  const before = structuredClone(request);
  addRulesRecovery(request, [fact]);
  const { inputs, agentEnv } = prepareKernelInput(request);
  const { parts, ...metadata } = inputs;
  assertInvokeInput({ ...metadata, inputs: parts, sessionId: "lint-session", agentEnv });
  assert.throws(() => assertInvokeInput({ ...metadata, inputs: parts, sessionId: "lint-session", agentEnv,
    contexts: request.contexts }), /unknown field|contexts/i);
  for (const forbidden of ["contexts", "agentEnv", "signal", "agentItems", "preparedInput", "hooksInvoked"])
    assert.equal(Object.hasOwn(inputs, forbidden), false, forbidden);
  assert.deepEqual(agentEnv, { schema, items: [execution] });
  assert.equal(inputs.parts.at(-1).text, "question");
  assert.match(inputs.parts[0].text, /<context namespace="extra.im" name="upgrade-check">/);
  assert.equal((inputs.freshFallbackModelInput.match(/channel-only/g) ?? []).length, 2); // 主前缀和显式恢复文本各一次。
  assert.doesNotMatch(inputs.parts[0].text, /data_format|"guidance"/);
  assert.deepEqual(request.contexts, before.contexts);
  for (const field of ["guidance", "data_format"])
    assert.throws(() => assertAgentEnv({ schema, items: [{ ...execution, [field]: "old" }] }), /CONTEXT_SCHEMA_INVALID/);
  assert.throws(() => modelContextPresentation({ ...fact, payload: { data_format: "text", text: 42 } }), /IM_MODEL_CONTEXT_INVALID/);
  const task = read("packages/octo-channel-gateway-sdk/src/execution/task.ts");
  assert.match(task, /this\.kernel\.invoke\(prepared\.inputs, request\.sessionId, request\.providerSession, prepared\.agentEnv\)/);
  assert.doesNotMatch(task, /process\.env|agent_run\.client_input|OCO_CHANNEL_GATEWAY_DEUBG/);
});

if (failures.length) process.exitCode = 1;
else console.log("Upgrade lint passed. Historical Octospec records are excluded; run docs:check and the explicit runtime verification separately.");
