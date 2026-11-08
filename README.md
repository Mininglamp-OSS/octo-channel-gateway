# Octo Channel Gateway

[中文开发者文档](docs/zh-CN/README.md) | [English documentation](docs/en/README.md)

独立的 Octo IM 渠道注册 SDK 与服务 CLI。仅通过公开 `octo-runtime-client` 连接已有 Kernel；业务定义、上下文、凭据、会话与消息投递由 Gateway 或宿主应用管理。

## npm 与 CLI

支持 Node.js 24 或 26。CLI 和 SDK 模式都依赖已有 octo-runtime Kernel；安装 client 依赖不会自动安装或启动 Runtime。先完成 [Runtime 准备与启动](docs/zh-CN/getting-started/cli.md)。

```sh
npm install -g @mininglamp-oss/octo-runtime@^2
octo-runtime executor-kernel start
octo-runtime doctor --json
npm install -g @mininglamp-oss/octo-channel-gateway
octo-channel-gateway configure --help
octo-channel-gateway install --endpoint /absolute/runtime/executor-kernel.sock
octo-channel-gateway start
octo-channel-gateway doctor
octo-channel-gateway status --json
octo-channel-gateway logs --lines 200 --follow
octo-channel-gateway restart
octo-channel-gateway stop
octo-channel-gateway uninstall
```

start/restart/run 会先查询 Runtime 是否就绪，失败时给出安装、启动、doctor 和 endpoint 指引。先用 Runtime SDK 或 CLI 启动 Kernel，再提供其 endpoint；Windows 使用 Kernel named pipe。install 保存 endpoint 并默认开启自启，start 未安装时自动安装，restart 只重启已安装服务。stop 保留自启设置，uninstall 保留配置和日志。

默认 Home 为 `~/.octo-channel-gateway`，可用 `--home` 指定。`config.json` 是 CLI 自己的配置，包含 bots、可选 context_loading、authorized_space_ids 和 endpoint。SDK 不需要文件或统一 schema。服务管理沿用 launchd、systemd 用户服务与 Windows 用户计划任务。

原有 configure、extraset、extraget 配置能力保留；命令开头可保留 channel-gateway 组件层级。extraset 是完整替换自身配置的兼容命令，接受旧 `{config, enabled?}` 外壳，忽略旧 module 元数据。extraget 输出包含凭据的完整配置。

```sh
octo-channel-gateway extraset < gateway.json
octo-channel-gateway extraget
octo-channel-gateway run --endpoint /absolute/runtime/executor-kernel.sock
```

迁移时从旧 Runtime 显式导出 Gateway 配置，再通过新命令导入。旧 Runtime 的 Home、身份和配置不会被自动删除或改写。WebUI 与 WeCom 不属于本仓。

## 注册 SDK

安装 `@mininglamp-oss/octo-channel-gateway` 后：

```ts
import { ChannelRegistry } from "@mininglamp-oss/octo-channel-gateway";

const registration = await ChannelRegistry.register(endpoint, {
  bot: {
    bot_id: botId,
    api_url: apiUrl,
    bf_token: botToken,
    adapter: { adapter_type: "codex", workdir }
  },
  loadContexts(_bot, { signal }) {
    signal.throwIfAborted();
    return [{ namespace: "octo.control", name: "instructions",
      payload: { entries: [{ text: readCurrentInstructions() }] } }];
  }
});
try {
  await applicationLifetime;
} finally {
  await registration.close();
}
```

每次注册拥有独立 client 和 Bot 资源，不拥有 Kernel。loadContexts 每轮读取当前数据；createSessionStore 可同步返回宿主自有的会话句柄。重复 close 返回同一结果，在共享四秒期限内排空执行及投递，清理失败明确拒绝。关闭某个注册不影响共享 Kernel 或兄弟注册。

## 开发

```sh
pnpm install
pnpm run build
pnpm test
npm pack
```

apps/cli 承载命令和服务管理，packages/gateway 承载 SDK 与渠道业务；一个 npm package 同时导出 SDK 与 octo-channel-gateway 二进制。生产依赖不包含完整 Runtime；测试使用已安装的 Runtime 发行包做互操作验证。

本仓继承 Mininglamp-OSS/octo-spec@1.2.0，revision 见 .octospec/manifest.yaml。规划与验收见 [.octospec/index.md](.octospec/index.md)。

## 执行环境与中断（2.0 破坏性迁移）

Gateway 使用 `KernelClient.invoke(inputs, sessionId, providerSession, agentEnv)`。inputs 只包含模型材料；历史、规则和 `extra.im` 由本仓生成文本/图片后发送，namespace 是渠道材料约定。cwd、Adapter、model/effort、环境变量、MCP、审批和受信指令放在 agentEnv。运行时不拼装渠道历史，不要求业务材料遵循 namespace 格式。

调用立即返回含 invocationId/runId/sessionId 的迭代句柄。停止指定执行使用 `client.interrupt(handle.invocationId, reason)`；sessionId 是业务会话标识，providerSession 是 Adapter 返回的 Provider 续聊信息，均不能替代 invocationId 取消某一轮。取消受理后仍消费原迭代器直至终态；Adapter 内部负责原生取消映射。API 不再接收旧 request 外壳、contexts 或 signal 参数。

生产依赖为 client `^2.0.0`；`npm install -g` 会自动安装依赖，重新安装或显式更新时才按版本范围解析，不会后台自动升级，也不会跨到 3.x。Runtime/Client 2.0.0 为本次本地候选，尚未发布；注册表安装需先发布匹配版本。联调使用实际 tgz，不依赖 Runtime checkout 内部模块。

包外验证：`node scripts/verify-package.mjs GATEWAY.tgz RUNTIME.tgz CLIENT.tgz`。三个候选包显式安装到独立临时目录，验证公开类型、CLI 和真实 Kernel 互操作；不安装系统服务。测试用完整 Runtime 是 devDependency，不是 Gateway 的生产依赖。

未发布候选的锁可通过 `node scripts/lock-runtime-candidates.mjs RUNTIME.tgz CLIENT.tgz` 由 pnpm 生成，hash 来自真实归档，下载地址指向正式注册表。发布时须使用匹配归档；打包变化后重新生成锁并复验。此步骤不发布任何包。
