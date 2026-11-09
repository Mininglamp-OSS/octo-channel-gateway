---
type: Task
title: Runtime 命令行连接与 cross-service 验证
description: 参数作用域、业务配置隔离、原生定义持久化、复用源码与全局安装的实测结果。
tags: [cli, architecture, lifecycle, docs]
---

# 实施结果

2026-11-09，macOS、Node 24.22.2，基线 9ce35cc，未提交工作树。按用户明确要求移除 runtime_home 配置消费与保存；start/run 才接收 --runtime-home，默认 ~/.octo-runtime。extraset 拒绝连接字段，已有字段不影响 run 的地址。start 将本次参数同步到原生服务定义，restart 不覆盖定义；doctor 仅探测运行中 Gateway 报告的 endpoint。

已从 Runtime revision 4276f6d339461daa88c3215b8024d548eb313cb1 拷贝 cross-service 源码到 packages/cross-service，删除 CLI 内原副本。除 windows-task.ts 保留本仓已验证的归属校验外，其余七个源码文件与来源一致；无私有包或 checkout 运行依赖。原生状态管理缺少期望启动参数时不报告定义内容漂移，保留身份/存在性检查，并明确标记 definition_comparison。

# 实际检查

- build、typecheck、docs:check 通过；文档检查 17 对页面、36 Markdown、182 链接、4 JSON 块、2 个执行测试。
- 完整既有测试命令 588 项：587 通过、0 失败、1 项既有显式 GC 测试跳过。日志 /tmp/gateway-runtime-full-tests.log。
- 最后 CLI 定向测试 16/16 通过，包括真实 Kernel、错误配置不能覆盖 argv、start 更新已安装参数、doctor 实际地址、管理不读取损坏业务配置及三个平台的参数渲染。
- 复制到忽略目录 .tmp 的原包离线测试最初 92 项中 72 通过、7 失败、13 条件跳过；7 项均要求清理归属不明的 Windows 任务，与 Gateway 已有强约束相反。保留产品保护，将这 7 项临时测试预期调整为 MANAGER_UNAVAILABLE 且无任务变更后，79 通过、0 失败、13 跳过。日志 /tmp/gateway-cross-service-tests.log 与 /tmp/gateway-cross-service-adapted-tests.log。专项没有加入 CI。
- 独立本地 Gateway/plist 集成验证通过：真实 Kernel、真实临时 plist 文件、注入 launchctl runner；start 在两个 Runtime 目录间切换，plist argv 跟随；restart 前后文件不变，没有创建 config.json。测试位于 .tmp/cross-service-verification/gateway-plist.test.mjs。
- pack:release、test:package 通过，公开 SDK 与 CLI 在独立消费目录可加载。移除旧 dist/apps/cli/src/service 产物后打包，验证安装包包含 packages/cross-service。
- git diff --check、spec lint 通过；相对 origin/main 的 .github 和 pnpm-lock.yaml diff 为空。没有新增 workflow/job/矩阵/触发条件/门禁或专项 CI。

# 全局安装与手动验收

已 npm install -g 本工作树归档，全局二进制位于当前 NVM Node 24 环境。实际安装后检查：根帮助、install/restart/extraset 不展示 --runtime-home；start/run 展示；install 传入该参数返回安全用法错误；extraset 的连接字段拒绝且不写配置；旧 service 产物不存在。

版本 0.0.0，commit 9ce35ccbc3a8 (dirty)，build 2026-11-09T07:33:37.524Z。

待手动验收 start --help、run --help、按实际目录 start --runtime-home /absolute/runtime，之后 restart。未启动或重启用户实际服务；Windows/Linux 原生服务实机未测，注入命令执行器结果不等同原生平台验收。不提交或推送。
