# CLI 安装与运维

[English](../../en/getting-started/cli.md) | [文档目录](../README.md)

需要 Node.js 24 或 26、已就绪的本机 Runtime Kernel、平台 Bot 与有效凭据，以及 Kernel 对应的 Provider 安装。Runtime 与 Gateway 分别维护服务和 Home。Runtime/client 1.1.12 已在 npm 发布，版本与归档验证见[依赖与发行](../guides/dependencies.md)。

## 先准备 Runtime

CLI 和 SDK 模式都依赖完整 Runtime 提供执行服务。若使用 Runtime CLI，先执行：

```sh
npm install -g @mininglamp-oss/octo-runtime@^1.1.12
octo-runtime start
octo-runtime doctor --json
```

自定义 Runtime --home 时，启动与诊断保持一致。Gateway 的 start/run 在启动前检查 Runtime，失败时给出上述指引。SDK 也会查询 Kernel 状态；SDK 宿主可自行使用完整 Runtime 公开 API 创建并维护服务。

## 配置并启动

以下路径与域名都是示意值。先启动 Kernel，再配置 Gateway；Windows 同样指定 Runtime 目录，named pipe 自动推导。

```sh
npm install -g @mininglamp-oss/octo-channel-gateway
octo-channel-gateway --help
octo-channel-gateway configure --help
octo-channel-gateway configure --bot_id assistant --api_url https://im.example.com/api --adapter_type codex --workdir /absolute/workspace
octo-channel-gateway install --autostart true
octo-channel-gateway start --runtime-home /absolute/runtime
octo-channel-gateway doctor --json
octo-channel-gateway status --json
octo-channel-gateway logs --lines 200 --follow
```

configure 只保存配置，不认证、不启动服务。示例未写入凭据；首次启动前用受保护的配置文件导入有效 bf_token，或在 SDK 中提供 credentials 回调。`--bf_token` 也可用，但参数可能进入 shell 历史及进程列表。不要把 extraget 输出作为脱敏诊断。

configure 按规范化 API 地址与 Bot ID 的组合更新，只为同一身份保留省略字段，其他端点不变。同一 Bot ID 配置到新 API 端点时，必须重新提供 `--bf_token`，不会从其他端点复制凭据或 Agent 设置。带鉴权的 REST 请求拒绝重定向。Windows 服务变更须确认任务属于当前用户，账号未知或不匹配会阻止安装和生命周期命令。

install 使用默认 Runtime 目录安装服务定义，默认开启自动启动；start 根据本次 --runtime-home 参数安装或更新定义，请求启动并等待 Gateway 就绪。未安装时 start 会自动安装并开启自启。restart 保留已安装的参数。修改配置后 restart 应用新值，CLI 没有配置热更新承诺。

## 停止和移除

```sh
octo-channel-gateway restart
octo-channel-gateway stop
octo-channel-gateway uninstall
```

restart 只重启已安装的 Gateway；stop 保留自启设置；uninstall 移除服务注册但保留配置与日志。三者均不操作 Kernel。前台调试可用 run，退出时由 CLI 接收 SIGINT/SIGTERM 并关闭注册。

```sh
octo-channel-gateway run --runtime-home /absolute/runtime
```

默认 Home 是 `~/.octo-channel-gateway`，所有操作可加 `--home` 选择实例。macOS 使用 launchd、Linux 使用 systemd 用户服务、Windows 使用用户计划任务。系统管理器可用性与已登录用户会话有关；doctor 的退出码 0 仅表示诊断完成，要查看 manager/kernel/runtime 字段。详细选项见 [CLI 参考](../reference/cli.md)。

## 导入完整配置

```sh
node dist/apps/cli/src/index.js extraset <<'JSON'
{
  "enabled": true,
  "bots": [
    {
      "bot_id": "your-bot-id",
      "bot_name": "",
      "api_url": "https://im.example.com/api",
      "bf_token": "your-bot-token",
      "agent": {
        "adapter_type": "codex",
        "model": "your-model-id",
        "effort": "high",
        "workdir": "/absolute/workspace"
      }
    }
  ]
}
JSON
```

使用前替换示例路径、Bot ID、凭据和模型 ID。`bot_name` 用于区分 Bot，空值或省略时显示 bot_id。`agent` 是执行配置，`adapter_type` 选择 Provider 接入实现。`model` 是待填写占位值，`effort: high` 是样例值，不是全局默认值。业务配置不包含 Runtime Home；由 start/run --runtime-home 指定，不传参数默认 ~/.octo-runtime。extraset 整体替换配置，restart 后生效；配置和日志仍在 ~/.octo-channel-gateway。
