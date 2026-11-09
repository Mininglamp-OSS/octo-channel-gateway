---
type: Validation
title: Issue 24 CLI 实际验证
description: 本地回归、发行包和用户全局安装结果；规划评分独立记录。
tags: [cli, verification]
---

# 实际验证

## 可选执行配置文档（2026-11-09）

补齐中英文配置参考与业务材料指南，提供 docs/examples/gateway-execution.json 完整可选示例，说明 MCP stdio/streamable_http、envs 格式、静态/动态覆盖和工具身份优先级。明确当前仅 context.items 支持，agent.mcp/agent.envs 映射仍待实现；instructions/workspace 协议变化链接 Runtime #334/#335，未冒称已经实施。CLI 默认示例没有新增字段。

docs:check 通过：17 对双语、36 个 Markdown、176 个链接、4 个 JSON 示例、2 个执行测试。手动调用 validateImBots 与 prepareKernelInput 验证新 JSON：配置合法，MCP/env 项进入 agentEnv，inputs.parts 仍只有原用户文本，输入配置未被修改。未连接实际 MCP 服务或验证特定 Provider 支持。spec lint 与 diff whitespace 检查通过。

## 独立 CLI 边界修正（2026-11-09）

用户明确该项目为全新项目，不兼容旧 Runtime CLI。已删除 channel-gateway 前缀解析和 extraset/extraget 的 component 位置参数，同时去除 config 外壳转换/module 忽略逻辑；外壳输入明确拒绝，既有配置不被覆盖。README、双语 CLI 参考和迁移说明同步，brief 的早期兼容要求已被用户新指令替换。

重新打包并全局安装后，实际全局 extraset/extraget --help 均显示 `[options]`，没有 component 或 Arguments 段；组件前缀和位置参数实测均退出 2 并显示帮助。typecheck、spec lint、diff whitespace 检查通过，`.github` diff 为空。

build 通过；现有完整测试 583 项，582 通过、0 失败、1 项既有 GC 跳过（日志 `/tmp/gateway-issue24-standalone-tests.log`）。双语文档检查 17 对、172 个链接及 2 个执行测试通过。回归覆盖独立命令、组件前缀/参数拒绝、config/module 输入拒绝且不改原配置。早期记录中的“旧前缀兼容通过”为历史行为，不再是当前合同。

## 示例默认值最终修正（2026-11-09）

按用户指示，extraset/configure 示例改用 gpt-6.1-sol、https://im.deepminer.com.cn/api，bot_id 后加入 bot_name；extraset 删除显式 ask。代码核对表明配置验证与执行派发原本均以 full_access 为缺省审批策略，本次无需改变运行时默认值。build、CLI 与协议回归 33/33、双语文档检查及 2 个执行测试通过。重新打包并全局安装后，已从实际 extraset --help 提取 JSON，确认模型/API、bot_name 顺序与 approval_mode 缺省均符合要求。下面的 gpt-5 记录为上一轮历史结果，已由本轮覆盖。

## 子命令输入引导追加验收（2026-11-09）

用户要求同类子命令统一展示用法指引，已将 Commander 解析失败关联到实际子命令帮助；configure 缺参数、logs/install 非法值、extraset 缺输入/空输入/非法 JSON 等均显示安全说明与帮助，JSON 模式继续仅输出结构化错误。extraset 示例改为包含 gpt-5、high effort、Codex workdir 与 Bot 字段的完整 heredoc；地址/凭据/项目路径需替换，模型须由用户账户支持。

本轮 build、typecheck、双语 docs 检查通过；完整套件 583 项，582 通过、0 失败、1 项既有 GC 跳过，日志 `/tmp/gateway-issue24-input-tests.log`。最终多行帮助格式修正后 CLI 相关 13/13 通过。真实 PTY 执行 extraset 展示输入指引且退出 2；帮助示例在临时 Home 中用 zsh 原样执行成功，配置 model/effort 保存正确，临时目录已清理。独立归档验证通过，已重新打包更新全局 CLI。CI 文件和依赖范围未改。

2026-11-09，macOS，Node v24.22.2，pnpm 11.25.0；基线 9ce35cc。未提交的 worktree 构建诚实显示 dirty，包版本保持源码占位 0.0.0。

## 结果

- `pnpm install --frozen-lockfile`、`pnpm run build`、`pnpm run typecheck`：通过；Runtime/client 仍为 1.1.12，lockfile 无变更。
- `pnpm run docs:check`：17 对双语页面、36 个 Markdown、174 个链接、2 个 JSON 示例检查通过，2 个文档执行测试通过。
- 现有完整测试命令 `node --test --test-concurrency=4 --test-timeout=20000 test/*.test.js test/manual/*.test.mjs test/release-ci.test.mjs`：582 项，581 通过、0 失败、1 跳过。日志 `/tmp/gateway-issue24-tests.log`。
- 跳过项依赖显式 GC，另用 `node --expose-gc --test test/context-loader.test.js` 验证：6/6 通过，无跳过，包括一万次上下文加载堆上界测试。
- 最后一次 build 后 `node --test test/cli.test.js test/cli-runtime-home.test.js`：12/12 通过。覆盖无参数、help/子命令、旧组件前缀、全局选项位置、嵌套声明、元数据、错误脱敏和 JSON 输出；既有真实 Kernel 生命周期回归通过。
- `npm run pack:release`、`npm run test:package`：通过；打包检查要求 build-info.json 存在，归档 SDK 和 CLI 独立安装通过。
- 显式临时 prefix 全局安装归档：SDK 导入、help、version、构建元数据逐字段匹配、参数错误退出码 2/JSON 脱敏全部通过。删除元数据、损坏 JSON、非法 commit/time 三种情形均输出 unknown，不临时生成来源/时间。验证脚本 `/tmp/gateway-issue24-verify-installed.mjs`；临时安装目录已清理。
- spec lint：系统 python3 缺 PyYAML；使用现有 `/private/tmp/gateway-spec-venv/bin/python3 .octospec/scripts/lint.py` 通过（不改项目依赖）。
- `git diff --check` 通过；相对 origin/main 的 `.github` diff 为空。既有 CI 的 check/spec/gate、4 项 OS/Node 矩阵及其触发条件、门禁依赖均无变更；build 新增元数据生成属于本次产品产物，不增加专项 CI。

## 全局安装与手动验收

按用户后续明确授权，已将本 worktree 构建归档通过 `npm install -g` 安装到当前 NVM Node 24 全局环境。全局入口为 `/Users/lvsijia/.nvm/versions/node/v24.22.2/bin/octo-channel-gateway`。

安装后实际 `--version`：包 0.0.0，commit 9ce35ccbc3a8 (dirty)，build 2026-11-09T06:00:25.666Z，仓库地址正确。全局 `configure --help` 显示示例、Flags 和 Global Flags；未启动或重启 Gateway/Runtime 服务。

待用户手动执行 `octo-channel-gateway`、`octo-channel-gateway --version`、`octo-channel-gateway configure --help`、`octo-channel-gateway --unknown` 验收终端展示。

## 范围与复核

本地逐项复核了 architecture、documentation、review 规则与 brief 验收：生产依赖边界不变；解析模块不读取配置或连接服务；双语同步；真实构建时间随包固定；错误只输出固定安全文本。尚未执行 Windows/Linux 原生终端、实际 IM/Provider 或系统服务安装验收，不将本地结果视为远端审批。未创建提交、PR 或执行合并。
