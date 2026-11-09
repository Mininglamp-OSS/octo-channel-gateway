import assert from "node:assert/strict";

/** npm 11 输出数组，npm 12 按包名索引；单包发布只接受一个匹配结果。 */
export function npmPackResult(output, packageName) {
  const parsed = JSON.parse(output);
  assert.ok(parsed && typeof parsed === "object", "Invalid npm pack result");
  if (!Array.isArray(parsed))
    assert.deepEqual(Object.keys(parsed), [packageName], "Unexpected npm pack packages");
  const results = Array.isArray(parsed) ? parsed : Object.values(parsed);
  assert.equal(results.length, 1, "Expected one npm pack result");
  const result = results[0];
  assert.ok(result && typeof result === "object", "Invalid npm pack package");
  assert.equal(result.name, packageName, "Unexpected npm pack package name");
  assert.ok(typeof result.version === "string", "Missing npm pack version");
  assert.ok(
    typeof result.filename === "string" &&
      /^[^/\\]+\.tgz$/.test(result.filename),
    "Invalid npm pack archive filename",
  );
  assert.ok(
    Array.isArray(result.files) &&
      result.files.every((file) => file && typeof file.path === "string"),
    "Invalid npm pack file list",
  );
  return result;
}
