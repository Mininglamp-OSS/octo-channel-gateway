# 依赖与发行

[English](../../en/guides/dependencies.md) | [文档目录](../README.md)

**两种模式都依赖 Runtime 执行服务。** CLI 使用已启动的 Runtime Kernel，SDK 宿主也必须提供已有 Kernel endpoint，或自行使用完整 Runtime 的公开宿主 API 创建服务。Gateway 不内置执行器，不自动安装、启动或停止 Runtime。

| 依赖                                       | 用途                       | 安装责任                              |
| ------------------------------------------ | -------------------------- | ------------------------------------- |
| @mininglamp-oss/octo-runtime-client ^1.1.13 | 生产执行连接和协议类型     | npm 安装 Gateway 时自动解析并安装     |
| @mininglamp-oss/octo-runtime ^1.1.13           | Kernel、Adapter 和执行服务 | CLI 用户或 SDK 宿主显式安装并启动     |
| 完整 Runtime 的 devDependency              | 本仓测试与实际包外互操作   | 开发环境；不作为 Gateway 生产依赖分发 |
| Provider CLI / 工具                        | 原生模型与工具能力         | 运行 Kernel 的宿主安装配置            |

```sh
npm install -g @mininglamp-oss/octo-runtime@^1.1.13
octo-runtime start
octo-runtime doctor --json
npm install -g @mininglamp-oss/octo-channel-gateway
```

Runtime/client 1.1.13 已在 npm 发布。冻结安装使用正式注册表元数据和归档 integrity，先前本地候选包的 hash 不能替代正式发行 hash。Gateway 源码版本保持 0.0.0，由发行打包过程注入 tag 版本。

## 版本更新

npm 会随 Gateway 安装生产依赖，但不会后台自动升级。重新安装或显式更新时依据版本范围解析；^1.1.13 不跨到 2.x。升级依赖不会自动升级已运行的 Kernel 进程，应协调 Runtime/client/Gateway 版本，并分别按各自服务流程重启。SDK 应用若直接 import client 或 Runtime，须在自身 package.json 声明相应直接依赖，不依赖偶然的依赖提升布局。

## 本地发行验证

```sh
node scripts/lock-runtime-candidates.mjs /path/runtime.tgz /path/client.tgz
node scripts/verify-package.mjs /path/gateway.tgz /path/runtime.tgz /path/client.tgz
```

锁生成脚本从真实 1.1.13 归档读取元数据与 hash，定向更新锁并验证完整性；下载地址指向正式 npm registry，不发布包。注册表安装必须等待匹配归档发布。包外验证把三个显式归档装入独立临时目录，不依赖 Runtime checkout 私有模块。

## 完整 Runtime 开发依赖审计

完整 Runtime 保留为开发集成测试依赖，manifest 与锁已升级为 `^1.1.13`。#23 最初记录的 `^2.0.0` 不适用于当前基线。`apps/`、`packages/` 生产执行只使用公开 client 和 `/protocol`；CLI 使用 attachKernel，拷贝的 cross-service 在本仓编译，不引入 Runtime 私有包依赖。

| 已检查的用途 | 存在原因 | 决策与可替代方式 |
| --- | --- | --- |
| `test/kernel-fixture.js`、`test/native-host-fixture.js`、`test/cli-runtime-home.test.js`、`scripts/verify-package.mjs` | 通过发行包的 `/executor-kernel` 或 `/host` 导出启动隔离真实 Kernel，验证 IPC、清理、地址推导和包外互操作。 | 保留。client 能连接但不能创建服务夹具；全换为 mock 会丢失互操作覆盖。 |
| admission、pre-execution failure、task-channel、protocol、mention/instructions、group-rules、runtime、scheduling、retry 测试及 `verify-channel-features-live.mjs` 中的 `prepareInvokeInput` | 通过公开 `/executor-core` 导出观察 Runtime 对 Gateway wire 的归一化。 | 保留归一化集成断言。只检查 Gateway 构造结果的部分可改为公开协议验证器和 `test-support/kernel-mock.js`，但这不能证明 Runtime 归一化行为。 |
| diagnostic completion、task retry、tool-environment adapter 夹具中的 `runtimeModule` | 检查 Codex 事件归一化、调用 watchdog、Adapter 子进程环境组装。 | 明确属于实现耦合的回归测试，从已安装 Runtime 发行物定位，不依赖 checkout。保留对上游行为的验证；Gateway 自身断言可用标准事件夹具和公开 Kernel 调用替代，但不能直接断言内部 watchdog/Adapter 行为。 |
| Codex、OpenCode、CodeBuddy、history、artifacts、model waits、diagnostics 手动脚本及夹具 | 测试宿主明确选择 executable/Home、构造受管 Engine 并传入 createCodexAdapter；通过已安装 Runtime 携带的 Adapter 包入口加载，Kernel 使用公开 API，调用使用四参数 client。 | 删除私有 CLI loadCliAdapters/manifest 工厂、checkout 路径转换和旧聚合 Adapter 导出；由 verification-kernel 管理独立服务和 Engine。仅显式运行，真实 Provider/IM 成功仍须单独验证。CodeBuddy 手动脚本观察公开 canonical 终态和原生 ACP 证据，不再截获另一 client 的订阅。 |
| history-intent、group-rules 测试中未使用的 `runtimeModule` 导入 | 迁移夹具遗留。 | 可单独清理，不能据此证明完整 Runtime 必须保留；真正理由是上述真实 Kernel 测试。 |
| `scripts/lock-runtime-candidates.mjs` 和归档验证脚本 | 检查显式发行包及依赖 integrity。 | 保留本地发行工具，不新增 CI 范围或生产依赖。 |

`test-support/runtime-module.mjs` 以已安装完整 Runtime 为解析起点，通过其依赖定位内部模块，明确绕过包导出边界。这是已知的测试耦合，不代表这些模块是公开 API；生产代码不得导入此 helper。保留开发依赖是为了真实 Kernel 验证，不代表 Gateway 会替用户安装或启动 Runtime。未来减少测试内部耦合可以独立进行。

新增迁移和完整日志专项以 `node scripts/verify-runtime-1.1.13.mjs` 显式运行，不加入默认 test/CI glob。现有 CI 的安装、类型、构建、文档、回归、发行包与消费者检查均保持；workflow、矩阵、触发条件和 Gate 没有扩展。真实 IM/Provider 工具需要显式测试凭据，本地语法/隔离宿主通过不等于外部链路已验证。
