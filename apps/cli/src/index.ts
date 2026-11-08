#!/usr/bin/env node
import { runCli } from "./main.js";
let foreground = false;
const code = await runCli(process.argv.slice(2), {
  onForeground() {
    foreground = true;
  },
});
process.exitCode = code;
// 前台服务完成既有清理后，沿原 CLI 的有界最终退出；其他命令自然刷新输出。
if (foreground) setTimeout(() => process.exit(code), 250).unref();
