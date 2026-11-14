---
type: Validation
title: ORT-93 实现与本地验证
description: 删除 Gateway 静默状态机，验证源端周期通知、Runtime 超时与现有业务回归。
tags: [channel, lifecycle, verification]
timestamp: 2026-11-14T16:10:00+08:00
source: self
---

# 实现与验证

本地实现完成，等待验证审查。未提交、未推送、未创建 PR，也未部署用户环境。

## 版本与范围

- Gateway 基线与 HEAD：`1b57f2ae18a22c3766b5eaa17c7b539ac2a1cc76`，已 fetch 并确认与 `origin/main` 一致。实际实现为该版本之上的未提交 diff。
- 主机：`lvsijiaMacBook-Pro.local`；worktree：`/Users/lvsijia/codex.mlamp.cn/dmwork/octo-component/octo-channel-gateway-ort-93`；分支：`ort-93-runtime-idle-notice`。
- Node `24.22.2`，pnpm `11.25.0`；安装的 Runtime/client 均为 `1.1.14`，锁文件未改。
- 源端周期联调使用独立 worktree `/tmp/ort-93-runtime-main-67a44ebc`，基于 Runtime `origin/main@67a44ebc` 离线安装并完整构建；未改原 Runtime 工作区。
- 删除 model-wait 类、task/channel/renderer 接线、300 秒取消和派生超时文案；删除对应旧测试及旧真实 IM 专项脚本/fixture，无兼容壳。
- dispatcher 删除默认 observe 和 310 秒首帧覆盖，保留 run/tool 一天预算与业务显式覆盖；公开文本增长在已有投影记录保留长度高水位，重复/回退快照不清除静默提示。
- 更新架构规则及中英文架构、配置、生命周期文档。新专项位于 `scripts/verify-runtime-idle-notice.mjs`，仅显式本地运行。

## 实际检查

| 命令 | 结果 |
| --- | --- |
| `pnpm install --frozen-lockfile` | 通过，未改锁文件 |
| `pnpm run typecheck` | 通过，SDK/CLI/cross-service 构建与类型检查 |
| `pnpm test` | 572/572 通过，包含协议/卡片、显式取消、重试、未知结果、owner 清理和业务回归 |
| `pnpm run docs:check` | 通过，20 对双语页、310 本地链接、10 JSON 块，2/2 文档测试 |
| `OCTO_VERIFY_RUNTIME_ROOT=/tmp/ort-93-runtime-main-67a44ebc node --test scripts/verify-runtime-idle-notice.mjs` | 7/7 通过，无跳过 |
| `node --test scripts/verify-runtime-1.1.14.mjs` | 9/9 通过，包含已调整构造参数的真实 client/Kernel、私有项/图片、pre_invoke 与 debug 记录 |
| `node scripts/verify-im-context-equivalence.mjs --reference-root /tmp/ort-93-gateway-baseline-1b57f2a` | 14 份实际 pre_invoke 快照相等，仅规范化本次删除的两个默认 limits 字段 |
| `uv run --no-project --with PyYAML python .octospec/scripts/lint.py` | 通过；系统 Python 缺 PyYAML，以临时依赖执行同一检查器 |
| `git diff --check` | 通过 |
| 静态删除审计 | packages/apps 无 ImModelWait、ModelWaitSnapshot、MODEL_WAIT_TIMEOUT_MESSAGE、IM_MODEL_SILENCE_TIMEOUT 或 modelWait 引用 |
| CI/依赖审计 | `.github`、package.json、锁文件无 diff；既有 CI 检查与默认测试选择未增加 |

文档检查首次与根产物构建同时运行时未找到根类型，完成构建后恢复；随后检查指出文档禁止锚点链接，已修正为整页链接后通过。旧上下文脚本默认历史夹具已落后于本次 main 的产物白名单说明；没有改写历史夹具，新增显式 `--reference-root` 对最新 main 的真实采集进行比较并通过，避免把无关历史差异当作本次回归。

## 验收对应

| 验收项 | 证据 |
| --- | --- |
| A1/A9 | 静态删除审计；既有 task、drain、清理与取消回归；受控时钟证明 Gateway 只保留总任务截止 timer，900 秒无输出也不静默取消 |
| A2/A3/A13 | 源端 60000/120000/180000/65432 ms 投影；任意接收/读取时间不改变显示，后续新段 60000 可替换较大时长 |
| A4/A5/A11 | 手动专项：公开新文本清提示；重复/回退、空白、usage、私有 reasoning 不清提示；无 notice 不生成静默更新；工具/审批走原阶段 |
| A6/A7/A8 | 既有身份/代次、未知结果、Stop 集成回归；CardSession 一次创建、后续编辑同一消息，递增序号；终态封住迟到更新，不生成静默超时文案 |
| A10 | 受影响 retry 测试核对默认不再注入首帧/策略字段；真实 Runtime 默认 enforce/300000/60000；显式 observe、600000 空闲预算和其他字段原样生效 |
| A12/A16 | 双语文档检查、架构规则、CI 和依赖 diff；无私有生产依赖或兼容层 |
| A14 | Runtime main 真实 Kernel 接受模型空闲 1000 ms / warning 500 ms / first-frame 1000 ms；先收到真实模型输出，再由 Runtime 超时生成 run.failed；Gateway task.stopReason 未设置，无本地静默取消 |
| A15 | Runtime main 真实 ModelOutputSilence/Core/Kernel → IPC → 已发布 client 1.1.14 → ImRuntime → 同一卡片快照依次显示 60/120/180 秒，随后真实输出与 completed 正常结束 |

## 审查

按 code-review 技能启动 Standards/Spec 两路审查，均未发现有证据的缺陷。子代理终端只读被自动审批拒绝，结论依据本轮已读取的 diff、源码片段、规格与补丁；不能宣称独立读取了完整仓库。主代理另核对 CardSession/ProgressScheduler 和 client 的流序号/身份校验：复用既有节流、pending 合并、终态屏障与严格源序号，没有另建静默 notice 历史或生命周期。详细记录见 [review.md](review.md)。

## 验证边界

- 周期联调仅加速 Runtime 源端单调时钟，通知生成、Core、Kernel、IPC、client 和 Gateway 均执行真实实现。另用普通 CardSession 验证实际创建/编辑路径。未向真实外部 IM 发消息，未做客户端截图验收。
- 发布 Runtime 1.1.14 仍每段一次，周期能力须部署包含 `67a44ebc` 的 Runtime。本次已验证源码联调，不能据此宣称用户现有服务已经升级；业务“待上游”标签保留。
- 新的业务流序号/重放实现不在范围内；复用公开 client 的现有身份/顺序校验与 Gateway 代次/终态屏障，不承诺不受现有节流影响的逐条即时投递。
- 下一步为用户审查当前未提交结果；创建 PR 前仍须获得提交、推送授权并验证对应提交版本。
