---
type: Plan
title: Runtime/client 1.1.13 迁移步骤与验收
description: 将实施拆分为公开配置、执行编译、测试工具与文档交付，并规定验证证据。
tags: [planning, validation, dependency, protocol]
---

# 实施顺序

状态：规划已确认，实现与本地验证完成；命令结果和未验范围独立记录在 [验证记录](validation.md)。

1. 已完成：按已确认 D01 保留 bot.agent/ImAgentConfig，梳理所有业务字段在 Gateway 的单一编译映射及既有 Context 覆盖规则；不新增 bot.agentEnv。
2. 定向升级生产 client 与开发 Runtime 到 `^1.1.13`，从官方 registry 更新 lock，首次锁定正式 1.1.13。检查其他依赖无意外升级，不变更 packageManager 或源码版本 0.0.0。安装后核对公开类型与本规划差异。
3. 按必要范围更新 contracts、lifecycle/configuration、CLI commands 和示例；保留 SDK/CLI 的 bot.agent 业务入口并共用 Gateway 编译逻辑，增加 instruction 可选字符串校验及配置保存。私有项不要求上游公共登记。Gateway 不导入 adapter-sdk 或 Runtime 私有包。
4. 迁移 dispatcher/kernel-input/model-input：移除旧顶层字段和 instructions；source/approval 用 item；workspace 仅 path；OpenClaw agentId 用私有 item。增加 instruction 首轮与 fallback 前缀，区分新 Provider 会话和渠道周期刷新；显式模型材料与执行配置分流，保留原本刷新/动态覆盖/冻结规则。
   模型 renderer 按 D03 改成注释边界及 context 标签，取消固定总容器；保留内部 guidence/data、CDATA、原文和排序规则，选取/排除条目的原有规则及 MODEL_CONTEXT_PATTERNS 不变。
5. 校验目录准备和恢复失败；检查 task.ts 的剩余预算、工具凭据、session/provider 身份和终态消费，确保不为修类型而重放请求。
6. 迁移现有 mock、测试、包外消费者和真实工具，删除旧 request 配置投影断言。脚本不能再加载相邻 Runtime checkout 的工厂，也不能用删除的聚合 Adapter 导出。
7. 更新当前架构规则、目录、双语 SDK/CLI/依赖/Context 文档、最低版本提示；历史记录保持版本绑定。执行下列检查，记录真实结果与未验范围。

步骤 2–7 已完成；清单见 [影响清单](impact.md)。D04 追加实现完整 inputs/agentEnv debug 日志，图片与 fallback 保持完整，日志异常不影响执行。生产 CLI 仅 attachKernel；手动验证宿主显式拥有 Engine，关闭时负责回收。

## 验收矩阵

| ID | 场景与必须观察到的结果 | 验证位置 |
| --- | --- | --- |
| A01 | manifest 两处范围为 ^1.1.13，锁及 registry integrity 对应正式包；生产无完整 Runtime/私有包依赖 | frozen install、package manifest、包外安装 |
| A02 | 信封仅 schema/items；source、审批、模型、MCP/envs 和预算按 bean 传递 | kernel-input 测试及公开协议验证器 |
| A03 | 自定义 `adapter.octobuddy/options` 嵌套 payload 与相对顺序经真实 IPC 到假 Adapter 后相同；其他 Adapter 忽略不消费的项 | 显式本地专项，禁止加入 CI/default test glob |
| A04 | 人格、MENTION_GUIDANCE、历史和新消息在主输入/恢复输入中顺序正确；首轮、续聊、刷新、reset 和冻结重试无遗漏或重复 | 迁移现有 mention/model/context-gap/retry 回归 |
| A05 | env/私有执行项/凭据不出现在正文和公开日志；当前凭据覆盖旧值，Windows 键大小写处理保持 | kernel-input、凭据和日志回归 |
| A06 | 默认目录由 Gateway 准备，显式不存在/非目录/不可访问路径明确失败；reset 不删目录；OpenClaw 不要本地 path，agentId 正确到达消费方 | 现有目录回归与显式本地专项 |
| A07 | sessionId/generation/providerSession 不变；取消 ACK、终态和投递分别确认；断流不自动重放；兄弟注册与 Kernel 存活 | runtime/task/retry/registry-close 回归 |
| A08 | SDK 与 CLI 继续只需填写 bot.agent，由 Gateway 编译同样的 items；无需 AgentEnv；动态覆盖及冻结语义保持，输入业务对象不被修改 | 类型/CLI/loader 回归和共享示例 |
| A09 | Gateway 打包后在独立目录仅用正式 npm 依赖完成连接、请求及关闭；不依赖源码 checkout 或 workspace symlink | test:package、verify-package.mjs |
| A10 | 当前文档无旧控制指令、workspace.mode 和最低 1.1.12 指引；双语一致；历史示例不被无差别重写 | docs:check、lint:spec 和定向搜索 |
| A11 | instruction 首轮置于所有其他输入之前，正常续聊/渠道周期刷新不重复，reset 后和 fresh fallback 重新携带；冻结重试配置更新不污染已准备的输入，图片顺序不变 | 新增显式本地专项，不加入 CI/default test glob |
| A12 | instruction 空值不输出，非字符串拒绝，超预算明确失败；字段可经 SDK/CLI 配置保存，既不进入 AgentEnv 也不升级为系统权限 | 本地专项、共享类型示例与文档检查 |
| A13 | 注释边界内为逐项 context，无 contexts/context-item 外壳；内部 guidence/data、text/JSON、CDATA 终止符、对象键排序、原文及条目顺序保持，空材料不输出外壳 | 迁移现有 model-context/kernel-input 格式断言 |
| A14 | 相同条目集合经新旧 renderer 的选取结果一致：原有 extra.*、octo.content/inline/references 注入，原排除项继续排除；extra.im 所有权及执行项/凭据隔离保持；instruction、材料、本轮输入顺序正确，恢复稿一致 | 显式本地专项，不加入 CI/default test glob |
| A15 | 仅 OCO_CHANNEL_GATEWAY_DEUBG=1 记录最终完整 inputs/agentEnv，包含图片 base64/元数据及 fallback，SDK 与 CLI 文件日志一致；默认关闭、无状态镜像、日志故障不影响调用 | 显式本地专项，真实隔离 IPC |

## 检查命令与范围

已执行 frozen install、build、typecheck、默认测试、既有 test:ci、docs:check、发行包和独立消费验证。实际命令及包管理器限制见 validation.md；spec lint 使用临时 PyYAML 工具环境，不修改项目依赖。

新增专项放在默认选择范围外，例如 `scripts/verify-runtime-1.1.13.mjs`，仅显式运行；本仓 `test:ci` 包含 `test/manual/*.test.mjs`，因此放进 manual 目录也可能扩大 CI，禁止用该路径规避范围约束。可迁移已有测试以适配接口，但不得借此增加专项 CI；验收前核对 `.github/workflows`、package.json 的默认测试入口与实际选择列表。

真实 Codex/IM 调试仅显式连接准备好的测试环境，使用本次归档/正式依赖并记录版本、平台、命令和场景；无认证或测试 Bot 时标记未验。不得重启用户默认服务来验证。macOS 本地通过不能等同于 Windows/Linux 原生验证。

## 交付边界

实现后的 build、类型、回归、包外与真实服务结果分别记入 validation，不以规划评分替代验证。用户已授权提交、推送和 PR；未授权合并、tag 或 npm 发布。
