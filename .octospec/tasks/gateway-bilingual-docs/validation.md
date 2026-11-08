---
type: Validation
title: Gateway 双语文档与 Runtime 启动指引验收
description: 记录双语文档、共享示例和 CLI 前置依赖的实际检查。
tags: [docs, validation, lifecycle]
---

# 2026-11-08 实际结果

规划准备评分 96/100，单独见 [brief](brief.md)。工作基于 Gateway 16d7421 加前序拆仓/API 未提交修改；没有提交、推送、发布或操作用户系统服务。

## 交付

- 16 对中英文主题页：索引、CLI/SDK 入门、架构、inputs/agentEnv、身份、材料/凭据、会话、关闭/投递、排障、迁移、依赖发行、SDK/CLI/配置参考、维护验证。
- docs/examples 共享注册/定义示例与无凭据且禁用 Bot 的 JSON 配置；docs/checks 用实际 Kernel 验证注册关闭和回调隔离。
- README 双语入口；AGENTS/架构规则明确开发者文档双语，工程记录仍中文；新增文档维护规则。
- start/restart/run 用公开 client 检查既有 Kernel。缺 endpoint 或未就绪时，在服务操作前失败，普通和 JSON 消息都有 Runtime 安装、启动、doctor、endpoint 和自定义 Home 指引。预检只关闭自己附加的 client。

## 检查

| 检查 | 真实结果 |
| --- | --- |
| npm run build | TypeScript 构建通过 |
| npm run typecheck | 通过 |
| npm run docs:check | 16 对页面，34 个 Markdown（含根 README），168 本地链接，2 JSON 代码块；共享示例类型与双语代码一致；2 项运行测试通过 |
| node --test test/cli.test.js test/registry.test.js docs/checks/examples.test.mjs | 11 项通过，0 失败 |
| node --test --test-concurrency=4 --test-timeout=20000 test/*.test.js | 562 项：561 通过、1 跳过、0 失败 |
| Prettier | 新文档、共享示例、检查脚本和修改的 CLI/测试已格式化 |
| git diff --check | 通过 |
| octospec lint | 通过；包含新增任务、规则与导航 |

## 独立审查

Standards 最终 approve / Required 0，独立复跑 docs:check 和 CLI 6 项通过。Spec 发现身份表使用了不存在的 runGeneration/attemptGeneration；改为实际 sessionGeneration/providerEpoch，并说明当前两者来自会话 generation 后复审 Required 0；独立 docs:check 通过。没有复用上次审查结果冒充本次结论。

## 候选依赖的实际阻碍与恢复

本仓依赖尚未发布的 Runtime/client 2.0 候选。最初 pnpm run docs:check 自动同步依赖，访问 registry 的 2.0 tgz 返回 404，并使本地链接缺失；该次检查没有进入文档断言，不计通过。使用前序实际 tgz 恢复 node_modules 后，恢复 package.json/pnpm-lock 的正式 ^2.0 声明和原锁；最终没有留下本机 file 依赖。

维护页使用 npm run 执行同一脚本，避免 pnpm 的隐式安装改变候选联调环境。新 docs:check、类型、全量与独立审查均在恢复后实际成功。此记录不代表 registry 已发布或干净网络安装已通过。

## 未验范围

没有真实模型/IM、原生 Windows/Linux 服务或真实系统服务安装启停验收；Kernel 测试使用受控 Adapter。文档工具校验本地链接，不验证远端链接可访问性。未新增兼容入口；既有 CLI 兼容与内部 contexts 草稿按实际情况记载。
