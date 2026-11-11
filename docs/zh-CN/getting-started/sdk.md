# SDK 接入

[English](../../en/getting-started/sdk.md) | [文档目录](../README.md)

SDK 的入口是 `new ChannelGateway({ kernel })`，通过 `await gateway.register(bot, agent)` 添加或覆盖绑定。kernel 是宿主创建的公开 KernelClient：连接既有服务使用 attachKernel({ endpoint })；自建服务使用完整 Runtime 的 createKernelService，初始化后传入 service.client。Kernel 与 Adapter/Provider 的安装、启动和退出归宿主。

Gateway 借用 KernelClient，多次 register 返回 Promise<void>，无需独立句柄或额外 start。嵌入 CLI/Electron 必须等待统一 close 完成；见[嵌入与关闭合同](../guides/lifecycle-and-delivery.md)。

## 先准备 Runtime

CLI 和 SDK 模式都依赖完整 Runtime 提供执行服务：最低 1.1.14，支持 1.x 系列（IPC v2）。安装当前发行版使用 `@latest`。若使用 Runtime CLI，先执行：

```sh
npm install -g @mininglamp-oss/octo-runtime@latest
octo-runtime start
octo-runtime doctor --json
```

自定义 Runtime --home 时，启动与诊断保持一致。Gateway 的 start/run 在启动前检查 Runtime，失败时给出上述指引。SDK 也会查询 Kernel 状态；SDK 宿主可自行使用完整 Runtime 公开 API 创建并维护服务。

安装包见[依赖与发行](../guides/dependencies.md)。Runtime/client 1.1.14 已在 npm 发布；验证尚未发布的 Gateway checkout 时，先构建并安装其本地归档。

```sh
npm install @mininglamp-oss/octo-channel-gateway
```

[共享示例](../../examples/registration.mts)把注册与清理配对：

```ts
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
```

调用时提供宿主持有的 KernelClient、多组 [GatewayBot 与 ImAgentConfig](../reference/sdk.md)，以及代表应用服务期间工作的 serve 函数。所有注册均在 try 内；任何注册或 serve 失败都会等待整个 Gateway 清理。若工作和清理都失败，此简单 finally 示例抛出清理错误，生产宿主可聚合两者。close 不关闭 client，宿主可继续复用或在退出时自行释放。

执行设置是 register 的第二个参数 agent；botId 和 apiUrl 必填，botName 可选。凭据来自 bot.credentials 或 bfToken，认证结果必须匹配 botId。本次 XML 感知信息由渠道处理消息时提供，不是注册配置；见[渠道事件信息与凭据](../guides/contexts-and-credentials.md)。CLI JSON 的 bot_id、api_url、嵌套 agent 保持不变。

不要创建注册后立即关闭：注册的生命周期应覆盖消息接收和投递。SDK 导入不会连接网络或读取 CLI 配置，不安装进程 signal/exit 监听器。`options.signal` 撤销整个注册；需要确认清理结果时仍要 await close。见[生命周期与投递](../guides/lifecycle-and-delivery.md)。


宿主需要加工输入或记录最终调用时，在 register 第三个参数传 hooks 数组；参见[应用层 Hooks](../reference/sdk.md)和[类型检查示例](../../examples/hooks.mts)。SDK 注册不会自动安装 CLI 的 instruction/debug 策略。

[Hooks 专题](../guides/hooks.md) 区分了 CLI 的 instruction/debug 行为与 Electron 等应用宿主自行实现的业务策略。

各 Adapter 文档中的 CLI instruction 示例不代表 SDK 默认行为。**SDK 业务即使填写 agent.instruction，也需要自行实现并注册消费它的 Hook；SDK 不会自动前置指令。**
