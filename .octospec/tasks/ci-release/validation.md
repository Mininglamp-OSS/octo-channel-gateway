---
type: Validation
title: ci-release 实际验证
description: 记录成功检查和未完成的外部发布条件。
tags: [validation, release]
---

# 实测与交付

2026-11-08，macOS Node 26.13.0。build、typecheck、docs:check 通过；17 对页面、174 本地链接、2 项示例。test:ci：575 项，574 通过、1 跳过。发布来源测试 2/2 通过，覆盖非法版本、轻量 tag、未合并 commit、非占位 manifest；暂存打包通过，源码版本保持 0.0.0。YAML 解析与 Actions 完整 SHA 检查通过，Octospec lint 与 diff --check 通过。

code-review 两个独立审查者分别审 Standards/Spec，最终均 approve，无剩余 finding；这不是 GitHub 审批。Spec 最初的尾随换行正则疑点经真实 Node 验证后撤回。

干净 pnpm 冻结安装返回 Runtime 2.0.0 tarball 404，CI 的隔离消费者安装返回 client ^2.0.0 ETARGET。成功的源码测试使用原工作树已安装候选包的本地副本，不能代表注册表安装成功。用户要求版本修正独立工作树，故本分支不修改这些依赖；另一个 PR 改为 ^1.1.12，仍须等官方包发布并更新锁。actionlint 1.7.12 下载重试后成功，全部工作流检查通过（未启用外部 shellcheck/pyflakes）。

GitHub Actions 已启用；repo secrets 列表未显示 NPM_TOKEN，不能据此确认组织级 secret 可用，正式发布前需维护者确认配置。未改 branch protection；首次 CI 成功后应添加 CI Gate/Dependency Review 为必需检查，保留原 code-review 与外部审批。未发布 npm、tag 或合并。原三归档验证入口完整保留。
