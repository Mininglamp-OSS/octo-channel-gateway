# 跨平台用户服务

[English](README.md)

源码拷贝自 `Mininglamp-OSS/octo-runtime` 的 `octo-runtime-cross-service` 包，revision `4276f6d339461daa88c3215b8024d548eb313cb1`，Apache-2.0 许可证。本内部源码包随 Gateway 根项目编译与发行，不依赖 Runtime checkout 或私有 npm 包。

将 `ServiceSpec` 转为 launchd、systemd 用户服务或 Windows 用户任务。启动参数保存在原生服务定义中，凭据由应用读取；应用就绪由调用方确认。接口见[合同](src/types.ts)。

保留 Gateway 在 `windows-task.ts` 中已有的 Windows 任务归属校验：生命周期变更必须确认属于当前用户。其他源码文件与上述 revision 一致。

可以通过 `pnpm --filter @mininglamp-oss/octo-channel-gateway-cross-service run build` 独立构建，也可由根构建按依赖顺序构建；CLI 通过 `workspace:*` 消费本包 exports。Windows/Linux 原生验证需要对应平台；渲染与注入命令执行器可本地测试。

## 宿主串行化合同

后端变更包含多个步骤，不是事务。宿主必须阻止同一原生服务身份的 install、uninstall、enable、disable、start、stop 和 restart 重叠执行，包括不同进程、不同后端实例发起的操作。守卫必须覆盖完整操作，以及宿主的就绪检查和失败清理。仅使用内存队列不能保护并发 CLI 进程；只读检查可能观察到中间状态。

Gateway CLI 已持有对应 Home 的 `config.lock`，覆盖服务变更及最终检查；竞争命令在进入变更前以 `SETUP_IN_PROGRESS` 失败。本内部包不属于 Gateway SDK 的公开导出；直接使用后端的宿主必须按原生服务身份提供等价守卫，即便调用方使用不同配置目录。

在仓库根目录显式运行 `npm run build && node --test scripts/verify-service-serialization.mjs`。专项先用假的 systemd 执行器复现未加守卫的 install/uninstall 交错，再用两个 Node 进程验证真实 CLI 守卫。仅操作临时定义，不调用原生服务管理器；不加入默认测试或 CI。
