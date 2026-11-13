---
type: Task
title: Gateway 本地引用降级与统一 OV 错误约定
description: 为附件投递建立明确白名单和安全展示，使用共享错误码区分执行结果与投递结果。
tags: [channel, delivery, lifecycle, architecture, docs]
timestamp: 2026-11-13T11:04:15+08:00
slug: ort-94-delivery-ov-errors
upstream: ORT-94 / octo-channel-gateway GitLab issue 17
source: self
---

# Gateway 本地引用降级与统一 OV 错误约定

## 先看变化

这是一个附件处理 bug 修复，同时新增 Gateway 共享 OV 错误约定。

| 场景 | 变化前 | 变化后 |
| --- | --- | --- |
| skills 安装成功，回复中链接到 skills 目录 | 尝试上传目录，追加英文附件失败提示，容易误以为安装失败 | 显示 `***skills***`，不上传、不追加失败提示，安装结果仍为成功 |
| 回复链接到本地 voice.mp3 | 尝试上传音频 | 显示 `***voice.mp3***`，静默跳过 |
| 回复链接到本地 notes.md | 上传后替换为可访问链接，并发送现有文件卡 | 保留成功交付方式 |
| notes.md 上传失败 | 提示包含内部原因，原本地链接可能仍在正文 | 引用显示 `***notes.md***`，另显示 `部分附件未能发送（OV_DELIVERY_UPLOAD_FAILED）。` |
| 上传成功但文件卡发送结果未知 | 追加长英文说明及内部状态 | 保留可访问链接，只显示 `附件卡片发送未确认（OV_DELIVERY_CARD_UNCONFIRMED）。` |

用户已通过“开始实现”确认 D1-D5。实现期间补充要求支持 Office、ZIP、XML、JSON 等文本类型；本稿按该明确反馈扩充 D1，其余已确认合同保持。规格描述目标行为，不代表已通过实现验收。

## Goal

- 在 Gateway 的 channel 模式 final 后处理中，用确定的类型规则决定附件交付，不依赖模型推断用户意图。
- 对目录和非白名单文件移除不可访问的本地链接，静默显示文件名或目录名。
- 对支持文件的真实故障输出稳定 OV 码和独立维护的简短文案；底层诊断仅进入脱敏日志。
- 保留 Agent 终态、执行次数、final effect 缓存、投递确认状态与既有安全边界。

## Background

