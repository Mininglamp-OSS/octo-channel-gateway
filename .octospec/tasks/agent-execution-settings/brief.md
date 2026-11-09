---
type: Task
title: Bot MCP 与环境变量自动映射
description: agent.mcp/envs 校验并编译为公开 agentEnv.items，默认 CLI 示例保持精简。
tags: [channel, context, docs, execution]
---

# 目标与范围

用户于 2026-11-09 明确要求开始实施可选 agent.mcp、agent.envs。复用现有 worktree，保留此前修改。注入 architecture、channel-behavior、documentation、review 规则；未发现全局规则目录。

用户追加要求：同时完成 #23 的 README 默认英文部分，保留中文文档入口；所有用户文档示例不得使用 `< gateway.json`。README 说明完整 Runtime 仅为测试开发依赖，不将该说明等同于完成 #23 全部依赖审计。

## 承重与实现

- ImAgentConfig 增加公开协议类型：mcp 使用 McpServers 外壳，envs 使用 ContextEnvsPayload；使用公开验证器，不新增生产依赖。
- agent 字段作为执行默认项，在 createImInvocation 编译到 octo.execution/mcp、envs；通过既有 prepareKernelInput 进入 agentEnv，不能进入模型文本。
- 复用协议 mergeContext：context MCP 按 server 名覆盖，envs 按环境键覆盖；loadContexts 同名项仍先整体替换静态 context。Bot 工具身份变量最后注入，既有 Windows/POSIX 身份规则不变。
- historyRetry 不从最新 agent 字段补充配置，使用冻结 context，防止新增 MCP/env 在同轮重试时混入。
- 公共配置/SDK/CLI 保存均校验，错误不回显 token、URL/header 或环境值；未知 Provider 能力不冒称已实测。
- 更新中英可选示例和说明，CLI 默认示例不加入 MCP/env 字段。

## 验收

合法 stdio/HTTP MCP 和环境变量可保存并进入 agentEnv；非法 payload 明确拒绝且不覆盖已保存配置；默认/覆盖/受保护工具变量符合约定；输入不被修改、重试快照不变、材料中无 MCP/env 数据。运行 build/typecheck、相关和完整回归、docs:check、spec lint、包外 SDK/CLI 验证，之后按已有授权更新全局安装。

## 范围外

不实现 Runtime #334/#335 的协议迁移，不增加 CLI 默认字段或 flags，不安装真实 MCP 或重启用户服务，不修改 GitHub CI 范围、不创建提交或 PR。

## 可执行性评分

97/100（规划）：目标 20/20、类型与校验入口 20/20、转换/优先级 19/20、冻结与脱敏 19/20、验证路径 19/20。真实 MCP/Provider 验收另行记录；本次以公开协议和真实受控 Kernel 验证，不等同外部服务验收。
