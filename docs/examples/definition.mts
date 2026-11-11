import type {
  GatewayBot,
  ImAgentConfig,
} from "@mininglamp-oss/octo-channel-gateway";

export function createDefinition(options: {
  botId: string;
  apiUrl: string;
  workdir: string;
  readToken: (signal: AbortSignal) => Promise<string>;
}): { bot: GatewayBot; agent: ImAgentConfig } {
  return {
    bot: {
      botId: options.botId,
      apiUrl: options.apiUrl,
      approval_mode: "ask",
      credentials: (_bot, signal) => {
        signal.throwIfAborted();
        return options.readToken(signal);
      },
    },
    agent: { adapter_type: "codex", workdir: options.workdir },
  };
}
