# Complete extraset examples for each Adapter

[简体中文](../../zh-CN/guides/adapter-extraset.md) | [Documentation](../README.md)

These examples cover all 13 Adapters in the public Runtime 1.1.14 default manifest. Gateway does not install or enable Adapters. Install and run `@mininglamp-oss/octo-runtime@latest` first, with the selected Provider configured and available. A custom Kernel may register other adapter_type values; use its actual registered name.

Each block is a standalone POSIX shell example. Replace the Bot ID, API URL, bf_token placeholder and absolute project path; placeholders are not real credentials. Each Bot ID must match its token identity. Examples without model/effort use Provider defaults; they do not imply that every Adapter supports the same models or reasoning levels.

**extraset replaces the entire configuration for the selected Gateway Home. Do not run these blocks consecutively to add Bots.** For multiple Bots, combine the desired objects into one bots array and submit once; use configure to add/update one Bot. For a custom Home, pass the same --home to extraset and subsequent management commands.

After saving, restart an already running managed service; use start if it has not started. A foreground run must be stopped in its original terminal and started again. Saving validates local structure, not credentials, models or Provider availability.

All 13 CLI Adapter examples below support optional `agent.instruction`, including OpenClaw. The examples use `"instruction": ""`: missing, empty, or whitespace-only values add nothing. The CLI pre_dispatch Hook prepends nonblank text as extra.cli/instruction XML only when `ctx.turn.index === 1`; reset/new makes the next message turn 1 again. **This policy is CLI-only. SDK hosts must implement and register their own Hook; setting agent.instruction alone does not inject a prompt.** See [Hooks](hooks.md).

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

model and effort are examples; use values supported by your account.

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

Select an existing Agent in OpenClaw; this example uses main and omits local workdir.

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

**Additional note:** For every Adapter other than OpenClaw, `agent.model` and `agent.effort` control the model and reasoning effort. Omitted fields use the corresponding Provider defaults; supplied fields select the specified model and reasoning effort. You can set either field independently; use model IDs and effort values supported by that Provider.
