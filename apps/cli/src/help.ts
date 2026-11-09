import { readFileSync } from "node:fs";

const manifest = JSON.parse(
  readFileSync(new URL("../../../../package.json", import.meta.url), "utf8"),
) as { version: string };
export const repositoryUrl =
  "https://github.com/Mininglamp-OSS/octo-channel-gateway";
let build: { commit?: unknown; dirty?: unknown; buildTime?: unknown } = {};
try {
  const value: unknown = JSON.parse(
    readFileSync(new URL("./build-info.json", import.meta.url), "utf8"),
  );
  if (value !== null && typeof value === "object") build = value;
} catch (error) {
  if (
    !(error instanceof SyntaxError) &&
    (error as NodeJS.ErrnoException).code !== "ENOENT"
  )
    throw error;
}
const commit =
  typeof build.commit === "string" && /^[a-f0-9]{40,64}$/.test(build.commit)
    ? build.commit.slice(0, 12)
    : "unknown";
const time =
  typeof build.buildTime === "string" &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(build.buildTime) &&
  Number.isFinite(Date.parse(build.buildTime)) &&
  new Date(build.buildTime).toISOString() === build.buildTime
    ? build.buildTime
    : "unknown";
export const cliVersionInfo = `${manifest.version}\ncommit:${commit}${build.dirty === true ? " (dirty)" : ""}\nbuild:${time}\n${repositoryUrl}`;
export const cliHelpHeader = `Octo Channel Gateway CLI (${manifest.version})\n${cliVersionInfo.split("\n").slice(1).join("\n")}`;

export const extrasetExample = `octo-channel-gateway extraset <<'JSON'
{
  "bots": [
    {
      "bot_id": "my-codex-bot",
      "bot_name": "My Codex Bot",
      "api_url": "https://im.deepminer.com.cn/api",
      "bf_token": "REPLACE_WITH_BOT_TOKEN",
      "agent": {
        "adapter_type": "codex",
        "workdir": "/absolute/project",
        "model": "gpt-6.1-sol",
        "effort": "high"
      }
    }
  ]
}
JSON`;

export const serviceCommands = new Map([
  ["start", "Install or update service arguments, then start Gateway and wait for readiness"],
  ["run", "Run Gateway in the foreground using an existing Runtime Kernel"],
  ["stop", "Stop Gateway, preserving its autostart setting"],
  ["restart", "Restart Gateway and wait for readiness"],
  ["install", "Register Gateway as a user service (autostart on by default)"],
  [
    "uninstall",
    "Remove the Gateway service, preserving configuration and logs",
  ],
  ["logs", "Read Gateway logs or follow new entries"],
  ["doctor", "Diagnose Gateway service and its active Runtime connection"],
  ["status", "Show Gateway service and Bot status"],
  ["extraset", "Replace Gateway configuration with JSON from stdin"],
  ["extraget", "Print complete Gateway configuration, including credentials"],
]);
