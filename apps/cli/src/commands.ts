import {
  GatewayCommandError,
  savedConfigResult,
  type GatewayCommandExtension,
  type JsonObject,
} from "./command-types.js";
import {
  imBotIdentity,
  validateImBots,
} from "@mininglamp-oss/octo-channel-gateway-sdk";
import type { ImAgentConfig } from "@mininglamp-oss/octo-channel-gateway-sdk";

/** 离线业务校验复用运行时 Bot 合同；不认证、不构造 manager 或服务。 */
function validate(config: JsonObject): void {
  try {
    validateImBots(config.bots ?? []);
    const spaces = config.authorized_space_ids;
    if (
      spaces !== undefined &&
      (!Array.isArray(spaces) ||
        spaces.some((id) => typeof id !== "string" || !id.trim()))
    )
      throw new Error("IM_AUTHORIZED_SPACES_INVALID");
    if (Object.hasOwn(config, "material_loading")) throw new Error("IM_MATERIAL_API_REMOVED");
  } catch (error) {
    const hints: Record<string, string> = {
      IM_BOT_ID_REQUIRED: "Provide a non-empty --bot_id (JSON: bots[].bot_id).",
      IM_AGENT_REQUIRED:
        "Each Bot requires an agent object; configure maps --adapter_type/--workdir to it.",
      IM_AGENT_MCP_INVALID: "agent.mcp must contain a valid mcpServers object. See the optional execution configuration documentation.",
      IM_AGENT_ENVS_INVALID: "agent.envs must contain valid env_variables key/value entries. See the optional execution configuration documentation.",
      IM_WORKDIR_ABSOLUTE_REQUIRED:
        "Provide an absolute --workdir for a local adapter.",
      IM_OPENCLAW_WORKDIR_UNSUPPORTED:
        "OpenClaw uses its own workspace; remove config.bots[].agent.workdir using extraset.",
      IM_PROVIDER_AGENT_ID_UNSUPPORTED:
        "--provider_agent_id is supported only by OpenClaw.",
      IM_API_URL_INVALID:
        "Use a valid endpoint URL without credentials, query or fragment; insecure URLs are loopback-only.",
      IM_BOT_DUPLICATED:
        "Duplicate Bot identity in bots; keep one entry per endpoint and bot_id.",
      IM_CONFIG_LIST_REQUIRED:
        "bots must be an array within the Gateway Bot limit.",
      IM_AUTHORIZED_SPACES_INVALID:
        "authorized_space_ids must contain non-empty strings.",
      IM_MATERIAL_API_REMOVED:
        "Remove materials and material_loading; per-message context belongs to the channel input.",
    };
    const code =
      error instanceof Error && Object.hasOwn(hints, error.message)
        ? error.message
        : "EXTRA_CONFIG_INVALID";
    throw new GatewayCommandError(
      code,
      hints[code] ??
        "Invalid Bot configuration. Check configure --help and the Gateway configuration.",
    );
  }
}

/** 按规范化 API+bot_id upsert；省略字段只从同一身份保留。 */
const extension: GatewayCommandExtension = {
  apiVersion: 1,
  commands: [
    {
      name: "configure",
      description:
        "Add or update one Bot by API URL and bot_id; saves config only",
      options: [
        {
          name: "bot_id",
          type: "string",
          required: true,
          description: "Platform Bot ID",
        },
        {
          name: "api_url",
          type: "string",
          required: true,
          description: "Octo API base URL",
        },
        {
          name: "adapter_type",
          type: "string",
          description: "Agent type (agent.adapter_type)",
        },
        {
          name: "workdir",
          type: "string",
          description: "Absolute local execution directory",
        },
        { name: "bot_name", type: "string", description: "Display name; empty uses Bot ID" },
        { name: "model", type: "string", description: "Provider model ID" },
        {
          name: "effort",
          type: "string",
          description: "Reasoning effort: low, medium, high, xhigh",
        },
        {
          name: "provider_agent_id",
          type: "string",
          description: "Existing OpenClaw Agent ID",
        },
        {
          name: "bf_token",
          type: "string",
          description:
            "Raw credential (bots[].bf_token); omitted values are preserved",
        },
      ],
      examples: [
        "octo-channel-gateway configure --bot_id my-codex-bot --bot_name 'My Codex Bot' --api_url https://im.deepminer.com.cn/api --adapter_type codex --workdir /absolute/project --model gpt-6.1-sol --effort high --bf_token REPLACE_WITH_BOT_TOKEN",
      ],
      async run(context, input) {
        const snapshot = await context.readConfig();
        validate(snapshot.config);
        const bots = snapshot.config.bots ?? [];
        validateImBots(bots);
        const identityFields = {
          bot_id: input.options["bot_id"],
          api_url: input.options["api_url"],
        };
        if (
          typeof identityFields.bot_id !== "string" ||
          typeof identityFields.api_url !== "string"
        )
          throw new GatewayCommandError(
            "EXTRA_CONFIG_INVALID",
            "--bot_id and --api_url are required.",
          );
        const identity = imBotIdentity({
          bot_id: identityFields.bot_id,
          api_url: identityFields.api_url,
        });
        const position = bots.findIndex(
          (bot) => imBotIdentity(bot) === identity,
        );
        const old = position < 0 ? undefined : bots[position];
        // 新端点是独立身份，不从同名 Bot 继承凭据或执行配置。
        if (
          !old &&
          bots.some((bot) => bot.bot_id === identityFields.bot_id) &&
          typeof input.options.bf_token !== "string"
        )
          throw new GatewayCommandError(
            "EXTRA_CONFIG_INVALID",
            "--bf_token is required for a new API endpoint of an existing Bot ID.",
          );
        const agent: ImAgentConfig = { ...old?.agent };
        if (typeof input.options.adapter_type === "string") agent.adapter_type = input.options.adapter_type;
        for (const field of [
          "workdir",
          "model",
          "effort",
          "provider_agent_id",
        ] as const) {
          const value = input.options[field];
          if (typeof value === "string") agent[field] = value;
        }
        if (
          agent.effort !== undefined &&
          (typeof agent.effort !== "string" ||
            !["low", "medium", "high", "xhigh"].includes(agent.effort))
        )
          throw new GatewayCommandError(
            "EXTRA_CONFIG_INVALID",
            "--effort must be low, medium, high or xhigh.",
          );
        const bot = {
          ...old,
          ...identityFields,
          agent,
        } as unknown as JsonObject;
        if (typeof input.options.bot_name === "string") bot.bot_name = input.options.bot_name;
        const credential = input.options.bf_token;
        if (typeof credential === "string") {
          if (!credential.trim())
            throw new GatewayCommandError(
              "EXTRA_CONFIG_INVALID",
              "--bf_token must not be blank.",
            );
          // 与 extraset 的业务字段同名；保存传入原文，省略时保留已有凭据。
          bot.bf_token = credential;
        }
        const nextBots = [...bots] as unknown as JsonObject[];
        if (position < 0) nextBots.push(bot);
        else nextBots[position] = bot;
        const config: JsonObject = { ...snapshot.config, bots: nextBots };
        validate(config);
        return savedConfigResult(
          await context.saveConfig(config, snapshot.revision),
        );
      },
    },
  ],
};
export default extension;
