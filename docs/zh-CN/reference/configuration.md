# 配置参考

[English](../../en/reference/configuration.md) | [文档目录](../README.md)

CLI 的 config.json 只属于 Gateway，不是 Runtime 插件清单。SDK 直接接受对象与函数，无需先写文件。这个可校验样例故意禁用 Bot、没有凭据；启用前替换路径、平台地址并安全提供凭据：

```json
{
  "enabled": true,
  "bots": [
    {
      "bot_id": "assistant",
      "bot_name": "",
      "api_url": "https://im.example.com/api",
      "enabled": false,
      "agent": {
        "adapter_type": "codex",
        "instruction": "",
        "model": "your-model-id",
        "effort": "high",
        "workdir": "/absolute/workspace"
      },
      "approval_mode": "ask",
      "groups_enabled": false
    }
  ]
}
```

## CLI 顶层

| 字段                 | 合同                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------- |
| bots                 | Bot 数组，最多 64 个；API 地址和 bot_id 组合不可重复                                        |
| enabled              | false 时不启动任何 Bot 注册                                                                 |
| authorized_space_ids | 可选已认证空间允许列表；显式 [] 拒绝所有空间                                                |

config 文件/输入上限 1 MiB；每个 Bot 配置上限 256 KiB。extraset 完整替换，修改后 restart；未知业务数据不代表 Runtime 能解释它。

## Bot 与执行

| 字段                                  | 合同                                                                    |
| ------------------------------------- | ----------------------------------------------------------------------- |
| bot_id / api_url / agent            | 必填；api_url 使用 HTTPS，HTTP 仅 loopback，不含凭据/query/fragment     |
| bot_name / enabled / bf_token         | 可选名称、启用状态和配置凭据；名称不作为身份，SDK 可用 credentials 回调 |
| agent.adapter_type                  | Adapter 选择；推荐显式填写并在 Kernel 安装相应 Provider                 |
| agent.workdir                       | 可选本地绝对路径；OpenClaw 不接受此字段                                 |
| agent.model / effort                | Provider 模型/思考强度选择；实际支持由 Adapter 决定                     |
| agent.instruction | 全部 CLI Adapter（包括 OpenClaw）支持的可选字符串；空串/全空白不注入，pre_dispatch 在逻辑轮次 1 前置 extra.cli/instruction XML。SDK 接入自行实现 Hook |
| agent.provider_agent_id             | 仅 OpenClaw，选择已有 Agent；本渠道省略时使用 main                      |
| approval_mode                         | 默认 full_access；需要人工批准时显式 ask，不能把默认值误认为隔离沙箱    |
| run_timeout_ms                        | 可选整数 100..86400000，执行时间预算                                    |
| agent.items | 可选高级执行项，进入 AgentEnv.items，不进入模型正文 |
| codex_retry                           | Codex 专用恢复开关与次数/时间/退避预算；不是通用 Provider 重放开关      |

## 可选 MCP 与环境变量

MCP 和环境变量属于可选执行配置，仅在 Bot 有需要时填写；CLI 默认帮助和示例不要求包含这些字段。Gateway 将这些配置放入 `agentEnv.items`，不拼进提示词或 `inputs.parts`。

使用 `agent.mcp` 和 `agent.envs`，内部结构复用公开协议 payload。Gateway 校验这两个可选字段并自动编译到 `agentEnv.items`，CLI 配置与注册 SDK 均支持：

| 可选配置 | 高级执行覆盖位置 | Bot 字段 | 输出 |
| --- | --- | --- | --- |
| MCP | agent.items `octo.execution / mcp` | `agent.mcp`，内容为 `{ mcpServers: ... }` | `agentEnv.items` 中同 namespace/name/payload 的项 |
| 环境变量 | agent.items `octo.execution / envs` | `agent.envs`，内容为 `{ env_variables: [{ key, value }] }` | `agentEnv.items` 中同 namespace/name/payload 的项 |

下面的[完整可选配置示例](../../examples/gateway-execution.json)使用这两个 Agent 字段，故意禁用 Bot 并省略凭据。启用前填写已安装的 MCP 可执行文件、实际项目路径和 Bot 凭据。保存配置只校验结构，不会安装或启动 MCP、检查远端地址，也不能证明所选 Provider 支持这些配置。

```json
{
  "bots": [
    {
      "bot_id": "my-codex-bot",
      "bot_name": "My Codex Bot",
      "api_url": "https://im.deepminer.com.cn/api",
      "enabled": false,
      "agent": {
        "adapter_type": "codex",
        "instruction": "",
        "workdir": "/absolute/project",
        "model": "gpt-6.1-sol",
        "effort": "high",
        "mcp": {
          "mcpServers": {
            "project-tools": {
              "type": "stdio",
              "command": "/absolute/tools/project-mcp",
              "args": []
            }
          }
        },
        "envs": {
          "env_variables": [
            {
              "key": "PROJECT_ENV",
              "value": "development"
            }
          ]
        }
      }
    }
  ]
}
```

`mcpServers` 按服务器名称组织定义。`stdio` 定义使用 `type`、`command`，以及可选 `args`、`env`、`cwd`；`streamable_http` 定义使用 `type`、`url`，以及可选 `headers`。服务器定义还可以指定 `required`、`startupTimeoutMs`、`toolTimeoutMs`，具体支持须核对所选 Adapter/Provider。`envs.env_variables` 是字符串 key/value 条目列表，不是任意键组成的协议对象。stdio 服务器自身的 `env` 用于该 MCP 进程，`envs` 用于 Agent 执行环境。

