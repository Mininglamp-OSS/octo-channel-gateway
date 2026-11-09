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
        "model": "your-model-id",
        "effort": "high",
        "workdir": "/absolute/workspace"
      },
      "approval_mode": "ask",
      "groups_enabled": false
    }
  ],
  "context_loading": { "timeout_ms": 5000, "max_in_flight": 8 }
}
```

## CLI 顶层

| 字段                 | 合同                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------- |
| bots                 | Bot 数组，最多 64 个；API 地址和 bot_id 组合不可重复                                        |
| enabled              | false 时不启动任何 Bot 注册                                                                 |
| context_loading      | timeout_ms 默认 5000（1..30000），max_in_flight 默认 8（1..32）；CLI 本身不从 JSON 加载函数 |
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
| agent.provider_agent_id             | 仅 OpenClaw，选择已有 Agent；本渠道省略时使用 main                      |
| approval_mode                         | 默认 full_access；需要人工批准时显式 ask，不能把默认值误认为隔离沙箱    |
| run_timeout_ms                        | 可选整数 100..86400000，执行时间预算                                    |
| context                               | 可选 Context v3 静态材料/执行配置；加载与拆分规则见业务材料指南         |
| stable_context_refresh_interval_turns | 正整数，默认 30；首轮和 reset 后重新计数                                |
| codex_retry                           | Codex 专用恢复开关与次数/时间/退避预算；不是通用 Provider 重放开关      |

## 可选 MCP 与环境变量

MCP 和环境变量属于可选执行配置，仅在 Bot 有需要时填写；CLI 默认帮助和示例不要求包含这些字段。Gateway 将这些配置放入 `agentEnv.items`，不拼进提示词或 `inputs.parts`。

使用 `agent.mcp` 和 `agent.envs`，内部结构复用公开协议 payload。Gateway 校验这两个可选字段并自动编译到 `agentEnv.items`，CLI 配置与注册 SDK 均支持：

| 可选配置 | Context 覆盖位置 | Bot 字段 | 输出 |
| --- | --- | --- | --- |
| MCP | context 项 `octo.execution / mcp` | `agent.mcp`，内容为 `{ mcpServers: ... }` | `agentEnv.items` 中同 namespace/name/payload 的项 |
| 环境变量 | context 项 `octo.execution / envs` | `agent.envs`，内容为 `{ env_variables: [{ key, value }] }` | `agentEnv.items` 中同 namespace/name/payload 的项 |

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

SDK 静态配置使用同样的 Bot 对象；可信宿主代码也可通过 `loadContexts` 返回这些 context 项。动态同 namespace/name 项整体替换，不按单个 MCP server 或环境键合并。合并后的 context 再覆盖 Agent 默认项：MCP 按 server 名合并，环境变量按键合并，同名时 context 值优先；空 context 集合不会清空 Agent 默认项。同一轮重试复用冻结执行配置，不补入新配置的 server 或变量。随后 Gateway 会覆盖注入当前 `OCTO_BOT_TOKEN`、`OCTO_TOKEN` 和 `OCTO_API_BASE_URL`，自定义值不能替换当前 Bot 的工具身份。Windows 按不区分大小写的名称比较，POSIX 区分大小写。token、MCP headers 和环境变量值只能进入执行配置，不应放入业务文本。

业务 instructions 是提示词，应由 Gateway 拼入 `inputs.parts`。当前 Runtime 特殊 instructions 协议的移除见 [Runtime #334](https://github.com/Mininglamp-OSS/octo-runtime/issues/334)，调用方拥有工作目录、仅传 path 的协议调整见 [Runtime #335](https://github.com/Mininglamp-OSS/octo-runtime/issues/335)。MCP/envs 映射已在本仓实现；instructions 和 workspace 的协议迁移仍为独立任务。

## 准入与投递

allowed_sender_ids 省略沿用平台准入，[] 拒绝所有发送者。groups_enabled 默认 true，不影响私聊；group_ids 省略/null/[] 均不增加群范围限制。cards/typing 是可选展示能力开关，不改变执行权限。

artifact_delivery 可设置 mode（channel/tools）、allowed_roots、allowed_mime_types、max_file_bytes、max_total_bytes、max_files、timeout_ms。roots 要求绝对路径，MIME 要求明确 type/subtype，不支持通配；两种列表最多 32 项。数值限制见[生命周期与投递](../guides/lifecycle-and-delivery.md)。

codex_retry 的 max_consecutive_retries/max_total_retries 范围 0..100，recovery_timeout_ms 100..3600000，initial_delay_ms 100..60000，max_delay_ms 100..300000；初始延迟不能超过最大延迟。默认初始/最大延迟为 2000/30000 ms。启用策略与运行情况应结合日志，不把结构校验视为可安全重跑的证明。

权威定义：[配置类型](../../../packages/gateway/src/contracts.ts)、[校验](../../../packages/gateway/src/lifecycle/configuration.ts)。

`bot_name` 是展示名称，空值或省略时使用 bot_id。`your-model-id` 需要替换为所选 Provider 支持的模型，`effort: high` 仅演示显式选择，不设置全局默认值。公开执行配置为 `agent`，其中 `adapter_type` 选择接入实现；不支持旧的外层 `adapter` 字段。

Runtime 连接不属于业务配置。`extraset` 拒绝 `runtime_home`、`endpoint`、`runtime_endpoint` 字段；请使用 `start/run --runtime-home <path>`。
