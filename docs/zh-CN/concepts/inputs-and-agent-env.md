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

宿主通过 `bot.agent` 提供执行设置，通过可选 `bot.materials` / `loadMaterials` 提供业务材料。命名材料按规则合并后直接展开为文本/图片 parts；`prepareKernelInput` 将其与已选中的渠道规则/历史及当前消息组合。高级 `agent.items` 独立并入 AgentEnv，绝不作为模型材料渲染；工具凭据只注入执行项。重试及 fresh fallback 复用同一冻结材料和图片字节。

旧 `loadContexts` 回调与 `bot.context` 信封直接拒绝。渠道内部仍有规则/历史准备稿，但应用无需构造 ContextItem 或选择材料 namespace。渠道自动材料的注入和省略规则保持。Runtime 收到 `inputs.parts` 和独立的仅含 `schema/items` 的 `agentEnv`。

中断使用 `client.interrupt(invocationId, reason?)`；不在 invoke 传入 signal。注册 signal 和 loadMaterials 的 signal 是本地资源/IO 生命周期，不是这个公开执行参数。身份区别见[标识参考](identifiers.md)，原生取消由 Runtime Adapter 映射。
