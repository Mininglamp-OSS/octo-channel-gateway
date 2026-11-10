# 生命周期与投递

[English](../../en/guides/lifecycle-and-delivery.md) | [文档目录](../README.md)

注册成功只表示本次装配与连接初始化完成。gateway.status 是 Manager 的当前 Bot 诊断快照，不是全部任务历史；只读接口不保证每个字段永远不变。

## 关闭

应用结束时 await gateway.close。关闭先停止接纳，然后在共享四秒截止内请求取消所属执行、消费尾流、完成投递与业务清理、关闭上下文回调池和所属会话句柄，最后释放自建渠道资源，保留注入 client。重复 close 返回同一个 Promise；失败会拒绝，不能当作已经完整退出。

构造参数 options.signal 的 abort 会触发整个 Gateway 关闭，但异步清理错误不会从 abort() 同步抛出，因此仍需 await close。SDK 不拥有共享 Kernel 或其他 Gateway 实例；CLI stop/uninstall 同样不能替代 Runtime 的停止命令。

## 嵌入与关闭合同

本节约束 ChannelGateway 实例接口。架构及 Runtime 注入方式见[架构与所有权](../concepts/architecture.md)。

- 保留 `await gateway.register(bot, agent)`：运行中新增或按稳定 Bot 身份覆盖，成功即初始化完成，无需额外 start。覆盖只清理该身份的旧绑定；可能短暂离线，不承诺自动回滚到旧配置。
- 宿主只需 `await gateway.close()` 清理整个 Gateway，不需要获取注册句柄或逐个关闭 Bot。关闭必须停止消息和执行接纳，取消排队注册，协调进行中的初始化/覆盖，并清理晚到资源。关闭后的实例不可再注册；重复 close 复用同一 Promise。
- 成功关闭必须清理 Bot socket、重连与心跳定时器、事件监听、所属执行及观察任务、投递任务、材料回调和自建会话存储句柄，不再有后台重连或投递。不能仅清空注册表或断开 client 就宣告成功。
- 单项失败仍继续清理其他资源，最后聚合失败和未完成项。超时不等于释放成功；宿主回调不配合取消时须明确报告未完成。宿主需保存错误并决定退出策略，不能把 close 拒绝解释成“已清理”。
- Gateway 只管理自己的 invocation，不调用借用 client 的全局 stopAdmission/drain/close，不关闭共享 Kernel 或宿主 Engine。宿主先等待 Gateway 清理，再释放自己持有的 Runtime 资源；即使前一步失败，也继续尝试后续资源清理并保留全部错误。

Electron 应在主进程持有 Gateway。在正常 before-quit 中同步 preventDefault，启动一次宿主清理并等待；成功后放行再次 app.quit。Electron 不会自动等待事件监听器返回的 Promise，单纯关闭窗口也不代表应用退出。该退出协调属于宿主，不放进 SDK，也不需要 SDK 的 waitForShutdown。CLI 同样在自己的退出/失败路径等待 close。强杀、崩溃和系统中断不能保证回调执行，须由宿主与 Runtime 恢复机制处理；见 [Electron before-quit](https://www.electronjs.org/docs/latest/api/app#event-before-quit)。

验证须覆盖重复注册与 token 轮换、并发覆盖、初始化/回滚失败、close 与 register 竞争、幂等 close、取消不合作及共享 client 隔离。应检查具体资源和执行身份是否收尾，不能用进程成功退出代替无泄漏验证；专项显式本地执行，不扩大 CI。

## 执行与投递

取消 ACK、执行终态、资源清理、消息投递是四件事。run.completed 后仍可能投递失败；投递失败不能重新执行 Provider。结果未知与超时必须保留原调用身份，不因为 UI 没显示结果就自动创建新执行。

每 Bot 最多 64 个工作槽，每逻辑 session 另有 4 条排队额度；投递收尾仍占用该工作。投递回执缓存有界，不承诺跨进程重启的恰好一次交付。

final 正文累计另限 128 条消息、合计 1 MiB UTF-8。任一超限报告 `IM_FINAL_OUTPUT_LIMIT_EXCEEDED`，进入既有中断与结果未知流程；不将残缺正文作为成功 final 投递，也不触发自动产物上传。无效交互表单逐事件诊断并 ACK，使后续有效卡片动作继续处理；传输和 ACK 失败保留原重试行为。

## 产物

artifact_delivery.mode 默认 channel：成功 final 中明确的本地文件引用按本轮冻结的路径、MIME、数量、大小和取消预算检查后交付。它不是“把所有模型输出路径都上传”。tools 模式不自动上传，由业务工具提供接收方可访问的链接。

默认上限为单文件 20 MiB、总计 50 MiB、16 个文件、30 秒；配置可收紧，不能超过上限。allowed_roots 省略表示不增加该项限制，空数组拒绝全部文件；这不改变 Agent 工作区或其他路径检查。模型 Context 无权放宽宿主配置。详见[配置参考](../reference/configuration.md)与 [产物策略](../../../packages/gateway/src/delivery/artifact-policy.ts)。
