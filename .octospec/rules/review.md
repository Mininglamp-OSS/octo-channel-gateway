---
type: Rule
title: Gateway 受保护合并
description: main 强制外部审批与组织审查状态，本地验证不能替代 GitHub 合并门槛。
tags: [review, pull-request, governance]
id: gateway-review
tier: repo
priority: 95
load_bearing: true
inject_when:
  paths: ["**"]
  touches: [review, pull-request, governance]
source: self
supersedes: []
---

# 合并条件

main 必须通过 PR 合并，至少取得一票非作者审批；新增推送使旧批准失效。要求 `code-review` 状态成功、分支与 main 同步且所有讨论已解决；管理员同样受约束，禁止强推和删除。

本地独立审查、测试通过、组织审查排队或拥有合并权限，均不能替代 GitHub 的外部批准。合并前查询实际保护和 PR 状态；保护缺失时不能将普通合并成功当作审查通过。用户本轮要求仅重提待审 PR，不执行合并。

本仓当前没有自有 CI workflow，`code-review` 是现有组织状态，不声称存在 Runtime 的 CI Gate。构建、类型、双语 docs、测试和包外验证分别记录实际结果；未发布的 Runtime/client 版本仍须单列安装限制。
