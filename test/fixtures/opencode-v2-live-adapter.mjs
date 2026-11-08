import { runtimeModule } from "../../test-support/runtime-module.mjs";
const { createOpenCodeAdapter } = await runtimeModule("adapter-opencode");

export default createOpenCodeAdapter({
  command: process.env.OCTO_OPENCODE_COMMAND ?? "opencode",
});
