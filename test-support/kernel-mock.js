import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { assertInvokeInput } from "@mininglamp-oss/octo-runtime-client/protocol";
import { prepareKernelInput } from "../packages/octo-channel-gateway-sdk/dist/execution/kernel-input.js";

/** 严格模拟新公开入口；测试回调接收 IPC v2 wire，绝不反向重建旧业务 contexts。 */
export function kernelMock(source) {
  return {
    ...source,
    invoke(content, sessionId, providerSession, agentEnv) {
      assert.equal(arguments.length, 4);
      assert.ok(agentEnv && typeof agentEnv === "object");
      const { parts, ...metadata } = Array.isArray(content) ? { parts: content } : content;
      const input = Object.fromEntries(Object.entries({ ...metadata, inputs: parts, sessionId, providerSession, agentEnv }).filter(([, v]) => v !== undefined));
      assertInvokeInput(input);
      input.invocationId ??= randomUUID();
      input.runId ??= randomUUID();
      input.sessionId ??= randomUUID();
      const snapshot = structuredClone(input);
      // 这是测试执行源的观察信号，公开 invoke 没有 signal 参数；取消与终态由各用例的门闩决定。
      const stream = source.invoke(snapshot, { signal: new AbortController().signal });
      return Object.assign(stream, { invocationId: snapshot.invocationId, runId: snapshot.runId, sessionId: snapshot.sessionId });
    },
  };
}
export function invokeWire(client, input) {
  const { inputs: parts, sessionId, providerSession, agentEnv, ...content } = input;
  return client.invoke({ ...content, parts }, sessionId, providerSession, agentEnv);
}
/** 内部渠道准备稿经过真实 Gateway 编译，再进入测试执行源。 */
export function gatewayWire(request, credentials) {
  const { inputs: { parts, ...content }, agentEnv } = prepareKernelInput(request, credentials);
  return { ...content, inputs: parts, sessionId: request.sessionId,
    ...(request.providerSession ? { providerSession: request.providerSession } : {}), agentEnv };
}
/** 断言实际入模文本中的业务材料；不制造旧 wire 或把它交回 Runtime。 */
export function modelItems(request) {
  const parts = request.modelInputParts ?? request.inputs;
  const text = parts.filter((part) => part.type === "text").map((part) => part.text).join("\n");
  return [...text.matchAll(/<context namespace="([^"]+)" name="([^"]+)">([\s\S]*?)<\/context>/g)].map((match) => {
    const data = [...match[3].matchAll(/<!\[CDATA\[([\s\S]*?)\]\]>/g)].map((part) => part[1]).join("");
    let payload;
    try { payload = JSON.parse(data); } catch { payload = { text: data }; }
    return { namespace: match[1], name: match[2], payload, guidance: match[3].match(/<guidence>([\s\S]*?)<\/guidence>/)?.[1] };
  });
}
/** 测试执行源的 wire 作为 Gateway 内部草稿时，显式选择其执行信封。 */
export function gatewayDraft(input) {
  const { agentEnv, ...content } = input;
  return { ...content, contexts: { schema: agentEnv.schema, items: agentEnv.items },
  };
}
