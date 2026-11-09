# 跨平台用户服务

[English](README.md)

源码拷贝自 `Mininglamp-OSS/octo-runtime` 的 `octo-runtime-cross-service` 包，revision `4276f6d339461daa88c3215b8024d548eb313cb1`，Apache-2.0 许可证。本内部源码包随 Gateway 根项目编译与发行，不依赖 Runtime checkout 或私有 npm 包。

将 `ServiceSpec` 转为 launchd、systemd 用户服务或 Windows 用户任务。启动参数保存在原生服务定义中，凭据由应用读取；应用就绪由调用方确认。接口见[合同](src/types.ts)。

保留 Gateway 在 `windows-task.ts` 中已有的 Windows 任务归属校验：生命周期变更必须确认属于当前用户。其他源码文件与上述 revision 一致。

在仓库根目录构建。Windows/Linux 原生验证需要对应平台；渲染与注入命令执行器可本地测试。
