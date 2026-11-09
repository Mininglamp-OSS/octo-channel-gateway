---
type: Task
title: Issue 24 CLI 组织与构建信息
description: 使用 Commander 对齐 Runtime 的帮助版式、命令声明和参数诊断。
tags: [cli, docs, architecture]
slug: issue-24-cli
upstream: Mininglamp-OSS/octo-channel-gateway#24
source: self
---

# 目标

用户于 2026-11-09 明确要求新 worktree、octospec 规划达到 95 分后实施。基线 9ce35cc；参考 Runtime 的 command-tree.ts、help.ts 和 write-build-info.mjs，保持独立发行边界。

## 承重与注入规则

- 注入 architecture、review、documentation 全文；没有 .octospec/_global 目录。
- CLI 解析、帮助和版本不得访问 Home、启动服务或连接 Kernel。
- 保留独立生命周期、configure、extraset/extraget；用户明确全新项目不兼容 Runtime CLI，删除组件前缀/位置参数及 config 外壳转换。JSON 错误合同和退出码保持。
- 命令声明统一接入 options、arguments、examples、子命令，业务执行仍归 main。
- 帮助采用 Runtime 的 Usage / Examples / Available Commands / Arguments / Flags / Global Flags；元数据记录真实构建 commit、dirty、ISO 时间，缺失明确 unknown。
- 参数错误只返回固定安全诊断，不拼接未知输入与凭据。

## 范围外

不改渠道执行语义、依赖版本、GitHub workflow/job/矩阵/触发/门禁；不提交、推送或合并。用户后续明确要求验证后 build、全局安装并提醒手动验收；先在临时 prefix 验证归档，再安装当前 Node 全局环境。

## 实施顺序

1. 提取 help 与 Commander 命令树；main 消费解析结果。
2. build 写入 dist 内 build-info.json，pack 原样携带。
3. 同步双语 CLI 参考；补充已有 CLI 回归测试并手动验证真实归档安装。
4. 运行 build/typecheck、docs:check、现有测试和 spec lint；记录实际结果、范围与限制。

## 验收

- 用户补充：文档完整说明可选 MCP/envs，不要求出现在 CLI 默认示例；标清当前 context.items 入口与尚未实现的 agent.mcp/agent.envs 映射，不能将设计写成已上线能力。

- 用户最终确认的 CLI 示例：API 为 https://im.deepminer.com.cn/api，model 为 gpt-6.1-sol，bot_id 下方显示 bot_name，省略 approval_mode 并沿用已有 full_access 默认行为。

- 用户追加要求：所有子命令的用法错误统一显示安全提示及对应帮助；extraset 缺标准输入时展示输入方式，示例为完整 Codex 配置（model、effort、workdir），不再使用 gateway.json 文件样例。JSON 输出保持结构化，配置失败不写文件。可执行性仍为 96/100，复用既有命令树和错误边界。

- 无参数、help、子命令 help 与 version / --version 正确输出；不执行后端。
- 固定顺序帮助段落、仓库地址、真实构建信息和有效示例可见。
- 未知命令/选项、缺值、缺必选项和多余位置参数退出 2；普通输出含安全修复提示，JSON 可解析且无帮助混入。
- 拒绝组件前缀和 component 参数，全局选项位置及声明嵌套命令/参数/示例可通过受控 fixture 验证；外壳输入拒绝且不覆盖原配置。
- 归档安装后帮助、SDK 和 metadata 可用，工作流相对 origin/main 无 diff。

## 可执行性评分（规划，不代表验证）

96/100：目标与边界 20/20，代码定位与参考 20/20，实施路径 19/20，验收可测性 19/20，风险与回退 18/20。剩余风险为实际 Windows 终端和系统服务；本次不更改服务后端，使用既有测试与离线帮助/错误路径验证。用户已授权达到阈值后开始实施。
