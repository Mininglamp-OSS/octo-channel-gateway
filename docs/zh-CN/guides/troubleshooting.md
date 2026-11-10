# 故障排查

[English](../../en/guides/troubleshooting.md) | [文档目录](../README.md)

先区分 Runtime 就绪、Gateway 服务就绪、Bot 连接与单次执行/投递；它们不是同一个状态。CLI 和 SDK 模式都依赖已有 Runtime。

## Runtime 未就绪

start/run 在修改服务或启动前台注册前通过公开 client 查询 execution_ready。CLI 从 start/run --runtime-home 参数推导 Kernel 地址（默认 ~/.octo-runtime）；restart 沿用已安装定义，由实际 run 进程检查就绪；连接失败、协议不匹配或未就绪返回 KERNEL_UNAVAILABLE。普通输出和 JSON error.message 都附安装、启动、诊断及 Runtime Home 指引。

```sh
npm install -g @mininglamp-oss/octo-runtime@latest
octo-runtime start
octo-runtime doctor --json
```

Runtime 最低要求为 1.1.13，支持 1.x 系列；仅支持 IPC v2 不足以证明兼容 1.1.13 的 AgentEnv 合同。上述命令安装 npm `@latest`；跨主版本时需核对发行兼容说明。自定义 Runtime --home 时启动和 doctor 必须使用相同 Home；Gateway --home 是另一个目录。将 Gateway start/run --runtime-home 指向 Runtime 使用的目录后重试。安装 client npm 依赖不等于安装或启动 Kernel。

## 常见故障

| 症状 / 错误                                         | 检查及处理                                                                                         |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| GATEWAY_UNAVAILABLE                                 | Runtime 已通过前置检查，但 Gateway 未及时发布就绪状态；看 logs、配置与 Bot 认证，不重复安装 Kernel |
| IM_API_URL_INVALID                                  | 使用无用户名密码/query/fragment 的 HTTPS URL；HTTP 只允许 loopback                                 |
| IM_WORKDIR_ABSOLUTE_REQUIRED                        | 本地 Adapter 的 workdir 使用绝对路径                                                               |
| IM_OPENCLAW_WORKDIR_UNSUPPORTED                     | OpenClaw 用自己的 workspace；删除其 workdir，按需设置 provider_agent_id                            |
| IM_CONTEXT_LOADING_TIMEOUT / BUSY                   | 检查宿主 IO 与取消传播；超时操作未结束前仍占容量                                                   |
| IM_TENANT_NOT_ACTIVE                                | 当前认证空间未通过宿主授权，不用展示名称绕过                                                       |
| IM_DISPOSE_FAILED / IM_EXECUTION_CLEANUP_INCOMPLETE | 检查原调用终态和业务清理；保留失败事实，不报告完整关闭                                             |
| 已执行但未收到回复                                  | 检查投递和原调用状态，不重放未知执行                                                               |

```sh
octo-channel-gateway doctor --json
octo-channel-gateway status --json
octo-channel-gateway logs --lines 200
```

doctor 退出 0 只表示检查完成。不要提交包含凭据的 extraget 输出、完整 agentEnv 或原始工具输出。关联诊断用 bot_id、sessionId、invocationId、runId 与代次；含义见[身份参考](../concepts/identifiers.md)。

需要核对实际 client 请求时，可在启动 Gateway 的进程环境中设置 OCO_CHANNEL_GATEWAY_DEUBG=1；完整图片和凭据进入渠道原始 debug 日志，见[配置参考](../reference/configuration.md)。logs 命令读取状态镜像，不展示这些完整请求；直接查看 Gateway Home 下 logs/channels/channel-gateway-YYYYMMDDTHH.log。诊断后移除开关，不分享原始敏感日志。
