# CI 与 npm 发布

[English](../../en/guides/ci-release.md) | [文档目录](../README.md)

PR 与 main 推送执行 pnpm 冻结安装、类型、构建、双语文档、Octospec 和打包。Linux Node 24/26、macOS Node 24 运行完整回归与边界专项。Windows Node 24 检查构建、文档和隔离 SDK/CLI 安装，不代表原生服务操作验收。任一必需任务失败或跳过时 CI Gate 失败。Dependency Review 阻止新增 high/critical 漏洞，Dependabot 每周提出 npm 与 Actions 更新。

源码版本保持 0.0.0，main 可达的稳定 annotated vX.Y.Z tag 提供暂存包版本。npm Publish 对解析后的 commit 复用 CI，随后带 provenance 发布同一份验证归档。CI 只安装公开注册表依赖，不可用时门禁失败。Runtime/client 依赖使用 ^1.1.14 和正式注册表 hash，IPC 版本不决定 npm 主版本。

首次发布前配置仓库 secret NPM_TOKEN，权限限制到本包发布并具备 npm 要求的 2FA bypass 能力。token 只在发布步骤可用，PR 测试不接收。手动 npm Publish 默认 dry-run：选择 main，填写已有 annotated tag，保留 dry_run。正式发布时显式关闭 dry_run，或推送发行 tag。既有 publish job 使用 contents: write 创建 GitHub Release，其他 job 和 CI 矩阵保持原范围。

手动执行的 workflow ref（**Use workflow from** 选择框）必须是 `main`；独立的 `tag` 输入才用于选择发行源码。若 workflow ref 选成其他分支或 tag，校验会明确失败。发行 tag 仍须是 main 可达的 annotated tag。

发布按顺序完成以下确认后，才算成功：

1. 校验归档包名、tag 对应版本、干净源码提交和 SHA-512；查询 npm 精确版本。同摘要可继续恢复，不同字节立即失败，不覆盖不可变版本。预检查阶段的认证或网络故障阻止上传。
2. 将已验证归档带 provenance 发布到 `release-X.Y.Z`。轮询官方 registry，通常每 15 秒一次，最多等待 20 分钟，直到精确版本和摘要一致。404 表示尚未可见；暂态网络、5xx、429 在截止时间内重试；认证和摘要冲突直接失败。上传响应不确定时先验证，不盲目再次上传。超时使 job 失败。
3. 创建或修复对应 GitHub Release，生成英文变更说明、PR 和贡献者引用，附加 `mininglamp-oss-octo-channel-gateway-X.Y.Z.tgz`，下载附件并与 npm 摘要比对。首次发行也包含完整源码历史链接。保留已有说明，补齐缺失说明/附件；附件冲突失败。GitHub 自动提供的源码 zip/tar.gz 是额外附件，不能替代可安装 npm 包。
4. 验证发行完整后才晋升 npm 与 GitHub latest，并确认两边指针一致。恢复旧版本保留较高的完整版本，修复落后的指针。若较高指针指向不完整发行，先修复该发行；job 失败而不降级。通过既有 workflow concurrency 串行发布；外部并发修改指针可能需要再次恢复。

恢复已发布的 **1.0.0**：在 main 手动运行 npm Publish，填写 `tag=v1.0.0`、`recover_existing=true`，先保持 `dry_run=true`。恢复模式下载 npm 原始 tarball，校验摘要、包名/版本、干净构建信息和 tag commit。重建包的构建时间不同，因此不能替代原发布字节。检查 dry-run 后再以 `dry_run=false` 运行，补齐 Release/附件/latest，不重打 tag、不重新发布 npm。工作流仍通过既有 CI 验证所选源码；发布工具取本次工作流版本，因此旧 tag 无需包含新脚本。普通重跑遇到不同重建归档时必须显式选择恢复，不能默默忽略冲突。

Dry-run 校验源码/归档/registry，不上传 npm、不修改 Release/latest，也不等待有意未发布的版本。Dry-run 成功不代表已经发布。完成的依据是 publish job 最后的验证成功，不是 tag 创建或 npm 命令返回。

首次 GitHub 实际运行成功后，维护者应把 CI Gate、Dependency Review 加入必需检查，同时保留 code-review 和非作者审批要求。提交 workflow 不等于已修改分支保护。Runtime/client 1.1.14 已发布，仍需通过干净注册表安装；先前本地候选验证是独立证据。

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

原来的三归档候选验证仍由 scripts/verify-package.mjs 提供。CI 使用 scripts/verify-distribution.mjs 在独立消费者目录安装本地归档及 npm 依赖，导入 ChannelGateway 并运行 CLI help，不启动系统服务。

`npm run pack:release` 和 `pnpm run pack:release` 都使用 npm 的 pack 实现与 JSON 格式；npm 须随 Node.js 安装或在 PATH 中可用。`test:package` 也有同样要求。构建后显式运行 `node --test scripts/verify-release-entrypoints.mjs`，验证两个打包入口及手动 workflow ref 拒绝规则。该验证仅在本地运行，不增加 CI job 或门禁。

CLI 归属和发布故障注入专项显式执行 `npm run build && node --test scripts/verify-cli-release.mjs`。使用隔离进程/状态夹具和模拟发布 API，不改真实服务、npm 或 GitHub；不加入默认测试 glob 或 CI Gate。Windows 原生管理器和生产 npm/GitHub 写入仍需对应环境验证。
