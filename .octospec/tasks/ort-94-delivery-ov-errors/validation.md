---
type: Validation
title: ORT-94 实现与本地验证
description: 白名单扩充、引用降级、统一 OV 错误及审查修复的实际验证记录。
tags: [delivery, channel, verification]
timestamp: 2026-11-13T11:30:00+08:00
---

# 本地验证结果

本地实现及验证通过，等待用户审查验证结果。未提交、未推送、未创建 PR。

## 版本与环境

- 执行编号：`ORT-94-20261113-implement-01`。
- 主机：`lvsijiaMacBook-Pro.local`，macOS，Node `v24.22.2`，pnpm `11.25.0`。
- 分支：`ort-94-delivery-ov-errors`。
- Worktree：`/Users/lvsijia/codex.mlamp.cn/dmwork/octo-component/octo-channel-gateway-ort-94`。
- HEAD 与 `origin/main`：`6445fbc2948c8118de41098b315ebfd36ff75632`。本次 fetch 后无需 rebase；没有新增 commit。
- 实现、测试、双语文档和 brief 均为未提交变更。13 个相关文件的内容快照 SHA-256 为 `bb2608c5d4cb7e5c4d71042271a62ef3dc29198df87567ece28764bfac2ecf58`，不含本文件与 review.md。
- 快照算法：合并 `git diff <base> --name-only` 与 `git ls-files --others --exclude-standard` 的路径，去重排序；排除 validation.md/review.md；依次对每个路径、NUL、文件字节、NUL 计算 SHA-256。该快照用于区分同一 HEAD 下的未提交实现。

## 实现与验收对应

| 验收 | 实现与证据 |
| --- | --- |
| A1-A3 类型与静默跳过 | `artifact-types.ts` 集中维护 40 个扩展名；Office、ZIP、XML/JSON 等按用户补充纳入。所有支持扩展名（含大写、空文件）均经过投递回归；独立断言 Office/ZIP/结构化文本 MIME。目录、目录软链接、FIFO、音视频/未知类型不上传、不报错、不占额度 |
| A4-A6 路径与 Markdown | AST 精确区间编辑；相对/绝对/file URL、编码文件名、Windows 路径分类、行内与引用式形式、共享定义、嵌套图片、特殊字符及名称长度回归通过；远程/代码/HTML/引用块保护行为保持 |
| A7-A10 故障与混合交付 | 读取失败、读取期间真实文件变化、策略拒绝、数量/字节限制、上传 413/408/504/ETIMEDOUT/TimeoutError、普通上传失败均映射 OV；成功附件与跳过项互不阻断；同码提示去重 |
| A11 卡片与缓存 | 卡片明确失败/未知分别显示 `OV_DELIVERY_CARD_FAILED` / `OV_DELIVERY_CARD_UNCONFIRMED`；保留成功 URL；正文重试不重复上传、不重开文件卡预算 |
| A12 执行隔离 | 上传失败/超时的真实执行编排回归确认 invocation 仅一次、终态仍为 `completed`；stop/reset/shutdown、身份撤销、重连和 obsolete 回归通过 |
| A13 诊断 | 启用真实 RuntimeLogging worker 落盘验证 OV、stage、ENOENT、diag 编号与 effect 哈希；状态镜像不含投递诊断，日志无本地路径/cause；日志同步抛错与异步拒绝被隔离 |
| A14 模式 | tools 模式不上传、不改写、不追加提示 |
| A15 CI 与文档 | 中英文类型表和 OV 约定同步；workflow、package scripts、lockfile diff 均为空，默认测试选择与 CI Gate 未修改 |

## 实际命令与结果

