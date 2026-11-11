/** 诊断不参与执行生命周期：同步异常与异步拒绝均消费，不等待宿主日志 IO。 */
export function runDiagnostic(callback: () => unknown): void {
  try {
    const result = callback();
    if (result && typeof (result as PromiseLike<unknown>).then === "function")
      void Promise.resolve(result).catch(() => undefined);
  } catch {
    // 包括回调自身及 then getter 抛错，均不能改变连接、执行或清理结果。
  }
}
