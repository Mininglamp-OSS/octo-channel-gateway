---
type: Validation
title: Home 与 Agent 配置及 PR 18 集成验证
description: 记录正式依赖、真实 IM 端到端、独立审查与发布包验证结果。
tags: [validation, cli, review]
---

# 最终实现

2026-11-09：Gateway 默认 Home 为 ~/.octo-channel-gateway，日志位于其 logs 子目录。CLI --runtime-home 优先于配置 runtime_home，默认 ~/.octo-runtime；地址按 Runtime 的公开 socket/named pipe 约定计算。配置 runtime_home 必须为绝对路径，CLI 相对路径在保存前解析，空参数拒绝。系统服务只保存 Gateway Home，从配置加载 Runtime Home，避免配置更新被旧服务参数覆盖。

公开 Bot 配置使用 agent.adapter_type/model/effort/workdir/provider_agent_id；不接受旧 adapter 配置。bot_name 空白或省略时回退 bot_id；configure 支持 --bot_name。双语配置和 extraset 样例包含空 bot_name、模型占位值和 effort high。模型占位值不是可直接执行的模型，也未改变运行时 Provider 默认选择。

按用户明确要求，将 PR #18 的 95c8a8ade6e17e369bdd131b92d701e3ff1280e3 相对主线的代码三方合入 fix/client-release-version 工作区；目录索引冲突保留两侧任务入口。保留 PR #17 的 Runtime/client ^1.1.12 及官方锁元数据。未创建合并提交、推送、发布或更改分支保护。原独立 checkout 保持 main 且干净。

# 验证

- Node 24.22.2，正式 npm Runtime/client 1.1.12。
- npm run build、npm run typecheck、npm run docs:check 通过；17 对页面、174 本地链接、2 项文档测试。
- npm run test:ci：579 项，578 通过、1 跳过、0 失败；包含原 PR #18 的边界与发行检查，以及新增 Home 隔离、平台地址合同、配置路径校验和 Agent 配置检查。
- npm run pack:release、npm run test:package 通过：正式 registry 独立安装及 SDK/CLI 消费。npm 12 的打包输出已兼容，npm 11 数组格式也有测试。
- scripts/verify-package.mjs 使用最新 Gateway tgz 和正式 Runtime/client tgz 通过：CLI 配置/日志、公开类型、真实 IPC 互通、注册关闭后共享 Kernel 保留。
- 原系统 Python 缺 PyYAML；在 /tmp/gateway-spec-venv 中安装 PR #18 指定的 PyYAML 6.0.3 后，Octospec lint 通过。未改系统 Python。
- git diff --check 通过，无未解决的合入冲突。

# 真实 IM 端到端

手动脚本 scripts/verify-cli-im-live.mjs 读取用户指定的 octo-im-account.md、octo-uk.json；凭据只通过 stdin/env 传递，未写入仓库或报告。

使用已有 Channel_QA 测试群 c1b5a912686c43e9abc8789c8923ff36，两个测试 Bot 既有成员关系，未修改群权限。通过真实 CLI extraset 导入 agent 配置，在独立临时 Gateway Home 前台运行，省略 runtime_home 验证默认连接。bot_name 空值回退成功；真实 Codex gpt-6.1-sol / medium 回复标记 GW_AGENT_HOME_c71c8dc7，平台消息 ID 2119642137933811712；通过用户 API key 搜索回读该轮消息成功。SIGTERM 后退出码 0，共享 Kernel instance 未变化且 execution_ready=true；临时 Gateway 配置和凭据目录已清理。

此轮覆盖真实 IM/WebSocket、CLI、Kernel、Codex 和用户消息检索；未声称验证其他 Provider、Windows 原生服务或 GitHub 托管 CI。

# CI 范围

.github 相对 PR #18 分支无差异。相对 origin/main 的增加仅为用户指定的 PR #18：CI、Dependency Review、npm Publish 和 Dependabot。没有额外 workflow/job/matrix/trigger/gate 变更；真实 IM 测试保持手动，未加入默认 CI。远端现有检查仍是原 PR 提交上的状态，不代表当前工作区已执行托管检查。

# Standards

独立审查发现启动命令过期、runtime_home 相对路径歧义、SDK 返回字段误写、发行状态说明过期，共 4 项。已修复并检查双语文档及同类入口；最终复核未解决项 0。

# Spec

独立审查发现 npm pack 输出解析不支持 npm 12、runtime_home 路径歧义、README 旧配置样例、SDK 字段说明错误，共 4 项（与 Standards 部分重合）。已修复，覆盖 npm 11/12 两种格式并实际验证独立安装；最终复核未解决项 0。
