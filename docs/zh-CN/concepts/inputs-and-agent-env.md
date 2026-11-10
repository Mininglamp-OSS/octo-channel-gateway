# 输入与执行环境

[English](../../en/concepts/inputs-and-agent-env.md) | [文档目录](../README.md)

公开执行入口为 `KernelClient.invoke(inputs, sessionId, providerSession, agentEnv)`。普通 inputs 是文本/图片 parts；高级内容对象可带 parts、protocol_mode、身份/代次及显式恢复材料。它不包含 contexts、agentEnv 或 signal。该接口通常由 Gateway 内部使用，宿主注册 Bot 不必自己调用。

| 数据                                                              | 所属位置        | 如何使用                                         |
| ----------------------------------------------------------------- | --------------- | ------------------------------------------------ |
| 本轮文字、图片、历史、业务规则、资料和首轮 instruction | inputs | Gateway 准备实际模型材料 |
| cwd/workdir、Adapter、model/effort、环境变量、MCP、审批和私有执行参数 | agentEnv | Adapter 解释消费的配置，Kernel/Core 不生成旧配置投影 |
| 逻辑会话标识                                                      | sessionId       | 业务关联与代次管理                               |
| Provider 原生续聊信息                                             | providerSession | Adapter 判断和执行续聊                           |

agentEnv 仅含 `schema: octo.context-envelope/v3` 与 items 的 namespace/name/payload 格式。source 使用 octo.execution/agent，审批使用 octo.security/approval_policy，workspace 只有 path；私有 bean 由宿主与 Adapter 约定，无需公共 schema 登记。业务仍填写 bot.agent，由 Gateway 编译；client 为每次调用复制快照，已经开始的一轮不随原对象修改。

## 当前 Gateway 编译过程

Bot 配置与 loadContexts 结果先进入本仓业务草稿。prepareKernelInput 将业务项渲染为模型文本/图片，将执行项抽出为 agentEnv，并为恢复内容保留同一冻结材料。环境与工具 token 不进入模型正文，展示投影剔除整个 agentEnv。

因此当前内部仍有混合 `contexts` 草稿，不应宣称已删除所有 Context。`extra.im` 是本渠道拥有的材料约定，`extra.business` 等由应用提供；namespace 格式是此 Gateway 加载/渲染机制的约定，Runtime 执行没有强制模型正文遵循它。

中断使用 `client.interrupt(invocationId, reason?)`；不在 invoke 传入 signal。注册 signal 和 loadContexts 的 signal 是本地资源/IO 生命周期，不是这个公开执行参数。身份区别见[标识参考](identifiers.md)，原生取消由 Runtime Adapter 映射。
