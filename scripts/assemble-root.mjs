import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
await rm(new URL("dist/", root), { recursive: true, force: true });
await mkdir(new URL("dist/apps/cli/src/", root), { recursive: true });
await copyFile(new URL("apps/cli/dist/build-info.json", root), new URL("dist/apps/cli/src/build-info.json", root));
const facade = 'export * from "@mininglamp-oss/octo-channel-gateway-sdk";\n';
await writeFile(new URL("dist/index.js", root), facade);
await writeFile(new URL("dist/index.d.ts", root), facade);
await writeFile(
  new URL("dist/apps/cli/src/index.js", root),
  '#!/usr/bin/env node\nimport "@mininglamp-oss/octo-channel-gateway-cli/entrypoint";\n',
);
