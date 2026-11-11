# CLI 参考

[English](../../en/reference/cli.md) | [文档目录](../README.md)

二进制为 `octo-channel-gateway`；全局选项为 `--home <path>`、`--json`、`--help`、`--version`。只有 `start`、`run` 接收 `--runtime-home <path>`，默认 `~/.octo-runtime`。连接目录严格由本次命令决定，不从业务配置读取。Kernel 地址按此目录推导（macOS/Linux 为 executor-kernel.sock，Windows 为按 Home 计算的 named pipe）。`--home` 仅改变 Gateway 配置和日志目录，不自动启动 Runtime。

| 命令      | 行为及选项                                                              |
| --------- | ----------------------------------------------------------------------- |
| install   | 使用默认 Runtime 目录安装 Gateway 服务定义；--autostart true/false，默认 true |
| start     | 先检查 Runtime 就绪；缺服务时安装并开启自启，然后启动并等就绪           |
| restart   | 沿用已安装服务参数，等待替代进程就绪                                    |
| stop      | 停 Gateway，保留自启设置                                                |
| uninstall | 移除 Gateway 服务注册，保留配置/日志                                    |
| run       | 先检查 Runtime 就绪；前台运行，CLI 处理终止信号                         |
| status    | 输出系统服务与 Gateway 状态                                             |
| doctor    | 另加服务管理器可用性与 Kernel 状态；成功退出不代表各组件健康            |
| logs      | --lines 默认 200；--follow 跟随；配置损坏时仍可读日志                   |
| configure | 按规范化 API 地址与 bot_id 更新或新增 Bot，仅保存，同一身份保留省略字段 |
| extraset  | 从 stdin 直接读取并整体替换配置，要求重启生效                 |
| extraget  | 输出完整配置，包括凭据                                                  |

configure 必填 `--bot_id`、`--api_url`；可选 `--bot_name`、`--adapter_type`、`--workdir`、`--model`、`--effort`（low/medium/high/xhigh）、`--provider_agent_id`（仅 OpenClaw）、`--bf_token`。规范化 API 地址与 bot_id 联合标识一个 Bot，其他端点的配置分别保留。在新端点新增已有同名 Bot 时，必须显式提供新 bf_token，不继承旧端点的凭据或 agent 设置。省略可选字段仅对已存在的同一身份保留旧值；首次离线准备配置可省略凭据。

## Home 与输出

CLI 示例使用 `https://im.deepminer.com.cn/api`、Codex 模型 `gpt-6.1-sol`、effort `high`，并在 `bot_id` 下方给出 `bot_name`。示例省略 `approval_mode`：Gateway 在该字段缺省时已经使用 `full_access`。

所有子命令的用法/输入错误在文本模式下均展示安全提示和对应命令的帮助、示例。直接在终端执行 `extraset` 而未提供管道输入时展示输入指引，不保存配置。`extraset --help` 提供 POSIX shell 可粘贴的完整 Codex JSON heredoc，显式配置 model、effort、workdir 和 Bot 凭据。请替换样例地址、Bot ID、凭据和项目路径，并选择当前 Codex 账户可用的模型。空输入和非法 JSON 同样展示指引。`--json` 保持结构化错误，不混入帮助。

无参数、`--help` 和 `help [command]` 使用 Commander 生成帮助，段落顺序沿用 Runtime：Usage、Examples、Available Commands、Arguments（存在时）、Flags、Global Flags。子命令支持 `--help` 并显示继承选项。`version` 和 `--version` 输出包版本、源码 commit、构建时间及仓库 URL。构建元数据在 `npm run build` 时生成并随安装包保留，缺失时明确显示 `unknown`。帮助和版本不读取配置或启动服务。

未知命令、未知选项、缺少值/必需参数、多余位置参数以退出码 2 返回 `INVALID_ARGUMENTS`，并提示使用 `--help`。参数诊断不回显传入值。`--json` 失败时 stdout 仅包含结构化错误，不混入帮助。

