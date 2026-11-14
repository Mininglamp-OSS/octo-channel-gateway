# 生命周期与投递

[English](../../en/guides/lifecycle-and-delivery.md) | [文档目录](../README.md)

注册成功表示绑定已初始化并交由渠道管理。暂态连接失败可保持 retrying，继续既有重连；须查看 status 区分 online 与 retrying。认证预检失败直接拒绝并保留旧绑定；永久启动失败回滚新绑定。gateway.status 是 Manager 的当前 Bot 诊断快照，不是全部任务历史；只读接口不保证每个字段永远不变。

## 关闭

应用结束时 await gateway.close。关闭先停止接纳，然后在共享四秒截止内请求取消所属执行、消费尾流、完成投递与业务清理、关闭上下文回调池和所属会话句柄，最后释放自建渠道资源，保留注入 client。重复 close 返回同一个 Promise；失败会拒绝，不能当作已经完整退出。

构造参数 options.signal 的 abort 会触发整个 Gateway 关闭，但异步清理错误不会从 abort() 同步抛出，因此仍需 await close。SDK 不拥有共享 Kernel 或其他 Gateway 实例；CLI stop/uninstall 同样不能替代 Runtime 的停止命令。

## 嵌入与关闭合同

本节约束 ChannelGateway 实例接口。架构及 Runtime 注入方式见[架构与所有权](../concepts/architecture.md)。

- 保留 `await gateway.register(bot, agent)`：运行中新增或按稳定 Bot 身份覆盖，成功即初始化完成，无需额外 start。覆盖只清理该身份的旧绑定；可能短暂离线，不承诺自动回滚到旧配置。
- 宿主只需 `await gateway.close()` 清理整个 Gateway，不需要获取注册句柄或逐个关闭 Bot。关闭必须停止消息和执行接纳，取消排队注册，协调进行中的初始化/覆盖，并清理晚到资源。关闭后的实例不可再注册；重复 close 复用同一 Promise。
- 成功关闭必须清理 Bot socket、重连与心跳定时器、事件监听、所属执行及观察任务、投递任务、和自建会话存储句柄，不再有后台重连或投递。不能仅清空注册表或断开 client 就宣告成功。
- 单项失败仍继续清理其他资源，最后聚合失败和未完成项。超时不等于释放成功；宿主回调不配合取消时须明确报告未完成。宿主需保存错误并决定退出策略，不能把 close 拒绝解释成“已清理”。
- Gateway 只管理自己的 invocation，不调用借用 client 的全局 stopAdmission/drain/close，不关闭共享 Kernel 或宿主 Engine。宿主先等待 Gateway 清理，再释放自己持有的 Runtime 资源；即使前一步失败，也继续尝试后续资源清理并保留全部错误。

