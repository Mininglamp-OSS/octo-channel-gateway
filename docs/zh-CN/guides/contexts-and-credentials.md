# 业务材料与凭据

[English](../../en/guides/contexts-and-credentials.md) | [文档目录](../README.md)

`loadMaterials(config, {signal})` 每轮读取当前业务材料，可以同步返回数组或返回 Promise。回调引用在注册时固定，config 是独立 Bot 配置快照；数据源、授权和一致性归宿主。示例把 token 与业务 brief 分开读取：

```ts
import type {
  GatewayBot,
  ImAgentConfig,
} from "@mininglamp-oss/octo-channel-gateway";

export function createDefinition(options: {
  botId: string;
  apiUrl: string;
  workdir: string;
  readToken: (signal: AbortSignal) => Promise<string>;
  readBrief: (signal: AbortSignal) => Promise<string>;
}): { bot: GatewayBot; agent: ImAgentConfig } {
  return {
    bot: {
      botId: options.botId,
      apiUrl: options.apiUrl,
      approval_mode: "ask",
      credentials: (_bot, signal) => options.readToken(signal),
      materialLoading: { timeout_ms: 5000, max_in_flight: 8 },
      async loadMaterials(_bot, { signal }) {
        const text = await options.readBrief(signal);
        signal.throwIfAborted();
        return [{ name: "brief", parts: [{ type: "text", text }] }];
      },
    },
    agent: { adapter_type: "codex", workdir: options.workdir },
  };
}
```

同步函数不会因为返回 Promise 就自动变成非阻塞 IO。将 signal 传给底层读取，并在迟到结果返回时检查取消。默认等待 5000 ms、最多 8 个未结束回调；timeout_ms 范围 1..30000，max_in_flight 范围 1..32。超时只停止等待，实际操作完成前仍占容量；满额立即失败，不建立无限队列。

静态 `bot.materials` 和动态 `loadMaterials` 都使用 `BusinessMaterial[]`，每项只有 `name` 与 `parts`。名称为 1–128 个 ASCII 字母、数字、下划线、点或连字符，首字符必须为字母或数字。各来源分别校验，同来源重名报错；动态同名材料整体替换静态项并保留其位置，新名称依返回顺序追加；动态空数组保留静态材料。结果在使用前复制。

`parts` 直接使用普通文本（`{ type: "text", text }`）或完整图片 part（`type: "image"`、`mimeType`、base64 `data`、`byteSize`、`sha256`、可选 `id`）。图片按字节与摘要校验，在 fresh fallback 和重试中保持为图片 part。单来源及合并后最多 32 个名称、序列化 JSON 8 MiB；组合后的完整输入还须满足协议 parts/图片限制。静态材料同时受每 Bot 配置 256 KiB 预算限制。名称只产生普通注释边界，不授予 system/developer 权限。材料不能覆盖渠道自身的规则/历史，也不进入执行配置。

旧 `bot.context`、`loadContexts`、`contextLoading` 与 `ContextItem` 业务材料合同已移除，不提供兼容转换。SDK 使用 `materialLoading`，CLI JSON 使用 `material_loading`。普通文本迁移到 `{ name, parts }`；MCP/环境配置放到 `agent.mcp`/`agent.envs`；高级执行扩展放到 `agent.items`。业务材料没有 namespace/data_format/payload 信封。渠道自动生成的规则/历史仍沿用原注入策略和内部渲染。

agent.instruction 是可选字符串，新 Provider 会话首轮作为独立文本 part 放在材料及本轮文字/图片之前。正常续聊和渠道周期刷新不重复；reset 后重新注入，fresh fallback 使用本轮冻结 instruction。空白值省略，非字符串或超出配置/请求预算明确失败。配置变更在下一次新会话生效，同轮重试保持快照。

credentials(config, signal) 返回宿主管理的当前 token；SDK 不扫描账号目录，也不建立刷新服务。没有回调时读取 SDK bot.bfToken（CLI 配置仍为 bf_token）。不要把 token 放入 loadMaterials、模型输入或诊断对象。Gateway 在执行前将工具凭据并入 agentEnv/envs；它仍是敏感执行配置，不是凭据保险库。Windows 按不区分大小写的环境变量名覆盖可信值，POSIX 按大小写区分。

本仓只提供工具身份与材料，不负责安装独立 octo-cli 或业务 MCP。工具安装、可执行路径与 Provider 能力由宿主提供。源合同：[回调与合并](../../../packages/gateway/src/support/material-loader.ts)、[凭据端口](../../../packages/gateway/src/ports.ts)。

可选 MCP/环境变量 payload、完整可用示例、覆盖规则，以及`agent.mcp`/`agent.envs` 到执行项的映射，见[配置参考](../reference/configuration.md)。CLI 默认示例保持精简。
