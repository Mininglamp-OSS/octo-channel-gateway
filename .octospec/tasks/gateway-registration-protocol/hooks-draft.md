---
type: Design
title: ChannelGateway 应用层 Hooks 设计
description: 两个应用层 Hook 点位共享统一签名，业务自行决定按轮次加工 inputs 与 agentEnv 的策略。
tags: [architecture, channel, session, lifecycle]
---

# 状态与来源

2026-11-11 收敛后的设计，已落实到当前 worktree；[实施任务](hooks-implementation.md)与[实际验证](validation.md)记录实现和验收。文件名沿用原草案路径以保留链接。

参考 [AgentScope Agent Hooks](https://doc.agentscope.io/tutorial/task_hook.html) 的点位、有序执行及返回值串联机制。AgentScope 使用逐项命名注册；本 SDK 按用户要求通过数组整体注册，不引入逐项增删、名称、类级 Hooks 或继承。

本次确认取代旧草案的 session_init、shouldRefreshContext、HookValue/context/data 包装及 name 设计。仅保留 pre_dispatch 和 pre_invoke；两个点位都使用 async (ctx, inputs, agentEnv)，返回 { inputs, agentEnv }。

# 已确认的合同

- 实例入口为 await gateway.register(bot, agent, hooks)，第三个参数是数组，每项为 { type, hook }，无独立句柄。
- 同一点位按数组中的相对顺序串行执行。上一项返回的 inputs、agentEnv 完整替换当前值，供下一项消费；不隐式合并。
- 同一条 Hook 链共用一个只读 ctx。会话路由与轮次归 Gateway 管理，inputs 与 agentEnv 允许业务加工。
- 只提供轮次事实 ctx.turn.index，从 1 开始；不提供 isFirst、shouldRefreshContext，也不提供专门初始化 Hook 或初始化缓存。
- 何时加载指令、何时 prepend、首次还是每 20 轮刷新，完全由业务 Hook 决定。Gateway 不内置这类刷新策略，也不把业务代码里的周期提升成 SDK 默认值。
- 会话按 (botId, sessionKey) 隔离，DM、群聊、子区独立；reset/new 后新代次轮次重新从 1 开始。
- 未知点位 warning 后忽略；不阻止注册，不执行未知 Hook。
- 不恢复 materials/loadMaterials、命名材料合并或加载资源池。宿主管理 Kernel 和应用退出，Gateway 负责所属执行与资源清理。

# 注册与统一签名

公共 SDK 导出 GatewayInputs、GatewayHook、GatewayHookContext、GatewayHookResult。GatewayInputs 使用公开 InvocationContent 加 canonical 模式，AgentEnv 和 ProviderSession 使用公开 client 协议，不复制私有协议。下面省略 import，仅描述接口结构。

```ts
type GatewayInputs = InvocationContent & { protocol_mode: "canonical" };

type GatewayHookType = "pre_dispatch" | "pre_invoke";

type GatewayHookHandler = (
  ctx: GatewayHookContext,
  inputs: GatewayInputs,
  agentEnv: AgentEnv,
) => Promise<{ inputs: GatewayInputs; agentEnv: AgentEnv }>;

interface GatewayHook {
  type: GatewayHookType;
  hook: GatewayHookHandler;
}

register(bot: GatewayBot, agent: ImAgentConfig,
         hooks?: readonly GatewayHook[]): Promise<void>;
```

省略 hooks 等价于空数组。没有修改时返回 { inputs, agentEnv }，不能返回 void 或局部 patch。输入与对应返回字段类型一致；ctx 不作为返回值。

注册时复制定义数组，避免调用方后续 push/splice 改变当前绑定；业务闭包仍由业务管理。同 Bot 重新注册时整体替换数组，不累加；不需要重名检查。日志定位使用点位和原数组下标。已知点位缺少有效函数属于配置错误；每个未知点位条目在注册时告警并忽略，不序列化函数或业务数据。TypeScript 联合类型提供静态检查，JS 或跨版本输入仍须运行时处理。

# 两个点位的职责

| 点位 | 时机 | Gateway 保证 | 业务决定 |
| --- | --- | --- | --- |
| pre_dispatch | 消息通过认证、准入、去重并出队，开始准备一个新逻辑轮次 | 提供本轮 ctx、消息 inputs 和已编译的基础 agentEnv；同轮重试复用加工结果 | 首轮加载指令、每 20 轮 prepend、根据当前事件附带 XML，或什么都不追加 |
| pre_invoke | 请求准备完成，Gateway 实际调用 client 之前 | 提供本次将发送的完整 inputs、agentEnv 及准确会话路由 | 最终加工、完整输入日志等 |

pre_dispatch 接在渠道输入、执行环境及必要恢复稿编译后，轮次提交前；它的输出随本轮冻结，后续准备不重编译并覆盖业务结果。pre_invoke 链后只做协议、身份边界及预算校验，不再隐式追加内容。不同点位按生命周期顺序触发，不按数组中的全局位置调度。

不增加其他生命周期点位。未来若有真实需求再定义对应时机，未知字符串不会自动扩展 SDK 能力。

# ctx：会话事实的只读快照

```ts
interface GatewayHookContext {
  readonly botId: string;
  readonly sessionKey: string;
  readonly generation: number;
  readonly sessionId: string;
  readonly providerSession: Readonly<ProviderSession> | undefined;
  readonly messageId: string;
  readonly conversation: Readonly<{
    kind: "direct" | "group" | "thread";
    id: string;
  }>;
  readonly turn: Readonly<{ index: number }>;
  readonly signal: AbortSignal;
}
```

同一链内复用 ctx，不随着每个 Hook 重新构建；inputs 和 agentEnv 在循环中逐项替换。下一轮、代次或实际调用路由改变时，由 Gateway 构建新快照；不得使已有 Hook 所持有的 ctx 随外部 session 对象原地变化。运行时也须保护嵌套会话状态，不能仅依赖 TypeScript readonly。

sessionKey 使用现有渠道路由身份的不透明表示，包含平台/空间等隔离信息，不另造第三套 key 算法。同群发送者共享群会话，子区与父群分开；不同 Bot 的同一 DM 独立。执行 sessionId 在两个点位前已分配；providerSession 在尚无原生绑定时为 undefined。在 pre_invoke 两者必须与实际调用参数一致。

Gateway 从既有会话存储读取并更新 sessionId/providerSession 的关联，Hook 不负责读取或维护这份路由映射。宿主需要持久化时，通过会话存储接口接入；不依赖某个业务 Hook 是否安装来保证续聊正确性。

当前轮次已由 application/stable-context.ts、application/im-channel.ts 的执行状态及 onAttempt、application/session-store.ts 的 binding 维护。实施应复用轮次事实，不增加 Hooks 专用计数器；轮次计数与现有刷新策略需要拆开。

准备时使用计划中的下一轮 index，第一次实际调用前提交。准备失败不消耗轮次；重复消息、未准入消息和控制命令不计数；同轮重试不增加 index。reset/new 保留渠道 sessionKey，推进 generation、清空会话绑定和轮次；下一条普通消息分配新 sessionId，以 index 1 开始。旧代次迟到结果不能覆盖新代次。

# 策略归业务，Gateway 不判断刷新周期

只有第一轮追加：业务判断 index === 1。每 20 轮追加：业务判断 index % 20 === 0。第一轮且以后每 20 轮追加：业务使用两个条件的逻辑或。Gateway 不解释这些条件，不缓存一份所谓“已初始化的业务指令”，不自动为后续轮次再加载或补写业务内容。

已删除旧固定周期刷新，旧 stable_context_refresh_interval_turns 配置明确拒绝。渠道必要的首轮/恢复材料仍按原协议处理；业务周期不进入 SDK 内置 Hook。

agent.instruction 字段保留用于 CLI 配置，SDK 不自动前置；CLI pre_dispatch 在 trim 非空且 index===1 时前置 extra.cli/instruction XML。Electron 等宿主自行实现 Hook，不继承这项策略。认证、准入、路由、取消、协议校验等正确性责任仍属于 Gateway；它们不是可选业务刷新策略。

# 业务示例

```ts
await gateway.register(bot, agent, [
  {
    type: "pre_dispatch",
    hook: async (ctx, inputs, agentEnv) => {
      // 20 是业务自己的选择，不是 Gateway 默认配置。
      if (ctx.turn.index === 1 || ctx.turn.index % 20 === 0) {
        const text = await business.readContext(ctx);
        inputs = business.prependText(inputs, text);
      }
      return { inputs, agentEnv };
    },
  },
  {
    type: "pre_invoke",
    hook: async (ctx, inputs, agentEnv) => {
      try {
        await business.debug({
          inputs,
          sessionId: ctx.sessionId,
          providerSession: ctx.providerSession,
          agentEnv,
        });
      } catch {
        // 业务选择：日志故障不影响执行。
      }
      return { inputs, agentEnv };
    },
  },
]);
```

数组中的处理函数使用同一签名。业务用新的 inputs 或 agentEnv 返回加工结果，避免原地修改共享配置。XML 感知信息是独立文本 part，原问题与图片保持独立；AgentEnv 不混入模型文本，私有 items 保留透传。

最终日志 Hook 放在所有 pre_invoke 加工 Hook 之后，否则看不到后续修改。完整日志保留图片 part 与 AgentEnv 的实际结构，不只记录拼接文本，不写入会话状态镜像。日志开关、序列化和错误处理由宿主/业务决定；CLI 已安装由 OCTO_CHANNEL_GATEWAY_DEBUG=1 启用的 pre_invoke 日志 Hook，SDK 不读取该开关。

# 冻结、错误与关闭

pre_dispatch 加工结果随本轮请求冻结，同轮自动或卡片重试不重新采集业务数据，不重复 prepend。准备失败后重新准备仍可能看到同一个 index，业务副作用需可重试；index === 1 不代表任意外部副作用跨失败或重启恰好执行一次。

pre_invoke 面向 Gateway 的实际调用，Runtime 内部尝试不可见。第一次调用可加工请求；冻结重试不能借此悄悄改变已提交内容。冻结重试时每项 Hook 返回值必须与传入的冻结请求一致，否则 IM_HOOK_REPLAY_CHANGED 阻止该次调用。原有结果未知时禁止重放的约束不变。

Provider fresh fallback 不等于逻辑会话重新开始，不能为了重复触发 index === 1 而重置轮次。Gateway 不自行重新加载业务 instruction；恢复所需内容的冻结及传递边界须用现有 client 恢复协议核实，不承诺跨会话自动保存并补发所有业务 prepend 内容。

已知 Hook 拒绝、返回 undefined/错误结构或违反身份边界时，失败当前准备，后续 Hook 和 invoke 不运行。日志 Hook 若要求失败不影响执行，应自己捕获错误并返回原值。未知点位 warning 的日志失败不应使注册失败。

Hook 使用所属任务的 AbortSignal；Gateway 跟踪 Promise，消费迟到拒绝，接受结果前检查代次与关闭状态。close 后不得继续 invoke。沿用共享四秒关闭截止，不建新的加载器资源池。无法强制终止不配合取消的任意业务 Promise，必须报告未完成；业务拥有的外部连接由宿主关闭。Hook 不递归进入同一执行链，也不等待一个正在等待自身退出的 close。

# 已落实的实施决策

原草案的实施前问题已在后续实施任务中收敛：inputs 使用公开 canonical InvocationContent；pre_dispatch 接在渠道请求编译后、轮次提交前；instruction 保留为 CLI 配置，由 CLI Hook 消费；冻结重试 pre_invoke 不允许改变输入；共享关闭期限不增加。详见实施及验证记录。

# 验收范围（结果见实际验证）

- 两点位顺序、多个同点位 Hook 串联、原值返回与完整替换、非法返回值、未知点位告警忽略。
- 同链 ctx 一致且不可修改，下一轮或新代次快照隔离；会话字段与实际 invoke 参数一致。
- 两 Bot、DM/群/子区轮次隔离；准备失败、重复消息、重试不误计数；reset/new 与旧结果隔离。
- 空 Hooks 不产生业务 prepend；分别用首轮和每 20 轮的业务 Hook 验证策略由调用方决定，无 SDK 固定第 30 轮注入。
- XML、原问题、图片保持完整；AgentEnv 私有项保留；日志与实际请求一致，异步日志失败不影响执行。
- 同轮重试复用冻结输入，不重新调用 pre_dispatch；fresh fallback 不重置逻辑轮次、不自动重读业务指令。
- 覆盖替换不累加；close、超时、迟到 rejection、拒绝取消有明确结果，共享 Kernel 不被关闭。
- README、双语文档、公开类型消费者及 CLI 装配同步；可运行共享示例参与既有文档类型检查。

专项验证显式在本地执行并记录结果；不扩大 GitHub workflow、job、矩阵、自动触发、默认专项测试或必需检查。
