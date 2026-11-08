---
type: Rule
title: Gateway 双语文档维护
description: 同路径双语页面、共享可验证示例和实际运行依赖说明。
tags: [docs, channel]
id: gateway-documentation
tier: repo
priority: 80
load_bearing: false
inject_when:
  paths: ["docs/**", "README.md", "scripts/check-developer-docs.mjs"]
  touches: [docs]
source: self
supersedes: []
---

# 文档合同

沿用 Runtime 的 docs/en、docs/zh-CN 同路径组织。页面有对应语言及目录链接；代码示例共用 docs/examples，两语言代码一致。开发者文档无需阅读 octospec 才能接入；工程过程记录保留中文。

API、默认值、错误、CLI 或所有权变更同时更新两语言。保持 CLI 与 SDK 都需要已有 Runtime 的说明；安装 client 不等于安装或启动 Kernel。Runtime 未就绪提示须给出匹配版本安装、启动、诊断与 endpoint 步骤，不接管共享 Runtime。

显式运行 npm run docs:check（配合已构建的公开 SDK）检查双语、本地链接、配置 JSON、共享示例类型与真实受控 Kernel。记录实际日期、版本和未验范围，不扩大 CI，不将候选包写成已发布。外部链接存在性不由本地链接检查证明。
