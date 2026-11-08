# 身份与会话标识

[English](../../en/concepts/identifiers.md) | [文档目录](../README.md)

不要把“会话”和“执行”当成同一个 ID。一个业务会话可有多轮执行，同一消息重试也可能有多个执行尝试。

| 标识                              | 谁提供 / 生成                                                | 谁保存                         | 用途与生命周期                                                |
| --------------------------------- | ------------------------------------------------------------ | ------------------------------ | ------------------------------------------------------------- |
| bot_id                            | 平台/宿主配置                                                | Gateway 定义或 CLI 配置        | Bot 身份；与 API 地址共同定位，名称不是授权凭据               |
| conversationId / messageId        | 平台入站消息                                                 | 传输层及有界处理记录           | 聊天位置与消息去重，不用于取消执行                            |
| sessionId                         | Gateway 为逻辑会话分配；直接 client 可由调用者提供或自动生成 | 会话 binding                   | 多轮关联；reset 后下一普通输入建立新会话                      |
| generation                        | Gateway reset/new 控制                                       | 会话 binding                   | 区分旧/新逻辑会话，阻止迟到结果污染                           |
| invocationId                      | Gateway 每执行尝试生成；直接 client 可提供或自动生成         | 活动任务与所属 client registry | 单次调用身份；interrupt 的目标                                |
| runId                             | Gateway/调用者或 client                                      | 执行记录、日志关联             | Runtime 执行追踪，不等于 Provider 会话                        |
| providerSession                   | Adapter 从 Provider 结果构造并返回                           | Gateway 会话 binding           | Provider 原生续聊信息，不能从业务 sessionId 猜造              |
| sessionGeneration / providerEpoch | Gateway 编排方，当前均取会话 generation                      | 调用草稿、协议元数据与执行记录 | 逻辑会话代次 / Provider 绑定代次，用于关联和隔离；不是取消 ID |
| kernel_instance_id                | Kernel 每次启动生成                                          | client 的执行引用              | 防止重启后引用串用                                            |
| stream_id / seq                   | Kernel 事件流                                                | client 观察游标                | 断流续读与去重，不表示重新提交业务                            |

例如，同一会话 S 的两轮 A/B 具有不同 invocationId。中断 A 不能通过 sessionId=S 来实现，否则目标不明确；Gateway 把 A 的 invocationId 交给其所属 client。Provider 原生 turn ID 留在 Adapter 内部，不要求应用绑定每个 Provider 的取消协议。

client 句柄在首次消费前即可读取 invocationId/runId/sessionId。中断受理不等于 Provider 已退出，仍消费原执行到终态并检查清理。会话存储职责见[会话管理](../guides/sessions.md)。
