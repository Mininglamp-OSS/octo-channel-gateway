# 配置参考

[English](../../en/reference/configuration.md) | [文档目录](../README.md)

CLI 的 config.json 只属于 Gateway，不是 Runtime 插件清单。SDK 直接接受对象与函数，无需先写文件。这个可校验样例故意禁用 Bot、没有凭据；启用前替换路径、平台地址并安全提供凭据：

```json
{
  "runtime_home": "/absolute/runtime",
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
| runtime_home | Runtime 目录，默认 ~/.octo-runtime；可被 --runtime-home 覆盖。配置中填写绝对路径。 |
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

## 准入与投递

allowed_sender_ids 省略沿用平台准入，[] 拒绝所有发送者。groups_enabled 默认 true，不影响私聊；group_ids 省略/null/[] 均不增加群范围限制。cards/typing 是可选展示能力开关，不改变执行权限。

artifact_delivery 可设置 mode（channel/tools）、allowed_roots、allowed_mime_types、max_file_bytes、max_total_bytes、max_files、timeout_ms。roots 要求绝对路径，MIME 要求明确 type/subtype，不支持通配；两种列表最多 32 项。数值限制见[生命周期与投递](../guides/lifecycle-and-delivery.md)。

codex_retry 的 max_consecutive_retries/max_total_retries 范围 0..100，recovery_timeout_ms 100..3600000，initial_delay_ms 100..60000，max_delay_ms 100..300000；初始延迟不能超过最大延迟。默认初始/最大延迟为 2000/30000 ms。启用策略与运行情况应结合日志，不把结构校验视为可安全重跑的证明。

权威定义：[配置类型](../../../packages/gateway/src/contracts.ts)、[校验](../../../packages/gateway/src/lifecycle/configuration.ts)。

`bot_name` 是展示名称，空值或省略时使用 bot_id。`your-model-id` 需要替换为所选 Provider 支持的模型，`effort: high` 仅演示显式选择，不设置全局默认值。公开执行配置为 `agent`，其中 `adapter_type` 选择接入实现；不支持旧的外层 `adapter` 字段。