- 任务：[ORT-94 对应 GitLab issue 17](https://codex.mlamp.cn/dmwork/octo-component/octo-channel-gateway/-/issues/17)。Loop 分诊结果评论：`68e8f328-f859-4ac5-9550-82afd9c9cf7b`。
- 基线：`origin/main@6445fbc2948c8118de41098b315ebfd36ff75632`，2026-11-13 本次 fetch 后与 worktree HEAD 相同，无需 rebase。
- Worktree：`/Users/lvsijia/codex.mlamp.cn/dmwork/octo-component/octo-channel-gateway-ort-94`；分支：`ort-94-delivery-ov-errors`。
- `delivery/artifacts.ts` 已采用 `mdast-util-from-markdown` 和 parser token 区间编辑，支持行内与引用式链接。目前对所有本地引用尝试读取，使用散落的错误字符串，并直接拼接最终提示。
- `transport/channel.ts` 已缓存同一 final effect 的准备结果；附件文件卡和正文分别确认，文件卡失败还有独立长英文提示。
- `ImSendError` 保存 `failed/unknown`；`ImConnectionError` 保存重试事实；`OctoApiError` 保存 HTTP 状态与限流信息。它们不能被一个面向用户的泛化异常取代。
- 生成失败展示使用公开 Runtime protocol 的 `failureMessage`，其执行错误归 Runtime 所有。本次不改 Runtime 协议或码值。
- `support/runtime-log.ts` 过滤日志字段。新增投递诊断必须显式接通允许字段，不能假设传入原始 Error 就会持久化。

## Load-bearing list

- `delivery`：本地文件权限、根目录、MIME、数量/字节预算、读取竞态、超时、去重、缓存和文件卡确认。
- `channel`：final Markdown 展示、mention 偏移、可访问 URL 与输出覆盖事实。
- `lifecycle`：owner 取消、身份撤销、旧代次隔离、关闭流程和 Agent 终态。
- `architecture`：共享错误分类归 Gateway；只使用公开 Runtime client；不修改跨仓协议。
- `docs`：默认白名单、错误码和模式语义须同步更新中英文文档。
- 已读规则：`gateway-architecture`、`gateway-channel-behavior`、`gateway-review`、`gateway-documentation`。本 checkout 未携带 `.octospec/_global/`；遵循 manifest 固定的 `octo-spec@1.2.0` 与现有仓库规则，不在本次更新规范依赖。

## 已确认约束

来自任务正文与用户工作流，以下事项不等待重新设计：目录和非白名单静默跳过；Markdown/图片/txt 及用户补充的 Office、ZIP、常见文本类型为支持类别；本地不可访问链接降级为粗斜体名称；真实失败使用统一 OV 码；用户文案与码分离；不泄露底层异常；不改变执行终态、不重新生成或执行；不扩大 CI。当前已获实现授权。

## 设计提案 A：类型与路径规则

### 固定白名单

扩展名比较忽略大小写，按最后一个扩展名判断；无扩展名、双扩展名的最后一段不匹配时均跳过。初始白名单不可被宿主 MIME 配置扩大。

| 类别 | 扩展名 | 上传 MIME |
| --- | --- | --- |
| Markdown | `.md`、`.markdown` | `text/markdown` |
| 纯文本 | `.txt` | `text/plain` |
| 文本与配置 | `.log`、`.rst`、`.adoc`、`.ini`、`.conf`、`.properties` | `text/plain` |
| JSON | `.json` | `application/json` |
| JSON Lines | `.jsonl`、`.ndjson` | `application/x-ndjson` |
| XML | `.xml` | `application/xml` |
| 分隔文本 | `.csv`、`.tsv` | 分别为 `text/csv`、`text/tab-separated-values` |
| YAML | `.yaml`、`.yml` | `text/yaml` |
| TOML | `.toml` | `application/toml` |
| HTML | `.html`、`.htm` | `text/html` |
| CSS | `.css` | `text/css` |
| SQL | `.sql` | `application/sql` |
| Word | `.doc`、`.docx` | 分别为 `application/msword`、`application/vnd.openxmlformats-officedocument.wordprocessingml.document` |
| PowerPoint | `.ppt`、`.pptx` | 分别为 `application/vnd.ms-powerpoint`、`application/vnd.openxmlformats-officedocument.presentationml.presentation` |
| Excel | `.xls`、`.xlsx` | 分别为 `application/vnd.ms-excel`、`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` |
| RTF | `.rtf` | `application/rtf` |
| ZIP | `.zip` | `application/zip` |
| JPEG | `.jpg`、`.jpeg` | `image/jpeg` |
| PNG | `.png` | `image/png` |
| GIF | `.gif` | `image/gif` |
| WebP | `.webp` | `image/webp` |
| SVG | `.svg` | `image/svg+xml` |
| BMP | `.bmp` | `image/bmp` |
| ICO | `.ico` | `image/x-icon` |
| TIFF | `.tif`、`.tiff` | `image/tiff` |

图片范围沿用当前 `inferContentType` 已识别的图片格式。此规则只决定可上传附件类型，不保证所有格式都能在渠道内预览；SVG、HTML、Office 和 ZIP 按既有附件流程交付，不执行、内联、解压或递归扫描其内容。AVIF、HEIC、PDF、宏专用 Office 扩展名、ZIP 之外的压缩格式、音视频和未知类型不在本次白名单内。文本支持通过本表明确扩展名，不靠 MIME 前缀、内容猜测或未知类型兜底上传。

### 判定顺序

1. 只处理现有 AST 认为可交付的显式链接/图片引用。远程 URL、锚点、普通文本、代码、HTML 示例、引用块及未使用定义沿用当前保护规则。
2. 使用解析器解码的目标识别本地引用，支持绝对/相对路径、`file:` URL、盘符及 UNC；保持现有远程协议判定。用于类型判断的路径去掉查询和片段，按路径语义处理百分号编码，不重复解码。`~` 不展开，不使用文件名搜索猜测目标。
3. 可识别的非白名单引用直接降级，不读取文件内容、不上传、不检查附件根目录、不占额度。即使该文件不存在，也不报附件错误。可识别 basename 的其他操作系统非白名单路径同样跳过。
4. 对白名单候选进行路径解析、realpath 和普通文件检查。能确认是目录或其他非普通文件时静默跳过，包括名为 `notes.md` 的目录、符号链接指向的目录及 FIFO；不得尝试打开 FIFO 或遍历目录。元数据读取失败、悬空软链接或本机无法解析的白名单路径属于真实失败。
5. 保留软链接支持，但引用名与 realpath 目标必须均在白名单内且映射 MIME 一致；任一不匹配时静默跳过。例：`alias.txt -> voice.mp3` 不上传，`.jpeg -> .jpg` 可上传。目录跳过优先于根目录授权判断；根目录限制仍对实际可投递文件生效。
6. 对可投递普通文件执行既有 allowed roots、MIME、数量、单文件与总字节预算；`allowed_mime_types` 仅收窄白名单，空数组表示全部拒绝。白名单文件被宿主策略拒绝属于 OV 策略错误。
7. 延续描述符读取与竞态检查；通过后上传，同一 resolved 文件共用准备结果和预算。上传失败不绕过已有缓存再次上传；跳过项不消耗文件数量/字节预算，不影响其他候选。

现有默认预算保持：单文件 20 MiB、合计 50 MiB、16 个唯一文件、一次准备 30 秒。准备超时计时沿用现有起点；达到 deadline 后不再启动支持文件上传，但仍完成可静默跳过引用的纯文本降级。按原有预算语义处理已尝试失败的支持文件，不顺便改成成功数量计费。

格式非法而无法可靠提取扩展名的明确本地目标，降级显示并记为 `OV_DELIVERY_PATH_INVALID`；普通远程目标不得因无法解析本地路径而被改写。后处理不得读取未显式引用的文件。

## 设计提案 B：Markdown 展示合同

- 跳过项和读取/上传失败项都将整条链接或图片引用替换为 `***名称***`，名称取引用路径 basename，目录忽略尾部分隔符。不能用原 label 替代文件名；不能显示父目录或绝对路径。名称为空时显示 `***文件***`。
- basename 同时考虑 POSIX、Windows、file URL、百分号编码；只做一次路径解码。路径或文件名中的 Markdown 标点必须转义，CR/LF、控制字符替换为空格，去掉展示名首尾空白，展示名最多 120 个 Unicode 码点，避免结构注入。截断以完整码点为单位，末尾不留悬空反斜杠。
- 行内链接、尖括号目标、标题、引用式/折叠式/快捷引用均按 AST 节点处理。使用位置替换整个链接；被降级的活动引用不能残留本地目标定义。仅由受保护示例使用的定义按现有示例保护规则保留。
- 同一定义被活动引用和受保护示例共用时，仅改活动引用；活动引用全部变为独立粗斜体名称，示例和必需的共享定义保持原样。无其他使用者的本地定义随活动引用降级移除，保留相邻正文。
- 嵌套链接/图片按无重叠区间编辑。外层链接被降级时，以外层 basename 替换整个节点，内部引用不另行上传；外层远程链接包含本地图片时，只改内部图片。受保护区域保持原文。
- 对成功附件延续现有 URL 转义和文件卡行为；远程链接与周边 Markdown 保持原字节。最终 mention 偏移在全部替换和失败摘要完成后计算。
- `tools` 模式维持当前合同：不执行该后处理、不上传、不改写正文。此规格的自动降级仅覆盖 `channel` 模式，文档明确模式边界。

## 设计提案 C：Gateway 共享 OV 错误约定

### 命名、分类、结构

- 使用 `OV_<DOMAIN>_<REASON>`，大写 ASCII 与下划线；例：`OV_DELIVERY_READ_FAILED`。不使用动态文件名、HTTP 数字、平台文案或原生异常消息构造码值。
- `DOMAIN` 为 Gateway 责任域，初始约定 `CONFIG`、`CONNECTION`、`TRANSPORT`、`EXECUTION`、`DELIVERY`。本次只登记有实际消费路径的 DELIVERY 码，其他责任域预留命名，后续登记必须进入同一共享注册表。
- 分类使用固定集合 `validation`、`permission`、`io`、`network`、`timeout`、`limit`、`protocol`、`unknown`。类别不代替发送确认状态，也不直接决定重试。
- 共享注册表及类型放在 SDK 的 `errors/` 层，不放在 `delivery/` 私有常量中。错误结构包含 `code`、`category`、`stage`、`diagnosticId`，可选内部 `cause`、`nativeCode` 和 `deliveryState: failed | unknown`。注册表固定每个 code 的 category；stage 使用 `reference`、`read`、`upload`、`card` 等有限值。
- 用户展示函数只接受受控 code，查询独立文案表。诊断对象不直接序列化为用户消息；未知异常用故障发生阶段的兜底码。未知外部字符串不得成为新 OV 码。
- code 一旦发布不得改义或复用；新增分类/码必须更新共享表、双语说明和映射回归。用户文案可以独立修改，测试分别断言 code、结构和文案，不靠解析文案控制逻辑。

### 本次登记的码

| code | category | 触发条件 |
| --- | --- | --- |
| `OV_DELIVERY_PATH_INVALID` | validation | 白名单或类型无法判定的明确本地目标非法、缺少相对路径基准、当前系统不能解析目标 |
| `OV_DELIVERY_READ_FAILED` | io | 文件/元数据不可读取、不存在、读取竞态、文件变化或关闭读取句柄失败 |
| `OV_DELIVERY_POLICY_DENIED` | permission | 实际文件超出 allowed roots 或 MIME 不被宿主允许 |
| `OV_DELIVERY_FILE_COUNT_LIMIT` | limit | 超过文件数量上限 |
| `OV_DELIVERY_FILE_SIZE_LIMIT` | limit | 超过单文件字节上限 |
| `OV_DELIVERY_TOTAL_SIZE_LIMIT` | limit | 超过总字节上限 |
| `OV_DELIVERY_TIMEOUT` | timeout | 附件准备/上传自身截止触发，且 owner 未取消 |
| `OV_DELIVERY_UPLOAD_FAILED` | network | 上传 API、签名获取、PUT、完成确认失败，且不符合已识别超时/超限 |
| `OV_DELIVERY_CARD_FAILED` | network | 文件已上传但卡片明确未送达 |
| `OV_DELIVERY_CARD_UNCONFIRMED` | unknown | 文件已上传但卡片确认结果未知 |

已知上传 HTTP 413 映射单文件超限；API 明确 timeout 或上传 TimeoutError 映射超时；其他 HTTP/网络拒绝在 upload 阶段映射上传失败。卡片投递始终按现有 receipt 的 `failed/unknown` 映射，不把网络异常猜成明确未发送。上传成功后即使文件卡失败，也保留可访问 URL，不再上传。

### 兼容与接入边界

本次共享注册表、结构、格式化器必须同时供附件准备与文件卡失败路径消费。OV 是 Gateway 的统一用户错误约定；现有 `ImSendError`、`ImConnectionError`、`OctoApiError` 继续保留原有内部 code、state、retryable、retryAfterMs 和 status。仅在此次 delivery 展示边界映射到 OV，不能让 OV 展示反向影响连接恢复或重试。

既有非 delivery 的 IM 错误输出与 Runtime 执行故障码暂不批量迁移，禁止更名跨仓 Runtime 码值或重写连接控制流。后续 Gateway 新增用户错误须复用共享约定；全量旧码迁移属于另行需求。这一迁移边界须在规格审查中明确认可。

### 用户提示与诊断

- 跳过项不生成 failure、不设 `incomplete`、不追加提示。
- 支持文件失败时保留其他成功附件；同一回复按 OV 码去重，按首次出现顺序合并为一个简短摘要。准备失败文案为 `部分附件未能发送（<codes>）。`；卡片明确失败为 `附件卡片未能发送（<codes>）。`；结果未知为 `附件卡片发送未确认（<codes>）。` 同类合并，codes 最多为本表有限集合。
- 用户提示不列本地路径、异常消息、HTTP 响应正文、签名 URL、堆栈、原生 reason 或 generation was not rerun。正文自身原有普通文本不做全局路径脱敏；本规格移除的是活动本地链接及新增诊断泄漏。
- 每项真实失败生成现有格式 `diag_<32位十六进制>` 的诊断编号，写入普通日志事件 `delivery.failure`，包含 OV code、stage、nativeCode（仅允许如 `ENOENT` 的受控短码）、invocation/effect 关联及已知发送状态。HTTP status 可作为受控数字字段；自由文本 cause/响应体不得直接写出。
- 原始 cause 只在内部诊断对象中保留；持久化日志记录脱敏结构，不记录本地绝对路径、token、附件内容或签名地址。更新日志白名单并验证实际落盘字段，禁止写入组件状态镜像。
- 沿用现有可选 RuntimeLog：未配置日志时不擅自创建文件或写 console。日志回调抛错或异步拒绝必须被隔离，不能改变 final 内容或执行结果。

## 执行与投递隔离

- 只对既有可交付的成功 final 做附件准备；不得因后处理失败修改 Agent 的成功终态、重新 invoke、重放命令或重新安装 skills。
- 同一 final effect 的准备结果缓存一次；消息投递重试复用结果。文件卡最多四次尝试（首发加三次重试）与既有发送确认策略保持不变。本次不增加附件自动重试策略。
- owner 取消、身份撤销、旧代次 obsolete 与关闭信号仍走现有取消/清理路径，不转换为附件 OV 提示，不复活投递。owner 取消与附件超时同时出现时优先执行 owner 取消。
- 真实准备失败设 `incomplete`，文件卡失败保持 output coverage 未完成事实；静默跳过是按规则完成处理，不标记为投递故障。任何投递事实都不反写生成终态。

## 预计改动位置

- `packages/octo-channel-gateway-sdk/src/delivery/artifacts.ts`：候选分类、名称降级、结构化失败与安全 Markdown 编辑。
- `delivery/artifact-policy.ts`：固定白名单与实际模式的上下文说明，不能靠提示词执行白名单。
- SDK `errors/`：共享 OV 定义、分类、错误结构与独立用户文案；路径最终以实现中最小结构为准。
- `transport/channel.ts`：文件卡错误映射、统一摘要与日志依赖传递。
- `support/runtime-log.ts` 与必要端口：投递诊断字段白名单及隔离；不新增日志系统。
- `test/im-artifact-delivery.test.js` 及已有相关日志/终态回归：调整旧的无限制类型预期，覆盖新行为。
- `docs/en/guides/lifecycle-and-delivery.md`、`docs/zh-CN/guides/lifecycle-and-delivery.md`：白名单、模式、错误码与交付/生成隔离；同路径补充错误表或链接。

## Out of scope

- 修改 `octo-cli skills --install`、Runtime、Provider 或模型指令来猜测附件意图。
- 新增配置开关、宿主可扩大的类型列表、内容嗅探/转码/解压/病毒扫描、格式预览能力或附件存储服务。
- 全量替换历史 IM 错误码、修改 Runtime 执行错误合同、改变 SDK 公开注册 API。
- 新增 workflow、job、矩阵、触发条件、必需状态、CI Gate 依赖；通过测试脚本或默认开关增加专项 CI。
- 未经另外授权的提交、推送、PR、合并、发布或全局安装。

## Acceptance

以下矩阵均须有本地可复现断言，不用真实外部上传替代受控回归。

| ID | 输入/故障 | 通过依据 |
| --- | --- | --- |
| A1 | skills 目录、尾随斜杠目录、名为 x.md 的目录、目录软链接、FIFO | 无 upload，无 failure/incomplete，整条活动引用变为安全粗斜体 basename |
| A2 | mp3、PDF、非 ZIP 压缩包、未知扩展名、无扩展名；包含不存在路径 | 静默降级；不读内容、不上传、不占数量/字节额度 |
| A3 | 表中所有支持扩展名，含大写、空文本文件 | 正常上传，MIME 与表一致；活动链接替换可访问 URL，链接/图片文件卡行为沿用现有合同 |
| A4 | 相对/绝对/file URL，编码空格/中文/括号，Windows/UNC | 当前平台合法形式可解析；非当前平台的支持路径为安全 OV 失败，非支持路径静默降级；无本地路径进入提示 |
| A5 | 行内、尖括号、标题、引用式/折叠式/快捷引用、重复定义与嵌套图片 | 降级整条活动节点，无重叠编辑，无未使用的活动本地定义残留，不破坏邻接 Markdown |
| A6 | 远程链接、锚点、普通文本、代码/HTML/引用块、共享定义示例 | 沿用保护范围；远程和受保护正文原字节不变，活动引用正确替换 |
| A7 | 不存在/无权限支持文件、读时变化、非法路径、无 workspace | 各阶段映射确定 OV 码，链接降级；最终消息无 cause、父目录、堆栈或旧英文提示 |
| A8 | roots/MIME 拒绝、三种本地超限、上传 413、上传拒绝/超时 | 映射对应 OV；不绕过权限或预算，边界等于上限仍按既有规则允许 |
| A9 | 软链接支持/不支持目标、相同 MIME 别名、跨 root 别名、重复引用 | 白名单不被别名绕过；允许项只上传一次；越界支持项为策略错误 |
| A10 | 一条回复混合成功、静默跳过、读取失败、上传失败 | 成功项正常交付；跳过项零错误且不占预算；错误按码去重，不影响其他支持项 |
| A11 | 上传成功后卡片明确失败/确认未知，正文发送重试 | 分别显示 CARD_FAILED/CARD_UNCONFIRMED；保留成功 URL，缓存准备结果，不重复上传，保持原确认与重试预算 |
| A12 | 附件失败、附件超时、owner 取消、obsolete/身份撤销、关闭 | Agent 成功终态不变；invoke 次数不增加；取消不伪装成普通失败，停止后不再投递 |
| A13 | 日志开启/关闭/回调失败，诊断 cause 含敏感路径/token | 配置日志时实际落盘含 code、stage、诊断关联与安全原生码；正文/状态镜像无诊断 cause；日志失败不影响执行 |
| A14 | tools 模式 | 不上传、不改写、不新增提示，原合同保持 |
| A15 | 变更与 CI 审计 | workflow diff、默认测试选择、脚本与实际检查范围均未扩大；中英文说明一致 |

## 实施与本地验证计划

1. 按本文件注入仓库规则，先实现共享 OV 表与独立格式化器，再接入附件分类和 Markdown 降级，最后接入文件卡和脱敏日志。核心条件写中文注释。
2. 调整现有回归的类型预期，新增上述风险断言。禁止新增默认 test glob、默认测试开关或专项 Gate；专项验证显式本地运行并记录。
3. 构建后定向运行 `node --test test/im-artifact-delivery.test.js` 与实际受影响日志/终态测试。完整检查执行 `pnpm run typecheck`、`pnpm test`、`pnpm run docs:check`、`pnpm run lint:spec`。如实现影响发行结构，再运行现有包外验证；无结构变化不扩展任务范围。
4. 使用 code-review 技能完成 Standards/Spec 审查并修复有证据的问题。审查与验证分别记录，规划评分不能替代测试结果。
5. 在 validation 记录实际命令、结果、代码版本、未提交 diff 和未验范围。相对 `origin/main` 检查 `.github/workflows`、package scripts、测试选择及已有检查列表。

上一规格阶段仅对规格运行 lint、空白检查与人工合同核对；当时没有实现修改。当前实现与回归结果另记于同目录 validation.md，不用规划评分替代实际测试。仍未提交或推送。

规格阶段实际检查（2026-11-13）：`pnpm run lint:spec` 首次因系统 Python 缺少 PyYAML 失败；使用临时依赖环境执行 `uv run --no-project --with PyYAML python .octospec/scripts/lint.py` 通过（54 个 OKF 单元、4 条规则）。没有修改仓库依赖。`git diff --check` 通过；workflow、package scripts 和锁文件相对基线无差异。功能验收尚未执行。

## 需要规格审查确认的决策

| 决策 | 本稿默认提案 | 影响 |
| --- | --- | --- |
| D1 | 接受完整扩展名表；依据实现期间用户补充，加入 Office（含 Excel）、RTF、ZIP、JSON/XML/CSV/YAML/TOML/HTML 等常见文本类型 | 这些类型继续走普通附件流程；PDF 等表外类型静默降级；不执行、内联或解压附件 |
| D2 | 同时按引用名和真实目标白名单/MIME 校验 | 保留正常软链接，阻止通过别名扩大类型 |
| D3 | `OV_<DOMAIN>_<REASON>`，共享注册表；本次先接入 delivery 两条路径 | 原 IM/Runtime 非 delivery 输出不在本次全量迁移，兼容控制事实 |
| D4 | 失败的支持引用也降级；tools 模式维持不处理 | 避免 channel 正文留下失效本地链接，模式边界清晰 |
| D5 | cause 仅内部保留，日志只落脱敏结构 | 可用 code/阶段/诊断编号排查；不持久化原始自由文本异常 |

用户已认可 D1-D5，并明确授权本次扩充 D1；实现继续沿用同一执行记录，不回退流程或重复启动。未获得 Git 提交、推送、PR 或合并权限。

## 可执行性自评

**96/100（规划评估，非测试结果）**：行为与边界 29/30、错误兼容与诊断 24/25、验收覆盖 24/25、实施与恢复 19/20。

剩余 4 分：跨系统路径的本机验证能力占 1 分；共享错误接入与日志字段须由真实 diff 和回归确认占 1 分；文件系统竞态与复杂 Markdown 组合无法穷举占 1 分；真实渠道的格式预览能力不在普通附件交付验收内占 1 分。D1-D5 已获确认，后续白名单补充来自用户明确反馈。以上均有明确行为规则，不留给实现者猜测。

## 实现期间的规格增量

- 反馈来源：用户在 `start-implement` 执行期间补充“Office 类型 .ppt .pptx .doc .docx 以及 zip xml json 等文本类型，可以泛化”。
- 处理结果：D1 扩展为上表的 Office、RTF、ZIP 与常见文本格式；新增类型沿用相同权限、预算、去重和 OV 错误规则。`.html` 与 `.pptx` 等测试由静默跳过改回正常投递；未知类型和音视频仍静默降级。
- 验收变化：A2 移除 Office/HTML/CSV 等新增支持项；A3 覆盖完整扩展名表，并独立断言 Office/ZIP/JSON/XML 等代表格式的 MIME。其他已确认决策保留。
