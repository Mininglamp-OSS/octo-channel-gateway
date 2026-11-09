# 迁移与兼容范围

[English](../../en/guides/migration.md) | [文档目录](../README.md)

从 Runtime 内置渠道迁移时，先保留旧配置和会话持久化策略，部署支持 IPC v2 的 Runtime/client，再部署独立 Gateway。切换消息接入前停止旧渠道，避免两个实例同时处理同一 Bot；不要为此停止还被其他应用使用的 Kernel。

1. 用旧部署支持的方式导出渠道配置，妥善保存含凭据的文件。
2. 启动匹配版本的 Runtime，确定实际 Runtime Home。
3. 将导出数据整理为 bots 位于顶层的直接 Gateway 配置对象，在独立 Gateway Home 导入，再通过 start --runtime-home /absolute/runtime 和 doctor 验证。
4. 核对平台连接、授权、会话恢复与投递。默认内存 store 不会自动迁移旧会话。

```sh
octo-channel-gateway extraset --help
octo-channel-gateway start
octo-channel-gateway doctor --json
```

## 保留与破坏性变化

| 边界     | 当前行为                                                                                                |
| -------- | ------------------------------------------------------------------------------------------------------- |
| CLI 兼容 | 仅支持独立命令，不支持组件前缀/参数或 config 外壳，拒绝 module 字段 |
| SDK/IPC  | 旧 invoke(request, environment)、contexts、cancelInvocation、IPC v1 不兼容，无转换层                    |
| 内部草稿 | Gateway 仍有混合 contexts 草稿，由 prepareKernelInput 分成 inputs/agentEnv；不作为 Runtime 公共入口     |
| 原目录   | 不自动删除或改写 Runtime Home、身份与配置                                                               |
| 功能归属 | Runtime 不再承载 Extra/native/WebUI/WeCom/内置 Gateway；本仓不补建通用插件框架                          |

extraset 是完整替换，不是 patch；extraget 原样输出凭据。不要把旧模块安装定义当成新 SDK 必填格式。SDK 直接使用 ChannelDefinition 对象和函数，见 [SDK 接入](../getting-started/sdk.md)。

Runtime 连接只使用命令参数 `start/run --runtime-home <path>`，默认 `~/.octo-runtime`。不要在业务配置中放入 `runtime_home`、`endpoint` 或 `runtime_endpoint`；重启所需启动参数由原生服务定义保存。SDK 的 endpoint 参数保持原义。

Bot 执行配置使用 `agent.adapter_type`，model、effort、workdir 同属 `agent`。旧外层 `adapter` 字段和 `ImAdapterConfig` 类型替换为 `agent`、`ImAgentConfig`，不做兼容转换。