| 命令 | 结果 |
| --- | --- |
| `pnpm run build` | 通过，SDK、cross-service、CLI 及根包组装成功 |
| `node --test test/im-artifact-delivery.test.js` | 实现首轮调整后 129/129 通过；随后新增 2 项审查回归和 2 项终态回归均已纳入最终完整测试 |
| `node --test --test-name-pattern='nonoverlapping edits\|definition inside a protected\|protected reference\|OV: downgrade' test/im-artifact-delivery.test.js` | 修复后 4/4 通过 |
| `node --test --test-name-pattern='presentation cleanup.*upload-' test/im-artifact-delivery.test.js` | 2/2 通过，覆盖上传失败与超时后终态不变 |
| `pnpm run typecheck` | 最终通过，无类型错误 |
| `pnpm test` | 最终串行运行 580/580 通过，无失败/跳过；日志保存在本机 `/tmp/ort-94-tests.log` |
| `pnpm run docs:check` | 通过：20 对页面、42 个 Markdown 文件、302 个链接、8 个 JSON 块；共享示例与 2 项受控 Kernel 验证通过 |
| `uv run --no-project --with PyYAML pnpm run lint:spec` | 通过；使用临时 PyYAML 环境，不修改仓库依赖 |
| `git diff --check` | 通过 |
| `git diff <base> -- .github package.json pnpm-lock.yaml apps/cli/package.json packages/octo-channel-gateway-sdk/package.json packages/cross-service/package.json` | 空 diff |

开发过程中旧行为预期先出现红灯，已按白名单合同调整。双轴审查另发现两个 Markdown 问题，先新增回归确认失败，再修复并确认通过，详见 review.md。

有一次复验同时运行构建/类型检查与完整测试，`im-message-content.test.js` 文件级失败，汇总 575/576。该文件随后单独 5/5 通过；停止并行构建后完整串行重跑最终 580/580 通过。并行读取构建产物的干扰为可能原因，未将其断言为已证实根因。

## 审查与 CI 范围

- 采用 code-review 技能，Standards 与 Spec 两轴独立审查。Standards 1 项 P2、Spec 1 项 P2；均由主执行者复现、修复并补回归，剩余 0 项。
- 子审查者执行工具受自动审批限制，审查基于继承的完整源码和补丁；实际命令、行号核对与复现由主执行者完成。此本地审查不代表托管平台的外部批准或 `code-review` 状态。
- 现有 workflow：`ci.yml`、`dependency-review.yml`、`npm-publish.yml`。原检查包括 Check 矩阵、spec、CI Gate、Dependency Review；本次无 workflow/job/矩阵/触发/必需状态/Gate 依赖及默认测试开关变更。
- 本次没有推送或 PR，未运行任何远端检查、发布或真实渠道测试。包发行结构未改变，未新增专项发布验证。

## 限制与下一步

- 本机执行了软链接与 FIFO 回归；Windows/UNC 在非 Windows 主机仅验证分类与安全降级，未运行 Windows 文件系统或其他 Node 版本。
- 渠道 HTTP、上传与卡片发送使用受控 mock；不保证每种图片/Office/HTML 格式都能内联预览。ZIP 不解压。
- 未配置 RuntimeLog 时沿用静默日志行为；原始 cause 不持久化，脱敏结构用于定位。
- 用户审查本次验证结果后，再决定是否授权提交、推送和创建 PR；本次不自动执行这些操作。

## MR 反馈修复验证（2026-11-13）

执行编号 `ORT-94-20261113-reject-01`，基于已推送的 `c4b5fad16c9b5c0e028932b94b507c4a537c7498` 修复生产上传 HTTP 状态传播；修复范围为 files.ts、既有附件测试及本目录审查/验证记录。以上首轮快照与测试结果为历史记录，本节是修复后的结果。

- 生产适配器新增回归先红后绿：11 个子场景及父测试共 12/12 通过，覆盖 presign/PUT 的 413、408、504、500 和错误正文读取/清理异常。验证 HTTP status 进入 OV 映射及诊断，正文不泄露响应内容、签名或 token，两条别名引用不重复上传，不增加重试。
- `pnpm run build`、`pnpm run typecheck`：通过。
- `pnpm test`：构建结束后完整串行执行，**592/592 通过**，无失败或跳过；日志 `/tmp/ort-94-reject-tests.log`。
- `pnpm run docs:check`：通过，20 对双语页面、42 个 Markdown 文件、302 个链接、8 个 JSON 块及 2 个受控 Kernel 检查。
- `uv run --no-project --with PyYAML pnpm run lint:spec`：通过；记录更新后再次检查。
- `git diff --check`：通过。相对目标分支的 workflow、包脚本和锁文件无改动，未扩大 CI。
- 子 agent 同类审查与补丁复核未发现其他已证实问题；实际验证由主执行者完成。Windows 和真实渠道服务仍未实测。

按已有授权提交并推送原 MR 分支；推送后的提交版本与工作区情况记入 Loop 结果评论。返工完成后回到验证审查，等待用户认可新结果，不将推送等同于外部审查通过。