默认 `~/.octo-channel-gateway`：config.json 是 CLI 自身配置，logs 保存渠道日志，service.lock 与状态端点只用于该 Home 的服务协作。不要手工删除未知活动锁或复用 Runtime Home 作为配置目录。配置写入使用临时文件原子替换；POSIX 文件模式为 0600。

`install`、`start`、`restart` 在修改原生服务前检查 Home 归属。已有前台 `run` 占用时返回 `GATEWAY_HOME_OCCUPIED`，提示 Home、所属 PID 和恢复步骤。先在该前台终端按 Ctrl+C 停止，再启动托管服务。CLI 不自动终止前台进程，也不删除其活动锁或 socket。重复 `run` 同样提示 Home 已占用；只有正常获取锁的路径会在确认所属进程已退出，或该 PID 的进程启动标记明确不同时回收锁。旧记录缺少标记或查询失败时仍保守拒绝，请核对占用进程后再恢复。macOS 启动标记只有秒级精度，标记相同不代表绝无 PID 复用。

`status`、`doctor` 关联管理器、锁和 IPC 的 PID。JSON 增加 `ownership.state`（`managed`、`unmanaged`、`none`、`unknown`）、`manager_pid`、`lock_pid`、`runtime_pid`、`lock_state` 和 `ready`；不可用的 PID 省略。托管就绪要求管理器 running、存活锁匹配、IPC 进程匹配且报告 `phase: ready`；重启还要求管理器 PID 已替换。Windows 任务后端通过原生任务当前实例的进程树、账号、可执行文件与参数，识别唯一的 Exec 进程。交接期间、身份查询失败或进程匹配不唯一时无法证明就绪：即使管理器已接受操作，start/restart 仍在截止后报错。CLI 会停止本次未确认就绪的托管启动，但保留已确认且未被替换的原实例；清理失败会明确报告。请结合 `status`、`doctor` 和原生管理器确认后重试，无关前台占用者不受影响。

IPC 可连接不代表最新保存的 Bot 配置已加载：`ownership.config_loaded` 为 `not_verified`。前台进程需回到对应终端重启；`restart` 只控制原生服务。`stop`、`uninstall` 后若还有非托管或无法确认的实例，文本提示并在 JSON 返回 `GATEWAY_INSTANCE_REMAINS` warning。

JSON 错误为 error.code / error.message。Runtime 前置条件失败的 message 给出安装、启动、doctor 与 Runtime Home 指引，不泄露底层异常正文。退出码：0 命令完成；2 INVALID/REQUIRED；3 NOT_INSTALLED；4 UNAVAILABLE；5 INCOMPLETE/DISPOSE_FAILED；其他失败 1。就绪等待默认 30 秒，失败时查看 logs。

完整实现见 [CLI 入口](../../../apps/cli/src/main.ts)和 [configure](../../../apps/cli/src/commands.ts)。命令直接操作 Gateway，不接受组件前缀或组件参数。extraset 只接收直接配置对象，拒绝 config 外壳和 module 字段。

`--bot_name` 只设置展示名称，空值或省略时显示 bot_id，不改变 Bot 身份。`--adapter_type`、`--model`、`--effort`、`--workdir` 分别写入 `agent.adapter_type`、`agent.model`、`agent.effort`、`agent.workdir`。样例模型 ID 需要替换为 Provider 支持的值，样例中的 `high` 不是全局默认推理强度。

`start --runtime-home /absolute/runtime` 将 `run --home … --runtime-home …` 写入或更新原生服务定义后启动。不带该参数的 `start` 明确使用默认 Runtime 目录。`restart` 沿用已安装参数，不接收该选项，也不改写定义；切换 Runtime 目录使用 `start --runtime-home …`。`doctor` 检查运行中 Gateway 报告的 endpoint；Gateway 停止时不猜测 Runtime 地址。管理状态标记 `definition_comparison: "not_requested"`，只核对服务身份/状态，不比较期望启动参数。

[全部 13 个 Adapter 的完整 extraset 示例](../guides/adapter-extraset.md).
