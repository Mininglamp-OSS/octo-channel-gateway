---
type: Task
title: Gateway 与 Runtime Home 隔离
description: 为独立 Runtime 增加默认连接定位，同时保留 Gateway 配置和日志目录。
tags: [cli, architecture, documentation]
---

# 用户确认的约定

2026-11-09 用户明确要求：Gateway Home 默认为 ~/.octo-channel-gateway，日志也在此目录；runtime_home 默认为 ~/.octo-runtime。此要求作为本任务确认。

## 范围与验收

用户最终选择只指定 runtime_home，不暴露 endpoint。CLI --runtime-home > 配置 runtime_home > ~/.octo-runtime。Gateway --home 和日志目录独立。macOS/Linux 自动拼接 executor-kernel.sock，Windows 按标准 Runtime Home 计算 named pipe。只计算地址，不读写 Runtime 配置或启动 Kernel。旧 endpoint/runtime_endpoint 字段明确报迁移错误，避免静默连接错误实例。服务仅固定 Gateway Home，从配置读取 Runtime Home；安装和服务启动/重启保存解析值。SDK 继续由宿主显式传入 endpoint。每个 CLI 实例连接一个 Runtime，多 Runtime 可通过不同 Gateway Home 启动独立实例。

验证目录隔离、优先级、平台地址合同、既有 CLI 回归和双语文档；使用已启动 Kernel 做只读连接验证。专项手动，不扩大 CI，不提交或推送。

规划评分 97/100：目录和所有权由用户明确，连接优先级及跨平台路径可测试；Windows 原生服务运行不在本机验证范围。实际验证另记。


用户追加确认破坏性变更：公开 Bot 配置由 adapter 改为 agent，内部字段保留 adapter_type；不提供旧格式兼容。样例包含 bot_name 空字符串、model 占位值、effort high；空名称按 bot_id 显示。同步 CLI configure、SDK 类型、校验、内部配置消费和双语文档。

实际结果见 [验证与审查](validation.md)。
