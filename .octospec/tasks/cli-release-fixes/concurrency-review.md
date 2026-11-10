---
type: Review
title: PR 33 原生服务并发专项
description: 区分内部后端的宿主串行化前提与当前 CLI 已有的跨进程守卫。
tags: [review, lifecycle, concurrency]
---

# 结论与可达性

审查基线为 main `beb8049` 与 PR 33 `25c6462`。直接并发调用内部 SystemdUserBackend 的 install/uninstall 可以使原生 enable 状态与定义文件不一致；这是已有底层多步操作的限制，不是本次新增的 CLI 并发漏洞。

`apps/cli/src/main.ts` 的服务变更分支在 `withConfigLock(home, ...)` 内执行 install/start/restart/stop/uninstall、失败清理、就绪检查和最终快照。`apps/cli/src/config.ts` 使用 `acquireProcessLock(home/config.lock)` 提供跨进程排他；竞争命令在变更开始前报 `SETUP_IN_PROGRESS`。同一逻辑在 main 基线已经存在。

`packages/cross-service` 是内部 vendored 包，`private: true`；根包公开 exports 只提供 Gateway SDK，没有公开服务后端入口。因此“当前 CLI/SDK 可直接触发跨进程服务变更交错”的 P1 归因缺少可达路径。不能仅凭底层方法没有内存锁认定该回归成立。

# 复现和维护边界

显式本地脚本 `scripts/verify-service-serialization.mjs` 使用两个后端实例、临时目录和假 systemctl 执行器：让 uninstall 停在 disable 后，另一个 install 完成 enable，再继续删除定义。两个调用均成功，假原生状态仍 enabled，定义文件已不存在。该复现不触碰真实服务。

脚本另启动独立 Node 子进程：父进程持有真实 `withConfigLock` 时，子进程回调不能进入，报告 `SETUP_IN_PROGRESS`；释放后同一子进程命令可以进入。这证明锁跨进程有效，不只是同实例排队。

内部双语 README 明确宿主单写者合同。未来若提供新宿主或直接暴露后端，锁必须按原生服务身份协调不同实例和进程，覆盖整个操作及检查/清理；仅添加进程内队列不能修复跨进程竞争。只读 inspect 不承诺事务快照。

# 验证范围

2026-11-10 使用工作区已有构建产物显式运行 `node --test scripts/verify-service-serialization.mjs`：2 项通过，0 项失败。本专项没有修改执行源码；完整构建及跨专项验证由主审统一执行。不新增或扩大 workflow、job、矩阵、默认测试或 CI Gate。没有执行原生 Linux/macOS/Windows 服务操作；假执行器复现不代表各平台原生行为均已验证。
