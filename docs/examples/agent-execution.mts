import type { ImAgentConfig } from "@mininglamp-oss/octo-channel-gateway";

// 可选公开 SDK 字段；文档检查使用实际发布入口校验类型。
export const agent: ImAgentConfig = {
  adapter_type: "codex",
  workdir: "/absolute/project",
  model: "gpt-6.1-sol",
  effort: "high",
  instruction: "Answer the current request with a concise conclusion first.",
  mcp: {
    mcpServers: {
      "project-tools": {
        type: "stdio",
        command: "/absolute/tools/project-mcp",
        args: [],
      },
    },
  },
  envs: { env_variables: [{ key: "PROJECT_ENV", value: "development" }] },
};
