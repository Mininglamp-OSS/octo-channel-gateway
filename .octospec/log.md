# 工程知识变更记录

## 2026-11-08

- [Gateway PR 交付授权](journal/shared/2026-11-08-gateway-pr-delivery.md)：用户追加要求提交并合并 main；覆盖 SDK/CLI、API 迁移及双语文档，保持未发布候选限制。

- [Gateway 双语文档](tasks/gateway-bilingual-docs/validation.md)：16 对页面与共享验证，CLI/SDK 明确 Runtime 前置依赖；start/restart/run 失败给出安装启动指引。全量 561 通过/1 跳过、示例 2 项、双轴独立审查通过；未发布或操作用户服务。

- [agentEnv 与可定位中断](tasks/agent-env-invocation/validation.md)：96 分规划后实施破坏性四参数 API、独立执行信封、Gateway 材料编译和 interrupt；双仓回归、包外 npm 消费及独立复审通过。真实 Provider/原生跨平台服务未验，2.0 候选未发布。

## 2026-11-07

- [Issue 328 独立 Gateway](journal/shared/2026-11-07-328-standalone-gateway.md)：继承原 octo-spec，新 worktree、95 分规划后实施 npm SDK/CLI。公开 client 接入、注册关闭隔离、543 项离线及实际安装/包外类型/互操作通过；真实 IM 与平台原生服务未验。未提交、推送或发布。
