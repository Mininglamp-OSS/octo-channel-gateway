# 会话管理

[English](../../en/guides/sessions.md) | [文档目录](../README.md)

Gateway 按可信 Bot/API/空间与聊天地址定位会话，展示名称不能充当身份。群和话题还需通过群开关、授权和 mention 准入；广播不能发起 reset/new/stop。allowed_sender_ids 显式空数组拒绝所有发送者，group_ids 的空数组则不增加群范围限制，关闭群入口用 groups_enabled=false。

## 续聊与控制

Provider 返回的 providerSession 保存到当前 binding，下一轮显式传入；它不是聊天历史副本。冷启动、reset 后首轮及续聊缺口由 Gateway 按规则有界读取历史，最多 20 条，序列化 messages 总计 8000 Unicode 码点。重试使用冻结材料，不在同一尝试重新读取上下文。

| 控制         | 行为                                                                                            |
| ------------ | ----------------------------------------------------------------------------------------------- |
| /reset、/new | 清除当前逻辑会话、Provider binding、规则与历史位置，并增加 generation；下一普通输入才分配新会话 |
| /stop        | 定位当前执行的 invocationId 并请求中断；继续等待终态与业务收尾                                  |

reset 不调用模型，不隐式取消旧执行，不删除产物，不改变固定 workdir。旧代次迟到结果不能更新新 binding 或作为新会话结果投递。断流只恢复观察；结果未知不能自动重放。Codex 恢复受明确预算约束，不代表所有 Provider 都支持安全自动重试。

## 存储

默认 MemoryImSessionStore 是进程内有界存储：binding 最多 1024 / 4 MiB / 24 小时；occurrence 最多 4096 / 16 MiB / 120 秒。过期、淘汰、进程退出后不承诺续聊恢复，也不建立完整 transcript。

需要持久化时，由 `createSessionStore(config)` 同步返回 ImSessionStore 句柄。read/save/reset/occurrence/remember 都是同步合同；read 返回独立快照，reset 需原子去重控制 ID 并增加 generation。可选 patchGap/patchRules 按 sessionId/generation 原子更新，不能把 Promise 包装成同步成功。

宿主负责数据库、迁移、租户分区、保留期限和并发一致性。注册关闭会释放工厂返回的句柄，句柄 close 不得关闭其他注册共享的数据库。完整类型见 [会话存储源码](../../../packages/octo-channel-gateway-sdk/src/application/session-store.ts)与 [SDK 参考](../reference/sdk.md)。
