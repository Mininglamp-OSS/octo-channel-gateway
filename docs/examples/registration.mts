import {
  ChannelGateway,
  type GatewayBot,
  type GatewayHook,
  type ImAgentConfig,
} from "@mininglamp-oss/octo-channel-gateway";
import type { KernelClient } from "@mininglamp-oss/octo-runtime-client";

export async function withChannel<T>(
  kernel: KernelClient,
  bindings: readonly { bot: GatewayBot; agent: ImAgentConfig; hooks?: readonly GatewayHook[] }[],
  serve: (gateway: ChannelGateway) => Promise<T>,
): Promise<T> {
  const gateway = new ChannelGateway({ kernel });
  try {
    for (const { bot, agent, hooks } of bindings) await gateway.register(bot, agent, hooks);
    return await serve(gateway);
  } finally {
    await gateway.close();
  }
}
