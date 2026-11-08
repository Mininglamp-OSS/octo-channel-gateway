# 生命周期与投递

[English](../../en/guides/lifecycle-and-delivery.md) | [文档目录](../README.md)

注册成功只表示本次装配与连接初始化完成。registration.status 是 Manager 的当前 Bot 诊断快照，不是全部任务历史；只读接口不保证每个字段永远不变。

## 关闭

应用结束时 await registration.close。关闭先停止接纳，然后在共享四秒截止内请求取消所属执行、消费尾流、完成投递与业务清理、关闭上下文回调池和所属会话句柄，最后释放 client。重复 close 返回同一个 Promise；失败会拒绝，不能当作已经完整退出。

definition.signal 的 abort 会触发关闭，但异步清理错误不会从 abort() 同步抛出，因此仍需 await close。SDK 不拥有共享 Kernel 或兄弟注册；CLI stop/uninstall 同样不能替代 Runtime 的停止命令。

## 执行与投递

取消 ACK、执行终态、资源清理、消息投递是四件事。run.completed 后仍可能投递失败；投递失败不能重新执行 Provider。结果未知与超时必须保留原调用身份，不因为 UI 没显示结果就自动创建新执行。

每 Bot 最多 64 个工作槽，每逻辑 session 另有 4 条排队额度；投递收尾仍占用该工作。投递回执缓存有界，不承诺跨进程重启的恰好一次交付。

## 产物

artifact_delivery.mode 默认 channel：成功 final 中明确的本地文件引用按本轮冻结的路径、MIME、数量、大小和取消预算检查后交付。它不是“把所有模型输出路径都上传”。tools 模式不自动上传，由业务工具提供接收方可访问的链接。

默认上限为单文件 20 MiB、总计 50 MiB、16 个文件、30 秒；配置可收紧，不能超过上限。allowed_roots 省略表示不增加该项限制，空数组拒绝全部文件；这不改变 Agent 工作区或其他路径检查。模型 Context 无权放宽宿主配置。详见[配置参考](../reference/configuration.md)与 [产物策略](../../../packages/gateway/src/delivery/artifact-policy.ts)。
