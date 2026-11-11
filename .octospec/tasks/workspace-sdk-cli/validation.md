---
type: Validation
title: "Issue 36：本地 CI、源码宿主与发行包验证"
description: 记录结构迁移的真实验证结果与环境边界。
tags: [architecture, validation, release]
timestamp: 2026-11-11T09:00:00Z
---

## 基线与范围

- 基线：origin/main 7af029872a6fa8914033a6f2138e3d4b10a5ecc3。
- 独立 worktree：gateway-issue-36-octospec；分支 refactor/issue-36-workspace-sdk-cli。
- 实施前可执行度 97/100。评分不代替验证。
- 78 个 SDK 源文件逐字节对比基线相同；仅搬目录。CLI 变更为包 exports 引用及独立 manifest 位置读取。

## 现有 CI 本地复现

显式运行 `SPEC_PYTHON=.tmp/spec-venv/bin/python node scripts/verify-local-ci.mjs`；此手动入口不被任何 workflow/default test 调用。

macOS arm64 / Node 24.22.2 / pnpm 11.25.0 全部通过：

| 现有步骤 | 结果 |
| --- | --- |
| pnpm install --frozen-lockfile | 4 个成员，锁文件匹配 |
| npm run typecheck | 各包构建依赖声明并独立类型检查 |
| npm run build | SDK、cross-service → CLI → 根 facade/launcher |
| npm run docs:check | 20 对双语页面、共享示例及 2 项受控 Kernel 检查通过 |
| npm run test:ci | 581 通过，0 失败，0 跳过 |
| node --test test/release-ci.test.mjs | 3 通过 |
| npm run pack:release | 根归档装配通过 |
| npm run test:package | checkout 外安装，SDK facade 与 CLI help 通过 |
| Octospec lint | 通过（隔离 venv 的 PyYAML 6.0.3） |
| 安装前后 manifest/lock 比较 | 字节一致 |

完整日志保存在该 worktree 的 `.tmp/local-ci-24.22.2/`。

macOS arm64 / Node 26.13.0 同样完整通过上述全部步骤（581/581 回归、3/3 发布合同、2/2 文档检查）；通过临时安装的原生 Node 二进制和 PATH 显式选择，未更改仓库工具版本或依赖。日志在 `.tmp/local-ci-26.13.0/`。首次执行在工程索引已添加而 validation 文件尚未落盘时被 spec 链接检查拦截；补齐记录后重跑完整流程成功。

## 显式专项

- `node scripts/verify-source-workspace.mjs /Users/lvsijia/github.com/Mininglamp-OSS/octo-runtime`：通过。真实 SDK、Client、protocol 源码复制到独立宿主；宿主自己的 feature 包依赖 SDK/protocol workspace:*，类型检查并执行真实入口。证明 SDK 的 ^1.1.14 与本地 Client 0.0.0 不匹配时，override 仍链接本地 Client/protocol，完成依赖顺序构建与冻结安装。未修改 Runtime。
- `node scripts/verify-workspace-archive.mjs`：通过。包外安装，声明检查 skipLibCheck=false，npm ls --omit=dev --all，SDK 生产依赖列表，私有包无 workspace 协议和源码链接，SDK 导入无新增进程处理器，真实日志 worker 写入及 CLI 版本一致。npm 生成的内部 bin 链接须指向归档自身。
- `node --test scripts/verify-release-entrypoints.mjs scripts/verify-cli-release.mjs scripts/verify-registration-protocol.mjs scripts/verify-gateway-hooks.mjs`：42 通过。包含 npm/pnpm 发行内容一致、CLI 归属/发布失败注入、注册与 Hooks 边界。
- `node scripts/lint-runtime-upgrade.mjs`：5 项通过；原静态检查已适配根生成入口及包 exports。
- `pnpm audit --audit-level high --json`：全部依赖漏洞数为 0；锁文件只增加 workspace importers，不增加第三方解析版本。
- `git diff --check`：通过。

## CI 范围核对与未验边界

相对 origin/main 的 `.github/workflows` diff 为空；默认 test:ci/test:package/docs:check 的测试集合不增加专项入口。既有检查仍为 Check（Ubuntu Node 24/26、macOS Node 24、Windows Node 24）、spec、CI Gate，以及 Dependency Review；code-review 为组织状态。未新增 workflow、job、矩阵、触发器、必需状态或 gate 依赖。

本地命令与依赖审计不能伪称 GitHub Dependency Review Action 或外部 code-review 已成功。Docker daemon 未运行，Linux/Windows 原生 runner 与用户服务操作未验证；未调用真实 IM/Provider、用户系统服务或发布写操作。首次验证阶段未提交、推送、开 PR 或合并；后续用户授权 review、autofix 和提交 PR，见[提交前双轴审查](review.md)。

## 差异审查

- SDK 实现唯一且源码字节不变；CLI SDK/cross-service 依赖方向正确。
- 私有包声明真实直接依赖；SDK 不依赖 commander、iconv-lite、CLI 或根发行包。
- staging 将私有依赖版本替换为发行版本，并校验第三方生产依赖与根 manifest 一致，携带声明和 worker。
- 保留原 build-info 归档位置，历史发行恢复脚本不需要变更；普通 pack 明确拒绝，避免错误发布私有 workspace 引用。
- 宿主 override 选包不保证 pnpm 对不匹配源码 semver 建立排序边；文档显式列出构建顺序。
