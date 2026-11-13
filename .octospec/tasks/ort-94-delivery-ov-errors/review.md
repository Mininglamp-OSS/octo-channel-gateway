---
type: Review
title: ORT-94 Standards 与 Spec 双轴审查
description: 固定基线下的独立审查发现、真实复现与修复记录。
tags: [review, delivery, channel]
timestamp: 2026-11-13T11:30:00+08:00
---

# 双轴审查

固定基线：`6445fbc2948c8118de41098b315ebfd36ff75632`。没有新增提交，审查范围为 `git diff <base> --` 加未跟踪实现文件；不使用为空的 `<base>...HEAD` 冒充已审。规格源为本目录 brief.md，包含用户授权扩充的 Office/ZIP/文本类型。

两名独立审查者分别按 code-review 技能检查 Standards 与 Spec。子审查者执行器被自动审批拒绝，改为读取继承的完整源码与补丁；主执行者完成文件行号核对、命令执行及真实复现。

## Standards

发现 1 项 P2：`delivery/artifacts.ts` 的 allDefinitions 删除循环只检查使用节点的 blocked，遗漏定义节点自身的保护状态。输入 `> [r]: ./song.mp3` 后空行接 `[live][r]` 时，活动引用被降级，但引用块中的定义也被删除，违反既有受保护示例合同。

主执行者新增 `OV: a definition inside a protected quote survives active reference downgrade`，修复前确认失败（引用块只剩 `> `）。修复时为每个定义保存 blocked 并在删除前跳过受保护定义，见 `artifacts.ts:66`、`artifacts.ts:194`。修复后测试通过，Standards 审查者复核关闭该项。

未发现有证据的架构越界、CI 扩大、未授权提交或剩余规范问题。未将纯风格启发列为硬缺陷。

## Spec

发现 1 项 P2：规格要求嵌套链接/图片按无重叠区间编辑，但外层受保护共享引用成功上传、内层 mp3 图片降级时，原实现先展开外层再追加内层编辑，导致重叠替换并重新带入内层本地链接。

主执行者复现输入：引用块中使用 `[example][g]`，活动正文为一个使用 g 定义的外层链接，其 label 包含指向 voice.mp3 的图片，g 定义指向存在的 game.md。新增 `OV: a downgraded image inside a protected reference expansion uses nonoverlapping edits`，修复前确认正文错误。现在先处理降级区间，再将内层替换吸收进外层 label；被外层降级覆盖的 expansion 跳过，见 `artifacts.ts:163`。同时验证内层被外层隐藏时不上传。修复后精确输出断言通过，Spec 审查者复核关闭该项。

用户补充的 Office、ZIP、JSON/XML 等属于明确授权范围，未发现其他有证据的未解决规格偏差。

Standards：1 项发现，已修复，剩余 0 项；Spec：1 项发现，已修复，剩余 0 项。实际验证结果见 validation.md，本地审查不替代托管平台外部审批。

## MR 首轮反馈修复（2026-11-13）

MR !1 对 `c4b5fad16c9b5c0e028932b94b507c4a537c7498` 提出 1 项 HIGH：生产上传适配器在 presign 和 PUT 非成功响应时抛普通 Error，丢弃 HTTP status，导致 413/408/504 被错误映射为普通上传失败。此前只注入携带 status 的上传 mock，遗漏了真实生产适配器的传播链路；该意见已采纳。

修复 `transport/api/files.ts`，两处响应统一使用既有 OctoApiError，保留 status，path/body 仅使用固定脱敏值。先处理 HTTP 拒绝，再读取成功响应正文，防止损坏或过大的错误正文覆盖状态；失败响应的 body 清理拒绝也不覆盖状态。取消仍优先，成功上传、缓存和上传次数不变。

新增生产 `uploadChatAttachment` 到 `prepareArtifacts` 贯通验证：GET/PUT 各覆盖 413、408、504、500，另覆盖 presign 错误正文、超大正文和 PUT 清理失败，共 11 个子场景。补丁前 12/12（含父测试）失败，补丁后 12/12 通过；确认 OV 分类、日志 HTTP status、提示去重、无敏感内容及无重复上传。完整验证结果见 validation.md 增量记录。

用户要求的同类问题审查由独立子 agent 完成：两个 HTTP 失败出口及响应体异常遮蔽属于同一根因；通用 requestJson 已使用结构化错误，fetchWithDispatch 未重包异常，无需扩大修改。补丁复审未发现新问题。子执行器无法运行读取工具，主执行者提供上传和 dispatch 源码及补丁，并实际执行验证。未验证的其他超时假设未作为已证实缺陷或扩大修复范围。
