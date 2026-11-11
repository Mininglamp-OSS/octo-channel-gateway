import assert from 'node:assert/strict';
import { attachKernel } from '@mininglamp-oss/octo-runtime-client';
import { ImRuntime, ChannelGateway } from '../packages/octo-channel-gateway-sdk/dist/index.js';
import { GatewayTransport } from '../packages/octo-channel-gateway-sdk/dist/transport/channel.js';

const endpoint = '/Users/lvsijia/.octo-runtime/executor-kernel.sock';
const client = attachKernel({ endpoint });
const before = await client.status();
let receive;
const start = GatewayTransport.prototype.start;
const close = GatewayTransport.prototype.close;
GatewayTransport.prototype.start = async function () { receive = this.callbacks.onMessage; };
GatewayTransport.prototype.close = async function () {};
const bot = { bot_id: 'pr17-local-qa', api_url: 'https://example.test/api', agent: { adapter_type: 'codex', workdir: '/tmp', approval_mode: 'full_access' } };
const runtime = new ImRuntime(bot, { kernel: client });
const replies = [], presentations = [];
let registration;
try {
  await runtime.start();
  receive({ messageId: `pr17-${Date.now()}`, senderId: 'local-qa', conversationId: `qa-${Date.now()}`, conversationKind: 'direct', text: 'Reply exactly PR17_CLIENT_1_1_12_OK. Do not use tools.', buildContext: async () => ({ schema: 'octo.context-envelope/v3', items: [] }), reply: async text => replies.push(text), beginPresentation: () => ({ update: snapshot => presentations.push(snapshot), finish: async () => {} }) });
  const deadline = Date.now() + 120000;
  while (!replies.length && Date.now() < deadline) await new Promise(r => setTimeout(r, 100));
  assert.ok(replies.some(text => text.includes('PR17_CLIENT_1_1_12_OK')), JSON.stringify(replies));
  assert.ok(presentations.some(p => p.terminal === 'completed'));
  await runtime.close();
  registration = new ChannelGateway({ kernel: client });
  await registration.register({ botId: bot.bot_id, apiUrl: bot.api_url, enabled: false }, bot.agent);
  const closing = registration.close();
  assert.equal(closing, registration.close());
  await closing;
  const after = await client.status();
  assert.equal(after.kernel_instance_id, before.kernel_instance_id);
  assert.equal(after.execution_ready, true);
  assert.deepEqual(client.invocations.snapshot(), []);
  console.log(JSON.stringify({ realProvider: 'codex', gatewayReply: replies, terminalCompleted: true, registrationCloseIdempotent: true, kernelPreserved: true, kernelPid: after.pid, transport: 'local callback; no external IM messages' }));
} finally {
  await runtime.close();
  await registration?.close();
  client.close();
  GatewayTransport.prototype.start = start;
  GatewayTransport.prototype.close = close;
}
