---
type: Rule
title: 渠道业务与迁移保留合同
description: 保留原 Gateway 的准入、会话、上下文、凭据、投递及取消边界。
tags: [channel, session, context, delivery]
id: gateway-channel-behavior
tier: repo
priority: 90
load_bearing: true
inject_when:
  paths: ["packages/gateway/**", "test/im-*", "test/gateway-*"]
  touches: [channel, session, context, delivery]
source: self
supersedes: []
---

# 迁移保留合同

源自 Runtime Issue 328 之前的渠道实现；拆仓改变装配，不授权改变业务语义。既有离线场景迁入本仓，真实 IM/Provider 结果按版本单独记录。

## 会话与准入

Bot/API/空间和渠道地址共同限定 binding，展示名称不能用作身份或权限。群/话题须通过原授权及 mention 规则，广播不能执行 reset/new/stop；DM 保留原行为。每 Bot 最多 64 个工作槽，每逻辑 session 另有 4 条排队额度，不能把两者合为消息总数。调度对象在队列与活动执行清空后释放，不设置累计会话数门槛；投递收尾仍属于该工作。

reset/new 清除逻辑 session、Provider binding、规则确认和历史位置并增加 generation，下一条普通输入延迟分配。reset 不调用模型、不取消原执行、不删除产物或改变固定 workdir；旧代次的迟到结果不能更新新 binding 或投递为新会话结果。stop 使用原 invocation 的取消入口，ACK 不代表真实终态。

默认 MemoryImSessionStore 有界：binding 1024/4 MiB/24 小时，occurrence 4096/16 MiB/120 秒，reset 去重 4096/1 MiB/120 秒，过期/淘汰/进程退出不承诺恢复。宿主 createSessionStore 同步提供自己的句柄，持久性、保护、原子更新和数据库生命周期由宿主负责；Gateway 仅关闭该注册获得的句柄，不建立 SQLite 适配或聊天账本。

## 逐轮材料与工具

extra.im 命名空间归本渠道，宿主不能覆盖；人格与其他业务材料由宿主通过 loadContexts 每轮读取后显式提供。函数在调用进程执行，实际 Promise 未结束前占用容量，超时或取消不能提前释放。材料内容、顺序与更新由发起方决定，不提升普通 Context 的控制权限。

冷启动、reset 后首轮和续聊缺口按原规则有界读取历史，最多 20 条、完整序列化 messages 数组 8000 Unicode 码点。规则与历史在模型前准备；重试使用冻结快照，不重新采集。主历史与 fresh fallback 补充共用总预算，不自动建立完整 transcript。

Context 中资源地址由 Agent 按需取材；Gateway 不把所有资源预读为正文。octo-cli 是独立业务工具，安装与配置归宿主，凭据经独立执行环境传递，不进入模型文本。显式 artifact 交付遵守本轮冻结的路径、MIME、数量、大小、权限及取消预算，不自动上传任意输出。

## 凭据、投递和清理

宿主管理配置与凭据的获取、更新和撤销，Gateway 只消费显式提供的值，不扫描文件或另建 token 刷新。REST 使用 Manager 当前有效凭据，WS 重连不得阻止已有授权的 REST；目标身份切换和取消仍隔离。

保持原 ACK 重试、交互关联、卡片回执及结果未知语义；不因投递失败重新执行 Provider。终态不等于消息已投递，取消 ACK 不等于模型已退出。展示投影有界，普通明细仅最近五条和 180 码点预览；清理后释放，不保存原始工具输出。投递回执缓存最多 512 条，不是跨重启恰好一次保证。

ChannelRegistration.close 停接纳，全部阶段共用四秒截止；取消、消费尾流、业务投递、上下文回调和会话句柄分别确认。任何失败明确拒绝，重复关闭复用同一结果；不能停止共享 Kernel 或兄弟注册。SDK 不安装进程 signal/exit 处理器，这些属于 apps/cli 或调用宿主。
