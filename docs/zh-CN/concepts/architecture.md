# 架构与所有权

[English](../../en/concepts/architecture.md) | [文档目录](../README.md)

Gateway 的执行依赖只有公开 `@mininglamp-oss/octo-runtime-client`。一个消息先经过平台认证、群/发送者准入和会话定位，再准备业务材料，通过 client 调用 Kernel，最后消费执行事件并向原渠道投递。投递结果不等同于执行结果。

| 层                  | 职责                                                | 生命周期所有者            |
| ------------------- | --------------------------------------------------- | ------------------------- |
| 宿主应用            | 凭据、业务材料、授权策略、自有存储、Kernel 启动     | 应用                      |
| Gateway SDK         | Bot 连接、准入、会话/代次、输入组装、回复和产物投递 | 每次 ChannelRegistry 注册 |
| Gateway CLI         | 配置文件、系统服务、日志、进程信号                  | CLI / 系统服务管理器      |
| Runtime client      | 连接既有 endpoint、执行调用、观察与中断             | 注册独占 client           |
| Kernel/Core/Adapter | 接纳执行、执行信封解析、Provider 调用及原生取消     | Runtime 宿主              |
| Provider            | 模型/工具执行和原生会话                             | Provider                  |

register 不向 Kernel 注册插件或渠道定义，只在当前进程装配本仓对象并连接 Kernel。函数不会序列化到 IPC。close 只关闭自己取得的句柄；共享 Kernel、兄弟注册、宿主数据库不归它所有。

本仓不包含 WebUI/WeCom，不定义 Extra 发现或统一插件 JSON。当前 SDK 仍导出部分高级内部编排类型，例如 ImInvocationInput；常规接入使用 ChannelRegistry，避免自行拼装内部草稿。其 `contexts` 不属于 Runtime 新调用合同，见[输入与执行环境](inputs-and-agent-env.md)。

实现入口：[registry](../../../packages/gateway/src/registry.ts)、[公开导出](../../../packages/gateway/src/index.ts)、[执行输入边界](../../../packages/gateway/src/execution/kernel-input.ts)。
