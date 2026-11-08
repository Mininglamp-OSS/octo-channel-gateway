import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fromMarkdown } from "mdast-util-from-markdown";
import { validateImBots } from "@mininglamp-oss/octo-channel-gateway";

// 本地与 CI 共用文档检查；共享示例用公开 SDK 校验。
const root = resolve(import.meta.dirname, "..");
async function files(directory) {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...(await files(path)));
    else if (path.endsWith(".md")) found.push(path);
  }
  return found.sort();
}
function* nodes(node) {
  yield node;
  for (const child of node.children ?? []) yield* nodes(child);
}
const pages = new Map();
const paths = [...(await files(join(root, "docs"))), join(root, "README.md")];
const examples = await Promise.all(
  ["registration.mts", "definition.mts"].map(async (name) =>
    (await readFile(join(root, "docs/examples", name), "utf8")).trim(),
  ),
);
let links = 0,
  jsonExamples = 0;
for (const path of paths) {
  const source = await readFile(path, "utf8");
  const all = [...nodes(fromMarkdown(source))];
  const definitions = new Map(
    all
      .filter((node) => node.type === "definition")
      .map((node) => [node.identifier, node.url]),
  );
  const targets = [];
  for (const node of all.filter((node) =>
    ["link", "image", "linkReference", "imageReference"].includes(node.type),
  )) {
    const url = node.url ?? definitions.get(node.identifier);
    assert.ok(url, `${path}: unresolved reference`);
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(url)) continue;
    const [target, fragment] = url.split("#");
    assert.ok(
      !fragment,
      `${path}: use whole-page links until anchor checks are supported`,
    );
    const destination = resolve(dirname(path), decodeURIComponent(target));
    const suffix = relative(root, destination);
    assert.ok(
      !isAbsolute(suffix) && suffix !== ".." && !suffix.startsWith(`..${sep}`),
      `${path}: link escapes repository`,
    );
    assert.ok(
      await stat(destination).catch(() => undefined),
      `${path}: broken link ${url}`,
    );
    targets.push(destination);
    links++;
  }
  const blocks = all.filter((node) => node.type === "code");
  for (const block of blocks) {
    if (block.lang === "json") {
      const value = JSON.parse(block.value);
      if (value.bots) validateImBots(value.bots);
      jsonExamples++;
    }
    if (path.includes(`${sep}docs${sep}`) && block.lang === "ts")
      assert.ok(
        examples.includes(block.value.trim()),
        `${path}: TypeScript example differs from type-checked shared files`,
      );
  }
  pages.set(path, { targets, blocks });
}
const english = await files(join(root, "docs/en"));
const chinese = await files(join(root, "docs/zh-CN"));
assert.ok(english.length > 0);
assert.equal(english.length, chinese.length);
for (const path of english) {
  const counterpart = join(
    root,
    "docs/zh-CN",
    relative(join(root, "docs/en"), path),
  );
  const en = pages.get(path),
    zh = pages.get(counterpart);
  assert.ok(zh, `Missing Chinese page: ${counterpart}`);
  assert.ok(
    en.targets.includes(counterpart) && zh.targets.includes(path),
    `Missing reciprocal language link: ${path}`,
  );
  assert.deepEqual(
    en.blocks.map(({ lang, value }) => [lang, value]),
    zh.blocks.map(({ lang, value }) => [lang, value]),
    `Bilingual examples differ: ${path}`,
  );
}
const config = JSON.parse(
  await readFile(join(root, "docs/examples/gateway.json"), "utf8"),
);
validateImBots(config.bots);
console.log(
  `Developer docs: ${english.length} paired pages, ${paths.length} Markdown files, ${links} local links, ${jsonExamples} JSON blocks; shared code matches.`,
);