Electron 应在主进程持有 Gateway。在正常 before-quit 中同步 preventDefault，启动一次宿主清理并等待；成功后放行再次 app.quit。Electron 不会自动等待事件监听器返回的 Promise，单纯关闭窗口也不代表应用退出。该退出协调属于宿主，不放进 SDK，也不需要 SDK 的 waitForShutdown。CLI 同样在自己的退出/失败路径等待 close。强杀、崩溃和系统中断不能保证回调执行，须由宿主与 Runtime 恢复机制处理；见 [Electron before-quit](https://www.electronjs.org/docs/latest/api/app#event-before-quit)。

验证须覆盖重复注册与 token 轮换、并发覆盖、初始化/回滚失败、close 与 register 竞争、幂等 close、取消不合作及共享 client 隔离。应检查具体资源和执行身份是否收尾，不能用进程成功退出代替无泄漏验证；专项显式本地执行，不扩大 CI。

## 断网恢复

注册后暂态断连自动重连，不需要再次 register。已上线连接断开后立即尝试，随后最多十次一秒快速重试，再沿用 5/10/15 秒封顶退避；Retry-After 优先。覆盖和 close 会取消旧绑定的重连活动，旧回调不能重建连接。永久认证/权限错误需要宿主处理，例如更新凭据后再次 register。认证预检失败会拒绝本次注册并保留已有绑定。

## 执行与投递

取消 ACK、执行终态、资源清理、消息投递是四件事。run.completed 后仍可能投递失败；投递失败不能重新执行 Provider。结果未知与超时必须保留原调用身份，不因为 UI 没显示结果就自动创建新执行。

每 Bot 最多 64 个工作槽，每逻辑 session 另有 4 条排队额度；投递收尾仍占用该工作。投递回执缓存有界，不承诺跨进程重启的恰好一次交付。

final 正文累计另限 128 条消息、合计 1 MiB UTF-8。任一超限报告 `IM_FINAL_OUTPUT_LIMIT_EXCEEDED`，进入既有中断与结果未知流程；不将残缺正文作为成功 final 投递，也不触发自动产物上传。无效交互表单逐事件诊断并 ACK，使后续有效卡片动作继续处理；传输和 ACK 失败保留原重试行为。

## 模型静默与超时

Runtime 通过 `agent_run.event` 承载 canonical `run.notice`，以 `model_output_idle` 和源端 `params.silenceMs` 报告模型静默。Gateway 在原卡片展示“模型已 N 秒无输出”。延迟收到的 60000 ms 通知仍显示 60 秒；Gateway 不启动静默时钟、不补算静默时长，也不因本地经过五分钟而取消执行。

卡片周期更新依赖 Runtime 服务在 60、120、180 秒等后续分钟节点发出新通知。每条新时长通过正常渲染与去重更新同一张卡片。Runtime main 提交 `67a44ebc` 已增加周期行为；已发布的 Runtime 1.1.14 每段静默只通知一次。client 1.1.14 的 notice payload 已支持两者。获得周期刷新需要部署包含该变更的 Runtime；Gateway 不提供计时回退、补发错过分钟或兼容层。

增长的公开 assistant 输出清除提示，工具/审批阶段和终态按普通流程更新卡片。私有 reasoning、心跳、usage 与未增长的文本快照不冒充新模型输出。默认 `enforce` 下的五分钟模型空闲预算仅由 Runtime 执行；显式预算和 `observe` 退出约定见[执行预算](../reference/configuration.md)。用户 Stop 与所属执行清理仍走原有取消路径，超时文案来自真实上游终态。

## 产物

artifact_delivery.mode 默认 channel：成功 final 中明确的本地文件引用按本轮冻结的路径、MIME、数量、大小和取消预算检查后交付。它不是“把所有模型输出路径都上传”。tools 模式不自动上传，由业务工具提供接收方可访问的链接。

channel 模式按忽略大小写的固定扩展名白名单投递：

| 类别 | 扩展名 |
| --- | --- |
| Markdown、纯文本 | `.md`、`.markdown`、`.txt`、`.log`、`.rst`、`.adoc` |
| 数据与配置 | `.json`、`.jsonl`、`.ndjson`、`.xml`、`.csv`、`.tsv`、`.yaml`、`.yml`、`.toml`、`.ini`、`.conf`、`.properties` |
| Web 与 SQL 文本 | `.html`、`.htm`、`.css`、`.sql` |
| Office 与 RTF | `.doc`、`.docx`、`.ppt`、`.pptx`、`.xls`、`.xlsx`、`.rtf` |
| 压缩附件 | `.zip` |
| 图片 | `.jpg`、`.jpeg`、`.png`、`.gif`、`.webp`、`.svg`、`.bmp`、`.ico`、`.tif`、`.tiff` |

这些类型只承诺普通附件交付，不保证内联预览。Gateway 不执行、内联或解压 Office、HTML、SVG、ZIP 内容。目录（包括名称带支持扩展名的目录）、非普通文件及表外类型（例如 mp3、PDF、未知扩展名）静默跳过；活动本地链接降级为粗斜体文件名，不占附件数量或字节预算。tools 模式维持正文原样。软链接的引用名与真实目标必须均在白名单且 MIME 相同；`allowed_mime_types` 只能收窄固定白名单，空数组拒绝全部文件。

支持文件不可读取、策略拒绝、超限或上传失败时，失败引用同样降级，不保留无法访问的本地链接。其他成功附件照常交付；文件卡失败保留已成功上传的链接。提示只含简短文案与稳定 OV 码，不含本地路径、底层异常或重新执行说明。投递失败不改变 Agent 执行终态，不重跑 Agent 或命令；同一 final effect 的正文重试复用已完成的附件准备。

### OV 错误约定

Gateway 错误采用 `OV_<DOMAIN>_<REASON>`，共享注册表位于 SDK `errors/` 层；错误码、分类和用户文案独立维护。本次接入附件准备与文件卡路径，既有 IM 连接恢复/确认状态和 Runtime 执行错误码保持原合同。后续 Gateway 用户错误复用此约定，已发布码不得改义。

| OV 错误码 | 分类 | 含义 |
| --- | --- | --- |
| `OV_DELIVERY_PATH_INVALID` | validation | 本地路径非法、缺少解析基准或本机不支持该路径形式 |
| `OV_DELIVERY_READ_FAILED` | io | 文件不可读取、不存在或读取期间变化 |
| `OV_DELIVERY_POLICY_DENIED` | permission | 文件不满足宿主根目录或 MIME 策略 |
| `OV_DELIVERY_FILE_COUNT_LIMIT` | limit | 文件数量超限 |
| `OV_DELIVERY_FILE_SIZE_LIMIT` | limit | 单文件字节超限（含上传 HTTP 413） |
| `OV_DELIVERY_TOTAL_SIZE_LIMIT` | limit | 总字节超限 |
| `OV_DELIVERY_TIMEOUT` | timeout | 附件准备或上传超时 |
| `OV_DELIVERY_UPLOAD_FAILED` | network | 上传或上传确认失败 |
| `OV_DELIVERY_CARD_FAILED` | network | 文件卡明确未发送成功 |
| `OV_DELIVERY_CARD_UNCONFIRMED` | unknown | 文件卡发送结果未确认 |

同一回复按错误码合并提示，例如 `部分附件未能发送（OV_DELIVERY_READ_FAILED）。`。已配置日志时，普通日志记录 `delivery.failure`，包含错误码、阶段、`diag_` 诊断编号、脱敏原生码以及 effect 的哈希关联；诊断 cause、附件内容、凭据和本地路径不进入用户消息或组件状态镜像。未配置日志时不创建额外日志文件。owner 取消、身份撤销与关闭仍走原取消流程，不伪装成附件超时。

默认上限为单文件 20 MiB、总计 50 MiB、16 个文件、30 秒；配置可收紧，不能超过上限。allowed_roots 省略表示不增加该项限制，空数组拒绝全部文件；这不改变 Agent 工作区或其他路径检查。模型 Context 无权放宽宿主配置。详见[配置参考](../reference/configuration.md)与 [产物策略](../../../packages/octo-channel-gateway-sdk/src/delivery/artifact-policy.ts)。
