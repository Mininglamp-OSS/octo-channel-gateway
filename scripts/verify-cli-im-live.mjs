import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { homedir, tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { attachKernel } from "@mininglamp-oss/octo-runtime-client";
import { readStatus } from "../dist/apps/cli/src/control.js";
import { runtimeEndpoint } from "../dist/apps/cli/src/runtime-endpoint.js";
import { getChannelMessages } from "../dist/packages/gateway/src/transport/api/conversations.js";
import { executeVerificationCommand as execute } from "./verification-command.mjs";

// 仅手动运行；凭据从指定文件读取，通过 stdin/env 传递，不进入命令参数或报告。
const [accountsFile, userFile, groupId, model] = process.argv.slice(2);
assert.ok(accountsFile && userFile && groupId && model, "Usage: node scripts/verify-cli-im-live.mjs ACCOUNTS USER_JSON QA_GROUP MODEL");
const accounts = (await readFile(accountsFile, "utf8")).split(/(?=Bot Name:)/).slice(1).map(block => {
  const value = key => block.match(new RegExp(`^${key}:\\s*(.+)$`, "m"))?.[1]?.trim();
  return { id: value("Bot ID"), token: value("Bot Token"), api: value("API Server") };
});
const [receiver, sender] = accounts;
assert.ok(receiver.token.startsWith("bf_") && sender.token.startsWith("bf_"));
assert.equal(receiver.api, "https://im-test.deepminer.com.cn/api");
assert.equal(sender.api, receiver.api);
const user = JSON.parse(await readFile(userFile, "utf8"));
assert.ok(user.api_key.startsWith("uk_"));
const envFor = token => {
  const env = { ...process.env, OCTO_TOKEN: token, OCTO_API_BASE_URL: receiver.api.replace(/\/api$/, "") };
  for (const key of ["OCTO_BOT_TOKEN", "OCTO_BOT_ID", "OCTO_PROFILE", "OCTO_CREDENTIAL_MODE"]) delete env[key];
  return env;
};
async function cli(token, args, body) {
  try {
    const { stdout } = await execute("octo-cli", [...args, ...(body ? ["--data", JSON.stringify(body)] : [])], { env: envFor(token), timeout: 30000 });
    const result = JSON.parse(stdout);
    assert.equal(result.ok, true);
    return result.data;
  } catch { throw new Error(`QA CLI failed: ${args.slice(0, 2).join(" ")}`); }
}
for (const account of [receiver, sender]) {
  await cli(account.token, ["config", "show"]);
  const groups = await cli(account.token, ["group", "list"]);
  assert.ok(JSON.stringify(groups).includes(groupId), "Both test Bots must already belong to the QA group");
}
const home = await mkdtemp(join(tmpdir(), "gateway-cli-im-"));
const entry = resolve("dist/apps/cli/src/index.js");
const client = attachKernel({ endpoint: runtimeEndpoint(join(homedir(), ".octo-runtime")) });
const before = await client.status();
let child, completion;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const marker = `GW_AGENT_HOME_${randomUUID().slice(0, 8)}`;
try {
  const config = { enabled: true, bots: [{ bot_id: receiver.id, bot_name: "", api_url: receiver.api, bf_token: receiver.token, agent: { adapter_type: "codex", model, effort: "medium", workdir: home }, cards: false, typing: false, groups_enabled: true, group_ids: [groupId], allowed_sender_ids: [sender.id], run_timeout_ms: 120000 }] };
  const imported = spawn(process.execPath, [entry, "extraset", "--home", home], { stdio: ["pipe", "ignore", "ignore"] });
  const importedExit = new Promise((resolve, reject) => { imported.once("error", reject); imported.once("exit", resolve); });
  imported.stdin.end(JSON.stringify(config));
  assert.equal(await importedExit, 0, "extraset must accept the new agent configuration");
  child = spawn(process.execPath, [entry, "run", "--home", home], { stdio: "ignore" });
  completion = new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", (code, signal) => resolve({ code, signal })); });
  let online = false;
  for (let i = 0; i < 150; i++) {
    assert.equal(child.exitCode, null, "Gateway exited before becoming ready");
    const status = await readStatus(home).catch(() => undefined);
    if (status?.bots?.some(bot => bot.connected && bot.bot_name === receiver.id)) { online = true; break; }
    await delay(200);
  }
  assert.ok(online, "Gateway must connect with blank bot_name falling back to Bot ID");
  console.log(JSON.stringify({ phase: "online", defaultRuntimeHome: true, agentConfiguration: true, emptyNameFallback: true }));
  await cli(sender.token, ["message", "send"], { channel_id: groupId, channel_type: 2, payload: { type: 1, content: `Reply exactly ${marker}. Do not use tools.`, mention: { uids: [receiver.id] } } });
  let reply;
  for (let i = 0; i < 120; i++) {
    const history = await getChannelMessages({ apiUrl: receiver.api, botToken: receiver.token, channelId: groupId, channelType: 2, limit: 30, pullMode: 0 });
    reply = history.find(message => message.from_uid === receiver.id && message.content.includes(marker));
    if (reply) break;
    await delay(1000);
  }
  assert.ok(reply, "Real Provider response must be read back from IM");
  let indexed = false;
  for (let i = 0; i < 15; i++) {
    const result = await cli(user.api_key, ["message", "search", "--chat-id", groupId, "--channel-type", "2", "--keyword", marker]);
    if (JSON.stringify(result).includes(marker)) { indexed = true; break; }
    await delay(2000);
  }
  assert.ok(indexed, "User API key must retrieve the test exchange");
  child.kill("SIGTERM");
  const stopped = await Promise.race([completion, delay(10000).then(() => { throw new Error("Gateway shutdown timed out"); })]);
  assert.equal(stopped.code, 0);
  const after = await client.status();
  assert.equal(after.kernel_instance_id, before.kernel_instance_id);
  assert.equal(after.execution_ready, true);
  console.log(JSON.stringify({ liveIm: true, realProvider: "codex", model, marker, replyMessageId: reply.message_id, userSearch: indexed, cleanExit: true, kernelPreserved: true }));
} finally {
  if (child && child.exitCode === null && child.signalCode === null) {
    child.kill("SIGTERM");
    await Promise.race([completion, delay(6000)]);
    if (child.exitCode === null && child.signalCode === null) { child.kill("SIGKILL"); await completion; }
  }
  client.close();
  await rm(home, { recursive: true, force: true });
}
