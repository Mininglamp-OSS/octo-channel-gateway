# SDK 接入

[English](../../en/getting-started/sdk.md) | [文档目录](../README.md)

SDK 的入口是 `ChannelRegistry.register(endpoint, definition)`。endpoint 必须指向已启动且 execution_ready 的本机 Kernel：POSIX 使用 socket，Windows 使用 named pipe。Kernel 与所需 Adapter/Provider 的安装和启动归宿主，Gateway 不替你启动服务。

## 先准备 Runtime

CLI 和 SDK 模式都依赖完整 Runtime 提供执行服务。若使用 Runtime CLI，先执行：

```sh
npm install -g @mininglamp-oss/octo-runtime@^1.1.12
octo-runtime executor-kernel start
octo-runtime doctor --json
```

2.0 候选未发布时使用匹配 tgz；自定义 --home 时启动与诊断保持一致。Gateway 的 start/restart/run 在启动前检查 Runtime，失败时给出上述指引。SDK 也会查询 Kernel 状态；SDK 宿主可自行使用完整 Runtime 公开 API 创建并维护服务。

安装包见[依赖与发行](../guides/dependencies.md)。当前 client 1.1.12 是未发布候选，不能把下面的目标版本安装命令理解为已上线。

```sh
npm install @mininglamp-oss/octo-channel-gateway
```

[共享示例](../../examples/registration.mts)把注册与清理配对：

```ts
import {
  ChannelRegistry,
  type ChannelDefinition,
  type ChannelRegistration,
} from "@mininglamp-oss/octo-channel-gateway";

export async function withChannel<T>(
  endpoint: string,
  definition: ChannelDefinition,
  serve: (registration: ChannelRegistration) => Promise<T>,
): Promise<T> {
  const registration = await ChannelRegistry.register(endpoint, definition);
  try {
    return await serve(registration);
  } finally {
    await registration.close();
  }
}
```

调用时提供真实 endpoint、[ChannelDefinition](../reference/sdk.md)，以及代表应用服务期间工作的 `serve` 函数。`serve` 完成或抛错后都会等待 close；若工作和清理都失败，此简单 finally 示例将抛出清理错误，生产宿主可自行聚合两者。注册失败时 SDK 自行回滚已取得的资源。

一个 definition 配置一个 Bot。凭据从宿主提供的 `credentials` 回调或 bot.bf_token 获取；每轮业务材料由 `loadContexts` 返回。可直接复用[定义示例](../../examples/definition.mts)，其凭据和材料读取由应用实现。

不要创建注册后立即关闭：注册的生命周期应覆盖消息接收和投递。SDK 导入不会连接网络或读取 CLI 配置，不安装进程 signal/exit 监听器。`definition.signal` 撤销整个注册；需要确认清理结果时仍要 await close。见[生命周期与投递](../guides/lifecycle-and-delivery.md)。
