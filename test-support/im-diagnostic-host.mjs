import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { runtimeModule } from "./runtime-module.mjs";
import { nativeHost } from "../test/native-host-fixture.js";

export async function createDiagnosticHost() {
  const { createCodexAdapter, createManagedCodexEngine } = await runtimeModule("adapter-codex");
  const codexHome = await mkdtemp(join(tmpdir(), "gateway-diagnostic-codex-"));
  const engine = createManagedCodexEngine({ codexHome, command: process.execPath,
    appServerArgs: [fileURLToPath(new URL("./fake-codex-diagnostics.mjs", import.meta.url))] });
  let hosted;
  const close = async () => {
    try { await hosted?.close(); }
    finally {
      engine.beginShutdown();
      await engine.close({ deadline: performance.now() + 4000 });
      await rm(codexHome, { recursive: true, force: true });
    }
  };
  try {
    hosted = await nativeHost([createCodexAdapter({ engine: engine.provider })]);
    return { ...hosted, close };
  } catch (error) {
    await close();
    throw error;
  }
}
