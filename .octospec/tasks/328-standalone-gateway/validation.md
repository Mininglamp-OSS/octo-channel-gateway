---
type: Task
title: Issue 328 独立 Gateway 实施与验证
description: npm SDK、独立 CLI、迁移回归及实际包外互操作的本地证据。
tags: [architecture, testing, installation, channel]
timestamp: 2026-11-07T00:00:00Z
---

# 实施结果

新 worktree 分支 feat/328-standalone-gateway，基线 16d7421，未提交。用户授权后先创建 worktree、继承 Mininglamp-OSS/octo-spec@1.2.0（d456507bbd37cd4e3ac58671d07b89a61af35579）、补齐规划和 95/100 可执行性评估，再实施。

根包 @mininglamp-oss/octo-channel-gateway 同时导出 SDK 和 octo-channel-gateway 二进制。packages/gateway 管渠道，apps/cli 管配置、日志及用户服务；生产代码只使用公开 octo-runtime-client 和 /protocol，无 Runtime checkout、私有框架或 Extra ABI。

ChannelRegistry.register(endpoint, definition) 返回状态和幂等异步 close。每个注册拥有独立 client 和业务资源，在共享四秒期限内停接纳、取消并排空所属执行/业务尾流；错误明确保留，不停止共享 Kernel 或兄弟注册。定义和函数由宿主选择，SDK 不要求通用 JSON/schema。

CLI 提供 doctor/install/uninstall/start/stop/restart/status/run/logs 与 configure/extraset/extraget；兼容 channel-gateway 组件层级及原配置命令目标参数。独立 Home、配置保护/锁/冲突检测、状态 socket、日志及原 launchd/systemd/Windows Task 后端均归本包。install 保存 endpoint，默认自启；start 自动补齐本服务安装并等待就绪。前台最终退出沿旧 CLI 的有界策略，仅存在于可执行入口，SDK 不退出进程。

执行前须存在可用 Kernel；注册不会创建或启动 Kernel。旧 module 声明只在 CLI 配置兼容入口丢弃，不恢复插件机制。WebUI、WeCom 不迁入本仓。协议 native 模式与 extra.im 材料语义保留。

# 验证

本机 macOS，Node 26.13.0，当前 dirty 工作树。

| 检查 | 结果 |
| --- | --- |
| build / typecheck | 通过，严格 TypeScript 与声明输出 |
| pnpm run test | 544 项，543 通过，1 项既有 GC opt-in 跳过，0 失败 |
| 注册/关闭专项 | 配置快照、abort、重复关闭、清理失败、兄弟隔离、Kernel 存活通过 |
| CLI 专项 | 安装/默认自启/endpoint 保存、start/restart 等待状态、停止/卸载、旧配置命令、损坏配置日志、前台取消与锁回收通过 |
| 迁移渠道回归 | 准入、会话/上下文、重试/ACK、交互、投递/关闭及真实 Kernel loopback 通过 |
| 实际 npm pack | 本地 0.0.0 归档生成，包含 SDK 声明及 CLI bin |
| scripts/verify-package.mjs GATEWAY.tgz RUNTIME.tgz | 独占临时 npm 安装、实际 bin、配置/日志、包外严格类型、公开 SDK、standalone client 与本次 Runtime 归档执行互操作、关闭后 Kernel 存活通过 |
| 冻结 lockfile | 真实 pnpm 检查通过 |
| 人工验证脚本 | 相对模块依赖与语法检查通过，凭据场景未执行 |
| octospec lint | 通过；含架构及渠道业务规则、规划、验收与 journal |

测试依赖已发布完整 Runtime 做互操作和历史回归；个别测试/人工脚本从该安装包定位内部验证入口，生产依赖与 SDK 不使用这些入口。回归中的错误对象使用同一公开 client 来源，避免不同发行包的 instanceof 身份混淆。

# 自检与未验范围

已按架构、所有权、错误回滚、配置写入和 npm 闭包自检，迁移发现的问题已修复；自检不是独立 reviewer 的批准。真实 IM/Provider、Windows/Linux 原生管理器、真实 macOS 用户服务安装及桌面 renderer 未运行，不以 fake/loopback 代替。用户系统服务、Home 和原 checkout 未改变。尚未提交、推送、创建 PR、合并或发布 npm。
