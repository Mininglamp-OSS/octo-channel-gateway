import type {
  GatewayHook,
  GatewayHookContext,
  GatewayInputs,
} from "@mininglamp-oss/octo-channel-gateway";

// Application-owned XML rendering; this is example code, not an SDK helper.
function prependInstruction(inputs: GatewayInputs, instruction: string): GatewayInputs {
  const text = '<context namespace="extra.business" name="instruction"><data><![CDATA['
    + instruction.replaceAll("]]>", "]]]]><![CDATA[>") + ']]></data></context>';
  const part = { type: "text" as const, text };
  return {
    ...inputs,
    parts: [part, ...inputs.parts],
    ...(inputs.modelInput !== undefined ? { modelInput: text + "\n\n" + inputs.modelInput } : {}),
    ...(inputs.freshFallbackModelInput !== undefined ? { freshFallbackModelInput: text + "\n\n" + inputs.freshFallbackModelInput } : {}),
    ...(inputs.freshFallbackModelInputParts ? { freshFallbackModelInputParts: [part, ...inputs.freshFallbackModelInputParts] } : {}),
  };
}

// The host supplies both its data loader and its scheduling policy.
export function createBusinessHooks(
  readInstruction: (ctx: GatewayHookContext) => Promise<string>,
  shouldPrepend: (ctx: GatewayHookContext) => boolean,
): readonly GatewayHook[] {
  return [{
    type: "pre_dispatch",
    hook: async (ctx, inputs, agentEnv) => {
      if (!shouldPrepend(ctx)) return { inputs, agentEnv };
      const instruction = await readInstruction(ctx);
      ctx.signal.throwIfAborted();
      if (!instruction.trim()) return { inputs, agentEnv };
      return { inputs: prependInstruction(inputs, instruction), agentEnv };
    },
  }];
}

// Put this last among pre_invoke Hooks to observe the final request.
export function createInputLogHook(
  write: (entry: Record<string, unknown>) => void | Promise<void>,
): GatewayHook {
  return {
    type: "pre_invoke",
    hook: async (ctx, inputs, agentEnv) => {
      try {
        // Isolate logging from mutable inputs and never wait for unbounded log IO.
        const pending = write(structuredClone({
          inputs, agentEnv, sessionId: ctx.sessionId, providerSession: ctx.providerSession,
        }));
        void Promise.resolve(pending).catch(() => undefined);
      } catch {
        // The application chooses that logging failure must not stop execution.
      }
      return { inputs, agentEnv };
    },
  };
}
