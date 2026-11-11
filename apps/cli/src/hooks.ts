import type { GatewayHook, ImAgentConfig } from "@mininglamp-oss/octo-channel-gateway-sdk";
import type { RuntimeLog } from "@mininglamp-oss/octo-channel-gateway-sdk/host/types";
import { runDiagnostic } from "@mininglamp-oss/octo-channel-gateway-sdk/host/diagnostics";

/** CLI 的业务默认策略；SDK 不读取进程环境，也不自行注入 instruction。 */
export function createCliHooks(agent: ImAgentConfig, log: RuntimeLog): readonly GatewayHook[] {
  const instruction = agent.instruction;
  return [
    {
      type: "pre_dispatch",
      hook: async (ctx, inputs, agentEnv) => {
        if (ctx.turn.index !== 1 || !instruction?.trim()) return { inputs, agentEnv };
        const text = [
          "<!-- CLI instruction begins -->",
          '<context namespace="extra.cli" name="instruction">',
          `  <data><![CDATA[${instruction.replaceAll("]]>", "]]]]><![CDATA[>")}]]></data>`,
          "</context>",
          "<!-- CLI instruction ends -->",
        ].join("\n");
        const part = { type: "text" as const, text };
        return {
          inputs: {
            ...inputs,
            parts: [part, ...inputs.parts],
            ...(inputs.modelInput !== undefined ? { modelInput: text + "\n\n" + inputs.modelInput } : {}),
            ...(inputs.freshFallbackModelInput !== undefined ? { freshFallbackModelInput: text + "\n\n" + inputs.freshFallbackModelInput } : {}),
            ...(inputs.freshFallbackModelInputParts ? { freshFallbackModelInputParts: [part, ...inputs.freshFallbackModelInputParts] } : {}),
          },
          agentEnv,
        };
      },
    },
    {
      type: "pre_invoke",
      hook: async (ctx, inputs, agentEnv) => {
        if (process.env.OCTO_CHANNEL_GATEWAY_DEBUG === "1")
          runDiagnostic(() => log("debug", "agent_run.client_input", structuredClone({
            inputs, sessionId: ctx.sessionId, providerSession: ctx.providerSession, agentEnv,
          })));
        return { inputs, agentEnv };
      },
    },
  ];
}
