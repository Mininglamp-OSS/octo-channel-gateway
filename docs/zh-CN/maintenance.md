# 维护与验证

[English](../en/maintenance.md) | [文档目录](README.md)

文档于 2026-11-08 对照当前独立 Gateway 工作树建立，基线提交为 16d7421 加当前未提交拆分/API 修改。它不是已发布版本说明。规划与真实验证分别记录在 [octospec 任务](../../.octospec/tasks/gateway-bilingual-docs/brief.md)及[验收](../../.octospec/tasks/gateway-bilingual-docs/validation.md)。

## 与 Runtime 一致的维护方法

中英文在 docs/en 与 docs/zh-CN 使用相同相对路径，语言链接跳到对应主题。执行示例放在 docs/examples，代码块与共享文件保持一致；docs/checks 使用受控 Kernel 验证示例。这里只用仓库 Markdown，不新增文档站点或 CI 工作流。根 README 提供入口，octospec 保存工程过程，不作为接入前提。

```sh
npm run build
npm run docs:check
npm run typecheck
```

文档检查覆盖双语主题/代码一致、每页语言链接、Markdown 本地链接、JSON Bot 配置、共享 TypeScript 类型及示例运行。现有 CLI/注册测试补充验证 Runtime 前置依赖、所有权和关闭。手动真实 IM/Provider 与原生系统服务验收须另记日期、版本和环境，不能由 fixture 通过推断。

## 更新规则

接口、默认值、错误码或生命周期变化时同时更新两语言与共享示例。新增主题必须加入两个索引；不要链接开发者机器绝对路径或引用不存在的发行版本。Runtime 安装指引应与支持的 IPC/client major 对齐。CLI 尚保留的兼容行为和内部草稿应如实写明，不将目标设计当成已实现。

业务逻辑的历史全量结果见 [agentEnv 验收](../../.octospec/tasks/agent-env-invocation/validation.md)。本次实际结果以本任务验收为准；不声称已验证真实模型、真实 IM 或 Windows/Linux 原生服务。