CLI 将 Bot 配置映射为 SDK 注册参数。高级宿主可通过 `agent.items` 提供 namespace/name/payload 执行项，按协议合并语义覆盖 Agent 默认值（MCP 按 server 名、环境变量按键）；私有项原样透传，不按命名空间猜测为模型材料。同轮重试冻结这些项；空 items 不清除默认值。随后 Gateway 注入当前 `OCTO_BOT_TOKEN`、`OCTO_TOKEN` 和 `OCTO_API_BASE_URL`，自定义项不能覆盖工具身份（Windows 名称不区分大小写）。token、MCP headers 和环境变量值只应进入执行配置，不应放入模型输入。

CLI 配置提供 bot.agent；SDK 通过 register 第二个参数提供同一业务执行定义，Gateway 将 source、Adapter、模型、审批、MCP/envs 和预算编译为仅含 schema/items 的 AgentEnv；没有旧 AgentConfig 投影。OpenClaw 的 provider_agent_id 编译为私有 adapter.openclaw/options 的 agentId。workspace 仅传 path，不接受 mode；显式目录须已存在且可读写访问，未指定时由 Gateway 准备 ~/octo-runtime/channels/<bot_id>。OpenClaw 不需要本地工作目录。

## 执行预算

Runtime 负责执行超时控制。Gateway 默认提供一天的 `run_timeout_ms` 与 `tool_timeout_ms`，首帧沿用 Runtime 的 `first_frame_timeout_ms: 60000`，模型空闲沿用 `model_idle_timeout_ms: 300000`、`model_idle_policy: "enforce"`。五分钟是模型空闲预算，不是整次任务或正在执行的工具的最长耗时。Gateway 保留逻辑任务总截止和重试恢复预算，但不持有模型静默计时器，不因静默主动取消。

通过 `agent.items` 提供显式 limits（编译后进入 `agentEnv.items`），例如：

```json
{
  "namespace": "octo.execution",
  "name": "limits",
  "payload": {
    "model_idle_policy": "enforce",
    "model_idle_timeout_ms": 600000
  }
}
```

显式字段覆盖编译后的默认值，未提供的字段保留默认值。用户显式填写 `observe` 时原样透传，不拒绝、不强制改写。它关闭模型空闲预算的强制执行，首帧及整次执行等其他预算仍然有效。由此造成的超长等待属于本项目超时保障约定之外的 invalid 用法；`observe` 本身仍是合法 Runtime 协议值。普通渠道运行应使用 `enforce` 并调整合适的预算。见[静默展示](../guides/lifecycle-and-delivery.md)。

## 完整请求调试日志

进程环境变量 `OCTO_CHANNEL_GATEWAY_DEBUG=1`（名称按此拼写）启用 `agent_run.client_input` debug 事件，在每次 client 调用前记录完整 inputs 和 agentEnv，包括 fallback、图片 part 的 mimeType/data/byteSize/sha256 和工具凭据。保留完整 base64，不转文本占位或截断。CLI pre_invoke Hook 将该事件写入既有 channels/channel-gateway-YYYYMMDDTHH.log。SDK 不读取此环境变量或自动记录完整输入，嵌入宿主自行安装日志 Hook。开关为其他值时不生成该事件；不写入状态镜像。

变量须设置在实际 Gateway 进程环境中。前台可用 `OCTO_CHANNEL_GATEWAY_DEBUG=1 octo-channel-gateway run`；由服务管理器启动时应配置该服务的环境，临时 shell 变量不会自动写入已安装的服务定义。

该显式模式会把提示词、图片、私有配置和凭据写入日志。沿用每小时 100 MiB 容量与保留策略，debug 在待写记录达到 8 条时丢弃整条，不输出残缺 JSON；日志写入失败不影响执行。退出诊断时移除变量。

## 准入与投递

allowed_sender_ids 省略沿用平台准入，[] 拒绝所有发送者。groups_enabled 默认 true，不影响私聊；group_ids 省略/null/[] 均不增加群范围限制。cards/typing 是可选展示能力开关，不改变执行权限。

artifact_delivery 可设置 mode（channel/tools）、allowed_roots、allowed_mime_types、max_file_bytes、max_total_bytes、max_files、timeout_ms。roots 要求绝对路径，MIME 要求明确 type/subtype，不支持通配；两种列表最多 32 项。数值限制见[生命周期与投递](../guides/lifecycle-and-delivery.md)。

codex_retry 的 max_consecutive_retries/max_total_retries 范围 0..100，recovery_timeout_ms 100..3600000，initial_delay_ms 100..60000，max_delay_ms 100..300000；初始延迟不能超过最大延迟。默认初始/最大延迟为 2000/30000 ms。启用策略与运行情况应结合日志，不把结构校验视为可安全重跑的证明。

权威定义：[配置类型](../../../packages/octo-channel-gateway-sdk/src/contracts.ts)、[校验](../../../packages/octo-channel-gateway-sdk/src/lifecycle/configuration.ts)。

`bot_name` 是展示名称，空值或省略时使用 bot_id。`your-model-id` 需要替换为所选 Provider 支持的模型，`effort: high` 仅演示显式选择，不设置全局默认值。公开执行配置为 `agent`，其中 `adapter_type` 选择接入实现；不支持旧的外层 `adapter` 字段。

Runtime 连接不属于业务配置。`extraset` 拒绝 `runtime_home`、`endpoint`、`runtime_endpoint` 字段；请使用 `start/run --runtime-home <path>`。

[全部 13 个 Adapter 的完整 extraset 示例](../guides/adapter-extraset.md).

[Hooks 专题](../guides/hooks.md) 区分了 CLI 的 instruction/debug 行为与 Electron 等应用宿主自行实现的业务策略。
