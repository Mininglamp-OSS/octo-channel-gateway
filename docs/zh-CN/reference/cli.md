# CLI 参考

[English](../../en/reference/cli.md) | [文档目录](../README.md)

二进制为 `octo-channel-gateway`；全局选项是 `--home <path>`、`--endpoint <path>`、`--json`、`--help`、`--version`。endpoint 优先取命令行，其次取配置；不存在隐式 Runtime 探测或自动启动。

| 命令      | 行为及选项                                                              |
| --------- | ----------------------------------------------------------------------- |
| install   | 安装 Gateway 服务定义并保存 endpoint；--autostart true/false，默认 true |
| start     | 先检查 Runtime 就绪；缺服务时安装并开启自启，然后启动并等就绪           |
| restart   | 先检查 Runtime 就绪；重启已安装服务，缺服务不安装                       |
| stop      | 停 Gateway，保留自启设置                                                |
| uninstall | 移除 Gateway 服务注册，保留配置/日志                                    |
| run       | 先检查 Runtime 就绪；前台运行，CLI 处理终止信号                         |
| status    | 输出系统服务与 Gateway 状态                                             |
| doctor    | 另加服务管理器可用性与 Kernel 状态；成功退出不代表各组件健康            |
| logs      | --lines 默认 200；--follow 跟随；配置损坏时仍可读日志                   |
| configure | 按 bot_id 更新或新增一个 Bot，仅保存配置，省略可选字段保留旧值          |
| extraset  | 从 stdin 整体替换配置，接受旧 config 外壳，要求重启生效                 |
| extraget  | 输出完整配置，包括凭据                                                  |

configure 必填 `--bot_id`、`--api_url`；可选 `--adapter_type`、`--workdir`、`--model`、`--effort`（low/medium/high/xhigh）、`--provider_agent_id`（仅 OpenClaw）、`--bf_token`。同 bot_id 更新 API 地址不会追加第二个 Bot，旧重复项会合并为一项；注意业务身份的变化需重新认证。

## Home 与输出

默认 `~/.octo-channel-gateway`：config.json 是 CLI 自身配置，logs 保存渠道日志，service.lock 与状态端点只用于该 Home 的服务协作。不要手工删除未知活动锁或复用 Runtime Home 作为配置目录。配置写入使用临时文件原子替换；POSIX 文件模式为 0600。

JSON 错误为 error.code / error.message。Runtime 前置条件失败的 message 给出安装、启动、doctor 与 endpoint 指引，不泄露底层异常正文。退出码：0 命令完成；2 INVALID/REQUIRED；3 NOT_INSTALLED；4 UNAVAILABLE；5 INCOMPLETE/DISPOSE_FAILED；其他失败 1。就绪等待默认 30 秒，失败时查看 logs。

完整实现见 [CLI 入口](../../../apps/cli/src/main.ts)和 [configure](../../../apps/cli/src/commands.ts)。旧组件命令形式见[迁移](../guides/migration.md)。
