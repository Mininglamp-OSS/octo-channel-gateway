---
type: Task
title: Bot MCP 与环境变量映射验证
description: 可选执行配置、英文 README、安装包与全局 CLI 的实际验证记录。
tags: [channel, context, docs, execution]
---

# 实际验证

2026-11-09，macOS，Node 24.22.2；工作树基线 9ce35cc，未创建提交或 PR。规划评分 97/100 不代表实测覆盖率。

## 实现复核

- agent.mcp/envs 使用公开协议类型及验证器，经既有执行上下文合并进入 agentEnv.items，不拼入模型输入。context 按 MCP server 名和环境键覆盖 agent 默认值；Bot 工具身份变量仍最后注入。
- 同轮 historyRetry 使用冻结上下文，不混入最新 agent 默认值；测试覆盖后来新增的配置、输入不变和凭据不进入提示词。
- 非法配置返回固定安全错误，不回显 URL、headers 或环境变量值，不覆盖已保存配置。configure 保留可选执行字段。
- README 默认英文，保留中文文档入口。默认 CLI 示例维持精简；可选 MCP/envs 在中英文配置文档及独立示例中说明。README 和 docs 均无文件重定向示例，使用可复制 heredoc。
- #23 本次完成 README 部分；完整 Runtime 仍仅作为测试开发依赖，没有宣称完成依赖移除或全面审计。Runtime #334/#335 协议迁移不在本次实现范围。

## 检查结果

- build、typecheck 通过。
- docs:check 通过：17 对双语页面、36 个 Markdown、182 个本地链接、4 个 JSON 块，2 个文档执行测试；公开 agent 配置类型示例通过检查。
- CLI、配置边界和工具环境定向测试 20/20 通过。
- 既有完整测试命令共 586 项，585 通过、0 失败、1 项既有 GC 测试跳过。日志：`/tmp/gateway-agent-settings-tests.log`。跳过项要求显式 --expose-gc，此前 CLI 任务已单独验证，本轮未重复运行该专项。
- 受控真实 Kernel RPC 和子进程环境测试通过，配置入口使用 agent.envs；这不等同真实外部 MCP 服务或 Provider 的能力验收。
- pack:release、test:package 通过；临时独立安装验证公开 SDK、CLI、构建元数据和参数错误输出。
- git diff --check 通过；相对 origin/main 的 .github 与 pnpm-lock.yaml diff 为空，没有扩大 CI。
- spec lint 使用已有 `/private/tmp/gateway-spec-venv/bin/python3` 运行，避免为系统 Python 缺少 PyYAML 修改项目依赖。

## 全局安装与待手动验收

已按用户授权 build、打包，并通过 npm install -g 安装本工作树归档到当前 NVM Node 24 环境。全局入口：`/Users/lvsijia/.nvm/versions/node/v24.22.2/bin/octo-channel-gateway`。

安装后版本输出：0.0.0；commit 9ce35ccbc3a8 (dirty)；build 2026-11-09T07:04:05.439Z；仓库地址正确。实际全局 extraset --help 与包内 README 已确认使用 heredoc；模型 gpt-6.1-sol、bot_name 存在，默认帮助没有 MCP 配置字段。

请用户手动验收根命令、--version、extraset --help 及无输入 extraset 的终端引导。未启动或重启用户服务；未连接真实 IM/MCP 或外部 Provider。
