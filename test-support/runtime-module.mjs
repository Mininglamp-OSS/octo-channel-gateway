import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

// 迁移回归需要检查执行端的内部结果；只在测试中从已安装的 Runtime 发行包定位。
export async function runtimeModule(name, file = "index.js") {
  return import(runtimeModuleUrl(name, file));
}

export function runtimeModuleUrl(name, file = "index.js") {
  const require = createRequire(
    import.meta.resolve("@mininglamp-oss/octo-runtime/executor-core"),
  );
  const entry = require.resolve(`@mininglamp-oss/octo-runtime-${name}`);
  return pathToFileURL(join(dirname(entry), file)).href;
}
