# 工程知识目录

- [ORT-94：本地引用降级与统一 OV 错误约定](tasks/ort-94-delivery-ov-errors/brief.md)：待审规格、类型白名单、错误兼容边界与本地验收矩阵。

- [Issue 36：源码工作区与根发行包分层](tasks/workspace-sdk-cli/brief.md)：[本地 CI 与宿主/归档验证](tasks/workspace-sdk-cli/validation.md)。

- [ChannelGateway 注册协议复核](tasks/gateway-registration-protocol/brief.md)：Bot ID 必填、移除材料加载设计；[应用层 Hooks 设计](tasks/gateway-registration-protocol/hooks-draft.md)（数组入口）；[双轴审查](tasks/gateway-registration-protocol/review.md)；[Hooks 与 CLI 策略实施](tasks/gateway-registration-protocol/hooks-implementation.md)。

- [CLI 实例归属、发布完成与 SDK 命名材料](tasks/cli-release-fixes/brief.md)：Issue 30/31/32，[实际验证](tasks/cli-release-fixes/validation.md)、[双轴审查](tasks/cli-release-fixes/review.md)。

- [Runtime/client 1.1.13 迁移](tasks/runtime-client-1.1.13/brief.md)：[设计](tasks/runtime-client-1.1.13/design.md)、[实施计划](tasks/runtime-client-1.1.13/plan.md)、[实际验证](tasks/runtime-client-1.1.13/validation.md)。

- [英文 PR 交付与依赖审计](tasks/issue-24-cli/pr-delivery.md)

- [Runtime 命令行连接与 cross-service](tasks/runtime-cli-attachment/brief.md)：[实际验证与全局安装](tasks/runtime-cli-attachment/validation.md)

- [Bot MCP 与环境变量自动映射](tasks/agent-execution-settings/brief.md)：[实际验证与全局安装](tasks/agent-execution-settings/validation.md)

- [Issue 24 CLI 组织与构建信息](tasks/issue-24-cli/brief.md)：[实际验证与全局安装](tasks/issue-24-cli/validation.md)

- [Gateway Home 与 Agent 配置](tasks/runtime-home/brief.md)

- [npm 发行版本纠正](tasks/client-release-version/brief.md)：按用户要求继续 1.1.12，IPC v2 不代表 npm 2.x。
- [测试、依赖与发布 CI](tasks/ci-release/brief.md)

- [PR 3 同类边界审查与修复](tasks/pr3-focused-review/brief.md)：身份、凭据、卡片事件、Windows 任务与 final 容量；[实际验证和审查](tasks/pr3-focused-review/validation.md)。

- [恢复 Gateway 待审 PR](tasks/restore-reviewed-gateway/brief.md)：[实际验证](tasks/restore-reviewed-gateway/validation.md)、[强制审批规则](rules/review.md)。

- [Gateway 双语文档与 Runtime 启动指引](tasks/gateway-bilingual-docs/brief.md)：[验证](tasks/gateway-bilingual-docs/validation.md)、[文档维护规则](rules/documentation.md)。

- [agentEnv 与可定位中断](tasks/agent-env-invocation/brief.md)：[实际验证](tasks/agent-env-invocation/validation.md)、[独立双轴审查](tasks/agent-env-invocation/review.md)。IPC v2 / client 1.1.12+ 为当前调用合同。
- [架构和所有权](rules/architecture.md)
- [Issue 328 拆分](tasks/328-standalone-gateway/brief.md)
- [渠道业务保留合同](rules/channel-behavior.md)
- [实施与验证](tasks/328-standalone-gateway/validation.md)
- [变更记录](log.md)
- 继承 `Mininglamp-OSS/octo-spec@1.2.0`，来源 revision 见 manifest。
