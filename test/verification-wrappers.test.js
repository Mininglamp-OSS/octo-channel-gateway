import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { inspect } from "node:util";
import vm from "node:vm";
import test from "node:test";
import { verificationCommandError } from "../scripts/verification-command.mjs";

const wrappers = [
  "channel-features",
  "channel-connection",
  "opencode-im",
  "im-diagnostic",
];
for (const name of wrappers) {
  test(`${name} original wrapper retains safe launch diagnostics`, async () => {
    const source = await readFile(
      new URL(`../scripts/verify-${name}-live.mjs`, import.meta.url),
      "utf8",
    );
    const helper = source.match(
      /^async function cli\(account, args, body\) \{[\s\S]*?^\}/m,
    )?.[0];
    assert.ok(helper);
    for (const code of ["ENOENT", "EINVAL", 7]) {
      const sensitive = randomUUID();
      const original = Object.assign(new Error(sensitive), {
        code,
        errno: code === "ENOENT" ? -4058 : undefined,
        stderr: sensitive,
        stdout: sensitive,
        cmd: sensitive,
      });
      const cli = vm.runInNewContext(`${helper}\ncli`, {
        execute: async () => {
          throw original;
        },
        verificationCommandError,
        process: { env: {} },
        assert,
        directory: ".",
        report: { endpoint: "https://im-test.deepminer.com.cn" },
      });
      await assert.rejects(
        cli({ api: "https://im-test.deepminer.com.cn/api" }, ["version"]),
        (error) => {
          assert.equal(error.code, code);
          assert.equal(error.errno, original.errno);
          assert.match(
            error.message,
            typeof code === "number" ? /exit:7/ : new RegExp(`spawn:${code}`),
          );
          assert.ok(!inspect(error).includes(sensitive));
          return true;
        },
      );
    }
  });
}
