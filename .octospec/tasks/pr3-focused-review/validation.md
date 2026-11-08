---
type: Validation
title: PR 3 边界专项审查与修复实测
description: 分别记录外部意见核实、双轴复审与实际回归证据。
tags: [review, security, lifecycle, delivery, validation]
---

# 2026-11-08 验证结果

规划可执行性评分为 96/100，见 brief；该分数不表示测试或 GitHub 外部审批通过。初始审查固定 diff 为 `git diff 41cc84281770a3d206b50a3f420b99702af34a15...00f0a1d2be645adfc5facb7245346f3ec329e565`；增量复审使用 `git diff 00f0a1d` 及新增专项测试。

## Standards

初审 3 项 P1：configure 同名跨端点配置丢失、跨端点继承旧凭据、无效交互回答使轮询反复失败。现已使用规范化 API+bot_id 联合身份，仅从匹配项继承；新端点同名 Bot 缺新凭据明确拒绝。本地表单验证错误逐事件诊断与 ACK；控制调用失败仍由既有未知结果语义处理。

增量复审建议补充 Runtime 超限集成与有效控制后的 ACK 失败验证，均已补齐。最终独立 Standards 复审 `approve`，剩余 finding 为 0；审查者独立运行专项 11/11 通过。这不是 GitHub 审批票。

## Spec

初审 2 项 P2：Windows 变更未统一阻止归属不符任务、final 正文无条数/字节预算。这些在迁移前 Runtime 基线 bf9ff6b 已存在，不能归为本次新回归；本轮一并修复。任务归属未知或 principal/trigger 不匹配时拒绝所有变更；同用户普通配置及登录模式漂移可由 install 修复。final 限 128 条、合计 1 MiB UTF-8，超限中断并提示结果未知，不能以残缺正文或产物伪装成功。

增量复审发现双语 CLI reference 仍描述按 bot_id 合并，以及登录模式被误判为任务归属，现已修正并补成功路径测试。最终独立 Spec 复审 `approve`，剩余 finding 为 0；审查者独立运行专项 11/11 通过。

## 外部意见逐类核实

- 已修复上述联合身份、凭据、无效交互、Windows 归属和 final 预算问题；REST 直连与共享客户端也统一默认拒绝重定向。
- 不把 fetch 跨源重定向称为已验证的鉴权泄露：实际行为会剥离 Authorization。本次硬化明确禁止跟随，loopback 验证目标请求数为 0。
- Manager 工厂返回后已有 closed/aborted 检查，且 runtime 在 start 前已赋值；既有重入关闭测试覆盖，不成立所述漏关路径。
- artifact allowed_roots 省略时不额外限制、空数组全部拒绝，是双语文档明文合同；API 与 WebSocket 服务允许独立部署，也没有同源合同。本轮不擅自变更这些产品策略。
- systemd WorkingDirectory 与 StandardOutput/StandardError 的 append 路径按完整右值解析，不按 ExecStart 参数分词；核对 systemd load-fragment.c 对应解析器，不能套用 ExecStart 引号规则。
- 未知或未授权事件按原合同推进本地读取游标、不 ACK 非本领域/未授权事件；原运行时测试明确约束，不能以 ACK 清理另一领域的事件。

## 实测命令与结果

- `npm run build`、`npm run typecheck`：通过。
- `npm run docs:check`：16 对页面、34 Markdown、168 本地链接、2 项可执行示例全部通过。
- `node --test --test-timeout=20000 test/manual/pr3-boundaries.test.mjs`：11/11 通过。覆盖双端点同 ID 配置隔离、新端点凭据拒绝与成功新增、Windows 七类变更拒绝异主/未知、同用户 InteractiveToken/S4U 配置修复、REST 全 API 族拒绝重定向、final 两种容量与 Runtime 超限中断/未知通知、无效及有效动作的 ACK 丢失不重放控制。
- `node --test --test-concurrency=4 --test-timeout=20000 test/*.test.js test/manual/pr3-boundaries.test.mjs`：573 项，572 通过、1 跳过、0 失败。
- 按 code-review-and-quality 反向验证：临时将 CLI 联合身份 `===` 改为 `!==` 后重新构建，配置专项按预期失败；恢复后同项通过，源文件 SHA-1 前后均为 `49f232fe54499f1f6a13bb391854edee19ddd7d3`。未保留变异代码。
- `git diff --check`：通过。Octospec lint 通过：19 个 OKF 单元、4 条规则、198 个本地文件链接。
- GitHub API 回读 main 仍要求 1 票非作者审批、推送撤销旧批准、code-review、strict、conversation resolution，且 enforce_admins 开启；不合并、不发布。

## 验证边界

以上是本地 macOS 与受控 mock/loopback 验证，Windows 仅 fake runner，没有操作实际系统任务。未进行真实 IM/Provider 或原生 Linux/Windows 服务验收。使用现有候选依赖，Runtime/client 2.0.0 未发布的问题仍阻止全新 registry 安装。专项显式运行，没有新增 CI workflow、兼容层、依赖或 Runtime 私有接口。
