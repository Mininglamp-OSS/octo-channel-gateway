---
type: Validation
title: Gateway 1.0.0 首次发布与归档路径修复
description: 记录首次 tag 发布的真实失败和最小路径修复，不扩大 CI 范围。
tags: [release, ci, validation]
---

# 2026-11-10

用户授权发布首个附注 tag v1.0.0 与 npm 包 @mininglamp-oss/octo-channel-gateway。PR #28 已合入 main@8778367469628acd5ec9ca3eb8799d60a6406f3e，审核批准、code-review 与 CI 均成功；tag 指向该提交并已推送。

首次 npm Publish 运行 42782011728 的 validate、四组平台检查、spec 和 CI Gate 全部通过，生成版本为 1.0.0 的发行归档。publish 失败于 npm 参数解析：`release/mininglamp-oss-octo-channel-gateway-1.0.0.tgz` 被解释为 GitHub shorthand，执行 git ls-remote 而不是上传本地归档。此失败尚未发布 npm 包。

修复只给既有 ARCHIVE 变量加 `./`，与 Runtime 使用的本地归档路径约定一致；不新增步骤、workflow、job、矩阵、触发条件或 Gate。tag 与源码版本不修改。已下载本次 CI 验证的原始归档，使用带 `./` 的路径执行 `npm publish --ignore-scripts --access public --dry-run` 成功，识别包名与版本为 @mininglamp-oss/octo-channel-gateway@1.0.0；未执行本地真实发布。

修复经 PR 合入 main 后，用现有 workflow_dispatch 的 tag=v1.0.0、dry_run=false 发布：工作流来自 main，待发布源码仍固定为原 tag 的提交。不能仅重跑旧 tag 工作流，否则仍会执行旧路径。发布完成须以 npm registry 的版本和 dist-tag 为准。
