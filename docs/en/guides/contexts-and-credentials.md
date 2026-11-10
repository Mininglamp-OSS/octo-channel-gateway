# Business material and credentials

[简体中文](../../zh-CN/guides/contexts-and-credentials.md) | [Documentation](../README.md)

`loadContexts(config, {signal})` reads current business material each turn and may return an array or a Promise. The callback reference is fixed at registration; config is an independent Bot snapshot. The host owns data sources, authorization, and consistency. This example reads the token and business brief separately:

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
    contextLoading: { timeout_ms: 5000, max_in_flight: 8 },
    async loadContexts(_bot, { signal }) {
      const text = await options.readBrief(signal);
      signal.throwIfAborted();
      return [
        {
          namespace: "extra.business",
          name: "brief",
          payload: { text },
        },
      ];
    },
  };
}
```

Returning a Promise does not make synchronous work nonblocking. Pass signal to underlying reads and check cancellation before accepting late results. Defaults are a 5000 ms wait and at most 8 unfinished callbacks. timeout_ms accepts 1..30000 and max_in_flight accepts 1..32. Timeout ends the wait, but the operation retains its slot until it settles. Capacity exhaustion fails immediately rather than creating an unbounded queue.

Static bot.context and dynamic results are validated separately. A dynamic item replaces the entire matching namespace/name item in its original position; new items append in returned order. An empty dynamic array does not delete static material. Host-provided extra.im items are ignored with a count-only log because the channel owns that namespace. Version 1.1.13 removes octo.control/instructions; old configurations fail directly without compatibility conversion. Supply persona text through agent.instruction or ordinary extra.business material, with no system/developer privilege.

Model selection keeps its existing rules: extra.* material and octo.content/inline or octo.content/references. Other items remain opaque execution configuration in agentEnv.items and never enter model text. Output uses these boundaries and retains item order and the existing inner guidence spelling and data representation. With data_format: text, payload.text remains verbatim; other payloads use JSON with sorted keys. CDATA terminators split into adjacent sections:

```xml
<!-- Context information begins: the following is the current context -->
  <context namespace="extra.business" name="brief">
    <guidence>Current project</guidence>
    <data><![CDATA[{"text":"Project material"}]]></data>
  </context>
<!-- Context information ends -->
```

The optional agent.instruction string is a separate first text part before materials and the current text/image on a fresh Provider session. Ordinary continuation and periodic channel refresh do not repeat it. Reset reinjects it; fresh fallback carries the instruction frozen for that turn. Blank values are omitted; invalid types or configuration/request budget overflow fail explicitly. Changes apply to the next fresh session, while retries keep their snapshot.

credentials(config, signal) returns a host-managed current token. The SDK neither scans account directories nor owns a refresh service. Without the callback, it reads bot.bf_token. Keep tokens out of loadContexts, model inputs, and diagnostic objects. Before invocation, Gateway merges tool credentials into agentEnv/envs; this remains sensitive execution configuration, not a credential vault. Trusted values override environment aliases case-insensitively on Windows and case-sensitively on POSIX.

Gateway supplies tool identity and material; it does not install the separate octo-cli or business MCP servers. The host supplies tools, executable paths, and supported Provider capabilities. Source contracts: [callback and merge](../../../packages/gateway/src/support/context-loader.ts), [credential port](../../../packages/gateway/src/ports.ts).

For optional MCP/environment payloads, a complete working configuration example, override rules, and the mapping from `agent.mcp`/`agent.envs` to execution items, see [Configuration reference](../reference/configuration.md). The default CLI example remains minimal.
