# 迁移与兼容范围

[English](../../en/guides/migration.md) | [文档目录](../README.md)

从 Runtime 内置渠道迁移时，先保留旧配置和会话持久化策略，部署支持 IPC v2 的 Runtime/client，再部署独立 Gateway。切换消息接入前停止旧渠道，避免两个实例同时处理同一 Bot；不要为此停止还被其他应用使用的 Kernel。

1. 用旧部署支持的方式导出渠道配置，妥善保存含凭据的文件。
2. 启动匹配版本的 Runtime，确定实际 Runtime Home。
3. 在独立 Gateway Home 导入配置、配置 runtime_home，再 start/doctor 验证。
4. 核对平台连接、授权、会话恢复与投递。默认内存 store 不会自动迁移旧会话。

```sh
octo-channel-gateway extraset --runtime-home /absolute/runtime < gateway.json
octo-channel-gateway start
octo-channel-gateway doctor --json
```

## 保留与破坏性变化

| 边界     | 当前行为                                                                                                |
| -------- | ------------------------------------------------------------------------------------------------------- |
| CLI 兼容 | 保留 extraset/extraget、开头的 channel-gateway 组件层级及旧 {config, enabled?} 外壳；忽略 module 元数据 |
| SDK/IPC  | 旧 invoke(request, environment)、contexts、cancelInvocation、IPC v1 不兼容，无转换层                    |
| 内部草稿 | Gateway 仍有混合 contexts 草稿，由 prepareKernelInput 分成 inputs/agentEnv；不作为 Runtime 公共入口     |
| 原目录   | 不自动删除或改写 Runtime Home、身份与配置                                                               |
| 功能归属 | Runtime 不再承载 Extra/native/WebUI/WeCom/内置 Gateway；本仓不补建通用插件框架                          |

extraset 是完整替换，不是 patch；extraget 原样输出凭据。不要把旧模块安装定义当成新 SDK 必填格式。SDK 直接使用 ChannelDefinition 对象和函数，见 [SDK 接入](../getting-started/sdk.md)。

CLI 连接配置现在使用 `runtime_home`（Runtime 目录）。旧 `endpoint`/`runtime_endpoint` 字段和 `--endpoint`/`--runtime-endpoint` 参数改为 `runtime_home` 与 `--runtime-home`。旧字段明确报错，避免连接到错误 Runtime。SDK 的 endpoint 参数保持原义。

Bot 执行配置使用 `agent.adapter_type`，model、effort、workdir 同属 `agent`。旧外层 `adapter` 字段和 `ImAdapterConfig` 类型替换为 `agent`、`ImAgentConfig`，不做兼容转换。
