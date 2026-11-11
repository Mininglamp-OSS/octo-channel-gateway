# 各 Adapter 的 extraset 完整示例

[English](../../en/guides/adapter-extraset.md) | [文档目录](../README.md)

以下逐项覆盖公开 Runtime 1.1.14 默认清单的 13 个 Adapter。Gateway 不安装或启用 Adapter；先安装并运行 `@mininglamp-oss/octo-runtime@latest`，并确保所选 Provider 已配置和可用。自定义 Kernel 可提供其他 adapter_type，使用其实际注册名称。

每段都是独立的 POSIX shell 示例。替换 Bot ID、API 地址、bf_token 占位符及绝对项目路径；不要把示例占位符当作真实凭据。每个 Bot ID 必须与 token 对应身份一致。未指定 model/effort 的例子沿用 Provider 默认值，不代表所有 Adapter 支持同一模型或推理档位。

**extraset 整体替换当前 Gateway Home 的配置。不要逐段执行来添加多个 Bot。** 多 Bot 应将需要的对象合并到同一个 bots 数组，一次提交；只添加/修改一个 Bot 可用 configure。自定义 Home 时给 extraset 和后续管理命令使用相同的 --home。

保存后，已运行的托管服务需要 restart；尚未启动时使用 start；前台 run 需在原终端停止后重新运行。保存成功只表示本地配置校验通过，不代表凭据、模型或 Provider 已验证。

下方全部 13 个 CLI Adapter 示例均支持可选 `agent.instruction`，包括 OpenClaw。示例使用 `"instruction": ""`；省略、空字符串或全空白均不注入。CLI 的 pre_dispatch Hook 仅在内容 trim 后非空且 `ctx.turn.index === 1` 时，将原文作为 extra.cli/instruction XML 前置；reset/new 后下一条消息重新从第 1 轮开始。**此策略仅针对 CLI 生效。SDK 接入请自行实现并注册 Hook；仅填写 agent.instruction 不会自动注入提示词。** 详见 [Hooks 专题](hooks.md)。

## dsh

```sh
octo-channel-gateway extraset <<'JSON'
{
  "bots": [
    {
      "bot_id": "your-dsh-bot-id",
      "bot_name": "My dsh Bot",
      "api_url": "https://im.deepminer.com.cn/api",
      "bf_token": "bf_REPLACE_WITH_YOUR_BOT_TOKEN",
      "agent": {
        "adapter_type": "dsh",
        "instruction": "",
        "workdir": "/absolute/project"
      }
    }
  ]
}
JSON
```

## codex

model 和 effort 为示例，请使用账户实际支持的值。

```sh
octo-channel-gateway extraset <<'JSON'
{
  "bots": [
    {
      "bot_id": "your-codex-bot-id",
      "bot_name": "My codex Bot",
      "api_url": "https://im.deepminer.com.cn/api",
      "bf_token": "bf_REPLACE_WITH_YOUR_BOT_TOKEN",
      "agent": {
        "adapter_type": "codex",
        "instruction": "",
        "workdir": "/absolute/project",
        "model": "gpt-6.1-sol",
        "effort": "high"
      }
    }
  ]
}
JSON
```

## claude-code

```sh
octo-channel-gateway extraset <<'JSON'
{
  "bots": [
    {
      "bot_id": "your-claude-code-bot-id",
      "bot_name": "My claude-code Bot",
      "api_url": "https://im.deepminer.com.cn/api",
      "bf_token": "bf_REPLACE_WITH_YOUR_BOT_TOKEN",
      "agent": {
        "adapter_type": "claude-code",
        "instruction": "",
        "workdir": "/absolute/project"
      }
    }
  ]
}
JSON
```

## codebuddy

```sh
octo-channel-gateway extraset <<'JSON'
{
  "bots": [
    {
      "bot_id": "your-codebuddy-bot-id",
      "bot_name": "My codebuddy Bot",
      "api_url": "https://im.deepminer.com.cn/api",
      "bf_token": "bf_REPLACE_WITH_YOUR_BOT_TOKEN",
      "agent": {
        "adapter_type": "codebuddy",
        "instruction": "",
        "workdir": "/absolute/project"
      }
    }
  ]
}
JSON
```

## grok-build

```sh
octo-channel-gateway extraset <<'JSON'
{
  "bots": [
    {
      "bot_id": "your-grok-build-bot-id",
      "bot_name": "My grok-build Bot",
      "api_url": "https://im.deepminer.com.cn/api",
      "bf_token": "bf_REPLACE_WITH_YOUR_BOT_TOKEN",
      "agent": {
        "adapter_type": "grok-build",
        "instruction": "",
        "workdir": "/absolute/project"
      }
    }
  ]
}
JSON
```

