# CI 与 npm 发布

[English](../../en/guides/ci-release.md) | [文档目录](../README.md)

PR 与 main 推送执行 pnpm 冻结安装、类型、构建、双语文档、Octospec 和打包。Linux Node 24/26、macOS Node 24 运行完整回归与边界专项。Windows Node 24 检查构建、文档和隔离 SDK/CLI 安装，不代表原生服务操作验收。任一必需任务失败或跳过时 CI Gate 失败。Dependency Review 阻止新增 high/critical 漏洞，Dependabot 每周提出 npm 与 Actions 更新。

源码版本保持 0.0.0，main 可达的稳定 annotated vX.Y.Z tag 提供暂存包版本。npm Publish 对解析后的 commit 复用 CI，随后带 provenance 发布同一份验证归档。CI 只安装公开注册表依赖，不可用时门禁失败。Runtime/client 依赖使用 ^1.1.12 和正式注册表 hash，IPC 版本不决定 npm 主版本。

首次发布前配置仓库 secret NPM_TOKEN，权限限制到本包发布并具备 npm 要求的 2FA bypass 能力。token 只在发布步骤可用，PR 测试不接收。手动 npm Publish 默认 dry-run：选择 main，填写已有 annotated tag，保留 dry_run。正式发布时显式关闭 dry_run，或推送发行 tag。本任务不创建发行 tag、不发布包。已发布版本不可变；npm 报错后先核查，不覆盖既有版本。

首次 GitHub 实际运行成功后，维护者应把 CI Gate、Dependency Review 加入必需检查，同时保留 code-review 和非作者审批要求。提交 workflow 不等于已修改分支保护。Runtime/client 1.1.12 已发布，仍需通过干净注册表安装；先前本地候选验证是独立证据。

本地命令：

```sh
pnpm install --frozen-lockfile
npm run typecheck
npm run build
npm run docs:check
npm run test:ci
npm run pack:release
npm run test:package
```

原来的三归档候选验证仍由 scripts/verify-package.mjs 提供。CI 使用 scripts/verify-distribution.mjs 在独立消费者目录安装本地归档及 npm 依赖，导入 ChannelRegistry 并运行 CLI help，不启动系统服务。
