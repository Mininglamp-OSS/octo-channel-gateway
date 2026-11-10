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
