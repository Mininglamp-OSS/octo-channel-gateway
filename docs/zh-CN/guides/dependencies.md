# 依赖与发行

[English](../../en/guides/dependencies.md) | [文档目录](../README.md)

**两种模式都依赖 Runtime 执行服务。** CLI 使用已启动的 Runtime Kernel，SDK 宿主也必须提供已有 Kernel endpoint，或自行使用完整 Runtime 的公开宿主 API 创建服务。Gateway 不内置执行器，不自动安装、启动或停止 Runtime。

| 依赖                                       | 用途                       | 安装责任                              |
| ------------------------------------------ | -------------------------- | ------------------------------------- |
| @mininglamp-oss/octo-runtime-client ^2.0.0 | 生产执行连接和协议类型     | npm 安装 Gateway 时自动解析并安装     |
| @mininglamp-oss/octo-runtime 2.x           | Kernel、Adapter 和执行服务 | CLI 用户或 SDK 宿主显式安装并启动     |
| 完整 Runtime 的 devDependency              | 本仓测试与实际包外互操作   | 开发环境；不作为 Gateway 生产依赖分发 |
| Provider CLI / 工具                        | 原生模型与工具能力         | 运行 Kernel 的宿主安装配置            |

```sh
npm install -g @mininglamp-oss/octo-runtime@^2
octo-runtime executor-kernel start
octo-runtime doctor --json
npm install -g @mininglamp-oss/octo-channel-gateway
```

当前 2.0.0 是本地候选、尚未发布。以上是匹配版本发布后的安装路径；现在联调用真实 tgz，不能用旧 registry 版本冒充新协议。

## 版本更新

npm 会随 Gateway 安装生产依赖，但不会后台自动升级。重新安装或显式更新时依据版本范围解析；^2.0.0 不跨到 3.x。升级依赖不会自动升级已运行的 Kernel 进程，应协调 Runtime/client/Gateway 版本，并分别按各自服务流程重启。SDK 应用若直接 import client 或 Runtime，须在自身 package.json 声明相应直接依赖，不依赖偶然的依赖提升布局。

## 本地发行验证

```sh
node scripts/lock-runtime-candidates.mjs /path/runtime.tgz /path/client.tgz
node scripts/verify-package.mjs /path/gateway.tgz /path/runtime.tgz /path/client.tgz
```

锁生成脚本从真实 2.0.0 归档读取元数据与 hash，定向更新锁并验证完整性；下载地址指向正式 npm registry，不发布包。注册表安装必须等待匹配归档发布。包外验证把三个显式归档装入独立临时目录，不依赖 Runtime checkout 私有模块。