## hermes

```sh
octo-channel-gateway extraset <<'JSON'
{
  "bots": [
    {
      "bot_id": "your-hermes-bot-id",
      "bot_name": "My hermes Bot",
      "api_url": "https://im.deepminer.com.cn/api",
      "bf_token": "bf_REPLACE_WITH_YOUR_BOT_TOKEN",
      "agent": {
        "adapter_type": "hermes",
        "instruction": "",
        "workdir": "/absolute/project"
      }
    }
  ]
}
JSON
```

## kimi-code

```sh
octo-channel-gateway extraset <<'JSON'
{
  "bots": [
    {
      "bot_id": "your-kimi-code-bot-id",
      "bot_name": "My kimi-code Bot",
      "api_url": "https://im.deepminer.com.cn/api",
      "bf_token": "bf_REPLACE_WITH_YOUR_BOT_TOKEN",
      "agent": {
        "adapter_type": "kimi-code",
        "instruction": "",
        "workdir": "/absolute/project"
      }
    }
  ]
}
JSON
```

## mcode

```sh
octo-channel-gateway extraset <<'JSON'
{
  "bots": [
    {
      "bot_id": "your-mcode-bot-id",
      "bot_name": "My mcode Bot",
      "api_url": "https://im.deepminer.com.cn/api",
      "bf_token": "bf_REPLACE_WITH_YOUR_BOT_TOKEN",
      "agent": {
        "adapter_type": "mcode",
        "instruction": "",
        "workdir": "/absolute/project"
      }
    }
  ]
}
JSON
```

## opencode

```sh
octo-channel-gateway extraset <<'JSON'
{
  "bots": [
    {
      "bot_id": "your-opencode-bot-id",
      "bot_name": "My opencode Bot",
      "api_url": "https://im.deepminer.com.cn/api",
      "bf_token": "bf_REPLACE_WITH_YOUR_BOT_TOKEN",
      "agent": {
        "adapter_type": "opencode",
        "instruction": "",
        "workdir": "/absolute/project"
      }
    }
  ]
}
JSON
```

## openclaw

选择 OpenClaw 中已有的 Agent；这里使用 main，不配置本地 workdir。

```sh
octo-channel-gateway extraset <<'JSON'
{
  "bots": [
    {
      "bot_id": "your-openclaw-bot-id",
      "bot_name": "My openclaw Bot",
      "api_url": "https://im.deepminer.com.cn/api",
      "bf_token": "bf_REPLACE_WITH_YOUR_BOT_TOKEN",
      "agent": {
        "adapter_type": "openclaw",
        "instruction": "",
        "provider_agent_id": "main"
      }
    }
  ]
}
JSON
```

## qodercli

```sh
octo-channel-gateway extraset <<'JSON'
{
  "bots": [
    {
      "bot_id": "your-qodercli-bot-id",
      "bot_name": "My qodercli Bot",
      "api_url": "https://im.deepminer.com.cn/api",
      "bf_token": "bf_REPLACE_WITH_YOUR_BOT_TOKEN",
      "agent": {
        "adapter_type": "qodercli",
        "instruction": "",
        "workdir": "/absolute/project"
      }
    }
  ]
}
JSON
```

## qoderclicn

```sh
octo-channel-gateway extraset <<'JSON'
{
  "bots": [
    {
      "bot_id": "your-qoderclicn-bot-id",
      "bot_name": "My qoderclicn Bot",
      "api_url": "https://im.deepminer.com.cn/api",
      "bf_token": "bf_REPLACE_WITH_YOUR_BOT_TOKEN",
      "agent": {
        "adapter_type": "qoderclicn",
        "instruction": "",
        "workdir": "/absolute/project"
      }
    }
  ]
}
JSON
```

## antigravity

```sh
octo-channel-gateway extraset <<'JSON'
{
  "bots": [
    {
      "bot_id": "your-antigravity-bot-id",
      "bot_name": "My antigravity Bot",
      "api_url": "https://im.deepminer.com.cn/api",
      "bf_token": "bf_REPLACE_WITH_YOUR_BOT_TOKEN",
      "agent": {
        "adapter_type": "antigravity",
        "instruction": "",
        "workdir": "/absolute/project"
      }
    }
  ]
}
JSON
```

**额外备注：** 对于 OpenClaw 以外的各 Adapter，`agent.model` 和 `agent.effort` 均可生效。不填写时使用对应 Provider 的默认模型和默认思考强度；填写时使用指定的模型和思考强度。两项可以分别设置，取值应使用对应 Provider 支持的模型 ID 和思考强度。
