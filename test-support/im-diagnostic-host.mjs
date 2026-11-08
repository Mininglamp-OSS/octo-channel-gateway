import { fileURLToPath } from "node:url";
import { createCodexAdapter } from "@mininglamp-oss/octo-runtime/adapters/codex";

export const adapters = [
  createCodexAdapter({
    command: process.execPath,
    appServerArgs: [
      fileURLToPath(new URL("./fake-codex-diagnostics.mjs", import.meta.url)),
    ],
  }),
];
