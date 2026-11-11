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

extraset 是完整替换，不是 patch；extraget 原样输出凭据。不要把旧模块安装定义当成新 SDK 必填格式。SDK 直接使用 GatewayBot 对象和函数，见 [SDK 接入](../getting-started/sdk.md)。

Runtime 连接只使用命令参数 `start/run --runtime-home <path>`，默认 `~/.octo-runtime`。不要在业务配置中放入 `runtime_home`、`endpoint` 或 `runtime_endpoint`；重启所需启动参数由原生服务定义保存。SDK 的 endpoint 参数保持原义。

Bot 执行配置使用 `agent.adapter_type`，model、effort、workdir 同属 `agent`。旧外层 `adapter` 字段和 `ImAdapterConfig` 类型替换为 `agent`、`ImAgentConfig`，不做兼容转换。

## Runtime/client 1.1.14

生产 client 和开发 Runtime 依赖均为 ^1.1.14。保留 Gateway 自己的 ImAgentConfig（CLI bot.agent，SDK register 第二个参数）；上游删除的 AgentConfig 不再生成。旧 octo.control/instructions 配置须改为 agent.instruction 或普通业务材料；workspace.mode 须移除，仅保留已准备目录的 path。Context 格式改为注释边界和逐项 context 标签，选取规则保持。私有执行 item 原样到 Adapter，OpenClaw agentId 位于 adapter.openclaw/options。没有旧协议兼容层，详见[输入与执行环境](../concepts/inputs-and-agent-env.md)和[配置参考](../reference/configuration.md)。

## 注册协议简化

botId 必须显式填写，认证仅校验一致性。删除 bot.materials、loadMaterials、BusinessMaterial、materialLoading 和 CLI material_loading；不提供兼容层或替代加载回调。事件信息复用 channel 消息构建通道作为独立 XML 文本输入；CLI 首轮指令由 agent.instruction Hook 处理，SDK 宿主显式提供自己的 Hooks。参见[渠道事件信息](contexts-and-credentials.md)。

SDK 现在使用 new ChannelGateway({ kernel }) 和 register(bot, agent)。移除 ChannelRegistry/ChannelDefinition/ChannelRegistration 用法；宿主负责 Runtime 接入和最终 client 释放，Gateway 统一 close 清理全部 Bot 资源。CLI JSON 不变。


Hooks 迁移：register 第三个参数传可选数组，仅支持 pre_dispatch / pre_invoke。移除 stable_context_refresh_interval_turns（报 IM_REFRESH_POLICY_REMOVED），周期业务内容由 Hook 根据 ctx.turn.index 决定。debug 开关改为 OCTO_CHANNEL_GATEWAY_DEBUG=1，不兼容旧拼写。CLI 继续接受 agent.instruction；SDK 宿主通过 Hook 显式前置。
