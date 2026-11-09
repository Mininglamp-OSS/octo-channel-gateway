# 业务材料与凭据

[English](../../en/guides/contexts-and-credentials.md) | [文档目录](../README.md)

`loadContexts(config, {signal})` 每轮读取当前业务材料，可以同步返回数组或返回 Promise。回调引用在注册时固定，config 是独立 Bot 配置快照；数据源、授权和一致性归宿主。示例把 token 与业务 brief 分开读取：

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

同步函数不会因为返回 Promise 就自动变成非阻塞 IO。将 signal 传给底层读取，并在迟到结果返回时检查取消。默认等待 5000 ms、最多 8 个未结束回调；timeout_ms 范围 1..30000，max_in_flight 范围 1..32。超时只停止等待，实际操作完成前仍占容量；满额立即失败，不建立无限队列。

静态 bot.context 与动态结果先各自校验，动态同 namespace/name 整项替换并保留静态位置，新项依返回顺序追加。instructions.entries 也整体替换；空动态数组不删除静态项。宿主提供的 extra.im 项被忽略并记录数量，该命名空间由渠道生成。普通业务项不能自动提升为系统指令；受信人格可显式放入 octo.control/instructions，并纳入执行环境。

credentials(config, signal) 返回宿主管理的当前 token；SDK 不扫描账号目录，也不建立刷新服务。没有回调时读取 bot.bf_token。不要把 token 放入 loadContexts、模型输入或诊断对象。Gateway 在执行前将工具凭据并入 agentEnv/envs；它仍是敏感执行配置，不是凭据保险库。Windows 按不区分大小写的环境变量名覆盖可信值，POSIX 按大小写区分。

本仓只提供工具身份与材料，不负责安装独立 octo-cli 或业务 MCP。工具安装、可执行路径与 Provider 能力由宿主提供。源合同：[回调与合并](../../../packages/gateway/src/support/context-loader.ts)、[凭据端口](../../../packages/gateway/src/ports.ts)。

可选 MCP/环境变量 payload、完整可用示例、覆盖规则，以及`agent.mcp`/`agent.envs` 到执行项的映射，见[配置参考](../reference/configuration.md)。CLI 默认示例保持精简。上文 instructions 行为描述的是当前实现，其移除由 [Runtime #334](https://github.com/Mininglamp-OSS/octo-runtime/issues/334) 跟踪，目标是由 Gateway 将业务提示词拼入 inputs。
