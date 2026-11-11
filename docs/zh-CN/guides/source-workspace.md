# 源码工作区接入

[English](../../en/guides/source-workspace.md) | [开发者文档](../README.md)

公共 npm 发行包仍为 `@mininglamp-oss/octo-channel-gateway`，命令仍为 `octo-channel-gateway`。发行包使用者保留原 import；组合源码的宿主改用私有 `@mininglamp-oss/octo-channel-gateway-sdk`。两者运行同一个 SDK 实现。

## 包与构建

| 目录 | 包名 | 直接生产依赖 |
| --- | --- | --- |
| packages/octo-channel-gateway-sdk | @mininglamp-oss/octo-channel-gateway-sdk | Runtime Client、Markdown 解析器、ws |
| apps/cli | @mininglamp-oss/octo-channel-gateway-cli | SDK、cross-service、Runtime Client、commander |
| packages/cross-service | @mininglamp-oss/octo-channel-gateway-cross-service | iconv-lite |

三个源码包均为 private，各自构建到自己的 `dist/`。CLI 使用 `workspace:*` 和包 exports；SDK 不承担 CLI 配置、参数解析、系统服务或进程处理器。SDK 显式的 `host/*` 子路径为 CLI 提供诊断、日志与类型，避免跨包源码引用；普通宿主使用 SDK 主入口。

本仓执行 `pnpm install --frozen-lockfile` 后执行 `pnpm run build`。pnpm 先构建 SDK、cross-service，再构建 CLI，最后生成公共根 facade 与命令启动器。单包构建/类型检查读取依赖包已生成的声明，因此须先构建依赖。独立开发继续使用注册表 Runtime Client `^1.1.14`，不需要相邻 Runtime checkout；既有 Runtime 开发依赖用于受控 Kernel 测试。

## 组合两个源码子模块

宿主负责工作区发现和依赖选择。根工作区可使用下列目录模式，也可收窄到实际需要的 SDK、Runtime Client、protocol 目录；嵌套工作区文件不能替代宿主的成员声明。在宿主自己的包（例如 `packages/my-feature`）声明下列依赖，使用包入口。

```yaml
packages:
  - 'packages/*'
  - 'octo-runtime/packages/*'
  - 'octo-channel-gateway/packages/*'
overrides:
  '@mininglamp-oss/octo-runtime-client': 'workspace:*'
```

```json
{
  "dependencies": {
    "@mininglamp-oss/octo-channel-gateway-sdk": "workspace:*",
    "@mininglamp-oss/octo-runtime-protocol": "workspace:*"
  }
}
```

```js
import { ChannelGateway } from '@mininglamp-oss/octo-channel-gateway-sdk';
// TypeScript: import type { ModelInputPart } from '@mininglamp-oss/octo-runtime-protocol';
```

```sh
pnpm install
pnpm --filter "@mininglamp-oss/octo-runtime-client..." run build
pnpm --filter @mininglamp-oss/octo-channel-gateway-sdk run build
pnpm --filter my-feature run build
pnpm --filter my-feature run start
```

Runtime 源码 manifest 版本为 `0.0.0`，不满足 Gateway 发布的 Client 范围 `^1.1.14`。只启用 `linkWorkspacePackages` 或 `preferWorkspacePackages` 不能解决不匹配。宿主根 override 显式强制本地 Client，Client 的 `workspace:*` protocol 依赖继续选择本地 protocol。宿主负责确认所选源码 revision 的 API 相容；本地 Client 缺失时 override 应使安装失败。直接 import Client 的宿主包还须声明 `@mininglamp-oss/octo-runtime-client: workspace:*`。无需发布、npm link、全局安装、别名或子模块内部路径。

在 Gateway 显式执行 `node scripts/verify-source-workspace.mjs /absolute/path/to/octo-runtime`，把真实 SDK、Client、protocol 源码复制到独立临时宿主，证明 0.0.0/semver 不匹配时仍解析本地包，按依赖顺序构建，检查并执行宿主包入口，最后重复冻结安装。不会修改两个源 checkout，也不加入 CI。

## 根发布装配

即使配置 override，也要使用上面的显式构建顺序：pnpm 递归调度仍可能按原 semver 与 0.0.0 比较，导致 SDK 早于 Client 产物启动构建。override 负责选包，不保证这条构建排序边。

直接执行 `npm pack` / `pnpm pack` 会被拒绝，防止生成仍依赖私有 workspace 的不完整归档。发布使用 `pack:release`；打包后显式执行 `node scripts/verify-workspace-archive.mjs` 检查声明、生产依赖闭包、worker 执行、CLI 版本和源码链接。

构建后执行 `pnpm run pack:release`，暂存根 facade、启动器和三个私有包的真实文件，并通过 bundled `node_modules` 携带。暂存 manifest 将 `workspace:*` 替换为发布版本，包含 JavaScript、声明和日志 worker。第三方生产依赖仍由根包声明并从注册表安装；只发布根包，源码版本和锁文件不变。

`pnpm run test:package` 在 checkout 外安装归档并检查原 SDK facade 与 CLI 命令；`node --test scripts/verify-release-entrypoints.mjs` 显式检查 npm/pnpm 打包。保留原 build-info 归档路径，支持发布来源校验及历史版本恢复。既有 workflow 和检查范围保持不变。
