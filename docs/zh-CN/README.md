# 开发者文档

[English](../en/README.md) | [文档目录](../README.md)

Octo Channel Gateway 把平台消息接到已有 Runtime Kernel，管理 Bot、授权、业务材料、会话、回复与产物投递。本仓提供一个 npm 包，包含注册 SDK 与服务 CLI；不会创建或接管 Kernel。

## 从这里开始

1. 用命令行部署，阅读 [CLI 安装与运维](getting-started/cli.md)；嵌入应用，阅读 [SDK 接入](getting-started/sdk.md)。
2. 阅读[架构与所有权](concepts/architecture.md)，区分 Gateway、Runtime、Provider 和宿主应用。
3. 阅读[输入与执行环境](concepts/inputs-and-agent-env.md)及[身份与会话标识](concepts/identifiers.md)。

## 操作指南

| 任务                           | 页面                                                 |
| ------------------------------ | ---------------------------------------------------- |
| 每轮加载材料、人格和工具凭据   | [业务材料与凭据](guides/contexts-and-credentials.md) |
| 续聊、reset/new/stop、自有存储 | [会话管理](guides/sessions.md)                       |
| 安全关闭注册、处理回复与附件   | [生命周期与投递](guides/lifecycle-and-delivery.md)   |
| 定位连接、配置、执行和关闭问题 | [故障排查](guides/troubleshooting.md)                |
| 从 Runtime 内置渠道迁移        | [迁移与兼容范围](guides/migration.md)                |
| 理解 npm 安装、版本范围与升级  | [依赖与发行](guides/dependencies.md)                 |

## 接口参考

| 查阅内容                           | 页面                               |
| ---------------------------------- | ---------------------------------- |
| 注册、宿主回调、会话句柄           | [SDK](reference/sdk.md)            |
| 命令、选项、退出码和 Home          | [CLI](reference/cli.md)            |
| Bot、授权、Adapter、运行与产物设置 | [配置](reference/configuration.md) |

文档结构遵循 Runtime 的双语同路径和共享示例方式；内容以本仓当前实现为准。版本、实测范围和更新方法见[维护与验证](maintenance.md)。

[CI 与 npm 发布](guides/ci-release.md)
