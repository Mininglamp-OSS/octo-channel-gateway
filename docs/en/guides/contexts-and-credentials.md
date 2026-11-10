# Business material and credentials

[简体中文](../../zh-CN/guides/contexts-and-credentials.md) | [Documentation](../README.md)

`loadMaterials(config, {signal})` reads current business material each turn and may return an array or a Promise. The callback reference is fixed at registration; config is an independent Bot snapshot. The host owns data sources, authorization, and consistency. This example reads the token and business brief separately:

```ts
import type { ChannelDefinition } from "@mininglamp-oss/octo-channel-gateway";

export function createDefinition(options: {
  botId: string;
  apiUrl: string;
  workdir: string;
  readToken: (signal: AbortSignal) => Promise<string>;
  readBrief: (signal: AbortSignal) => Promise<string>;
}): ChannelDefinition {
  return {
    bot: {
      bot_id: options.botId,
      api_url: options.apiUrl,
      agent: { adapter_type: "codex", workdir: options.workdir },
      approval_mode: "ask",
    },
    credentials: (_bot, signal) => options.readToken(signal),
    materialLoading: { timeout_ms: 5000, max_in_flight: 8 },
    async loadMaterials(_bot, { signal }) {
      const text = await options.readBrief(signal);
      signal.throwIfAborted();
      return [
        {
          name: "brief",
          parts: [{ type: "text", text }],
        },
      ];
    },
  };
}
```

Returning a Promise does not make synchronous work nonblocking. Pass signal to underlying reads and check cancellation before accepting late results. Defaults are a 5000 ms wait and at most 8 unfinished callbacks. timeout_ms accepts 1..30000 and max_in_flight accepts 1..32. Timeout ends the wait, but the operation retains its slot until it settles. Capacity exhaustion fails immediately rather than creating an unbounded queue.

Static `bot.materials` and dynamic `loadMaterials` results use `BusinessMaterial[]`: each item has only `name` and `parts`. Names are 1–128 ASCII letters/digits/underscore/dot/hyphen, starting with a letter or digit. Each source is validated separately; duplicate names in one source fail. A dynamic same-name material replaces the whole static material at its original position; new names append in return order. An empty dynamic result preserves static materials. The callback result is copied before use.

`parts` contains ordinary text (`{ type: "text", text }`) or complete image parts (`type: "image"`, `mimeType`, base64 `data`, `byteSize`, `sha256`, optional `id`). Images are validated against their bytes and digest and remain image parts through fresh fallback and retries. Per-source and merged material limits are 32 names and 8 MiB serialized JSON; protocol part/image limits also apply to the combined input. Static materials also share the Bot's 256 KiB configuration budget. Material names produce ordinary comment boundaries; they confer no system/developer privilege. Materials cannot overwrite channel-owned rules/history or enter execution configuration.

The old `bot.context`, `loadContexts`, `contextLoading` and `ContextItem` business-material contract are removed, with no compatibility translation. Use `materialLoading` for the SDK and `material_loading` for CLI JSON. Move ordinary text to `{ name, parts }`, MCP/environment settings to `agent.mcp`/`agent.envs`, and advanced execution extensions to `agent.items`. Business material has no namespace/data_format/payload envelope. Channel-generated rules/history retain their existing injection policy and internal rendering.

The optional agent.instruction string is a separate first text part before materials and the current text/image on a fresh Provider session. Ordinary continuation and periodic channel refresh do not repeat it. Reset reinjects it; fresh fallback carries the instruction frozen for that turn. Blank values are omitted; invalid types or configuration/request budget overflow fail explicitly. Changes apply to the next fresh session, while retries keep their snapshot.

credentials(config, signal) returns a host-managed current token. The SDK neither scans account directories nor owns a refresh service. Without the callback, it reads bot.bf_token. Keep tokens out of loadMaterials, model inputs, and diagnostic objects. Before invocation, Gateway merges tool credentials into agentEnv/envs; this remains sensitive execution configuration, not a credential vault. Trusted values override environment aliases case-insensitively on Windows and case-sensitively on POSIX.

Gateway supplies tool identity and material; it does not install the separate octo-cli or business MCP servers. The host supplies tools, executable paths, and supported Provider capabilities. Source contracts: [callback and merge](../../../packages/gateway/src/support/material-loader.ts), [credential port](../../../packages/gateway/src/ports.ts).

For optional MCP/environment payloads, a complete working configuration example, override rules, and the mapping from `agent.mcp`/`agent.envs` to execution items, see [Configuration reference](../reference/configuration.md). The default CLI example remains minimal.
