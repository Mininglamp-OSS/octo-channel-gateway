---
type: Task
title: Runtime 连接参数与跨平台服务包
description: 移除业务配置中的 Runtime Home，只由启动命令参数决定连接，复用 Runtime 的 cross-service 源码。
tags: [cli, architecture, lifecycle, docs]
---

# 用户确认与目标

2026-11-09 用户明确 Runtime Home 只用于 attachKernel，严格跟随命令行；并要求直接拷贝 Runtime 的 cross-service 包。此要求替代 runtime-home 历史任务中的配置优先级约定。沿用当前工作树，不提交或扩大 CI。

# 方案与验收

- --runtime-home 仅属于 start/run，默认用户目录下 .octo-runtime；拒绝空值、NUL 和换行。无配置或环境变量覆盖，不新增兼容入口。
- 删除 runtime_home 的读写；extraset 遇到此字段明确提示使用启动参数，不静默保存无效连接配置。已有配置不会决定连接地址，也不阻止 stop/uninstall 等管理操作。
- start 校验 Runtime 就绪，将规范化绝对路径交给 cross-service，安装/更新原生服务定义后启动；无参数 start 明确使用默认路径。install 仅安装默认 Runtime 路径的定义，restart 只操作已安装定义，实际 run 检查自己的连接。
- doctor 查询正在运行的 Gateway 报告的 endpoint，不猜测默认 Runtime；服务停止时不探测任意 Runtime。服务管理命令不声称具有完整期望启动参数，状态只比较可确认的身份/启用状态。
- 拷贝 Runtime packages/octo-runtime-cross-service（本地 HEAD 4276f6d339461daa88c3215b8024d548eb313cb1）到 packages/cross-service，作为源码内置模块；保留 Gateway 既有 Windows 归属保护。不引入对私有包的运行依赖。
- 同步中英文文档、配置示例、生命周期测试；默认 CLI 使用 heredoc，不使用文件重定向示例。
- 验证参数作用域、真实 Kernel 连接不受配置影响、真实服务渲染参数、start 更新已安装定义、restart 保留定义、doctor 实际 endpoint、安装包；之后本地 build 和全局安装供手动验收。

# 规则与评分

已阅读 architecture、channel-behavior、documentation、review 及规则索引；无 _global 目录。可执行性 97/100：目标20、边界20、服务参数持久化19、错误与回归19、验证19。分数不是验证结果。不操作真实用户服务，不进行 Windows/Linux 原生服务实机验收。
