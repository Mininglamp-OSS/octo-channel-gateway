import { Command, CommanderError, Option, type Help } from "commander";
import { GatewayCommandError, type GatewayCommand } from "./command-types.js";
import {
  cliHelpHeader,
  cliVersionInfo,
  extrasetExample,
  serviceCommands,
} from "./help.js";

const examples = new WeakMap<Command, readonly string[]>();
const commandPath = (command: Command): string =>
  command.parent
    ? `${commandPath(command.parent)} ${command.name()}`
    : command.name();

// 帮助版式沿用 Runtime；命令、选项和宽度仍由 Commander 的 Help API 提供。
function formatHelp(command: Command, helper: Help): string {
  const width = helper.padWidth(command, helper);
  const children = helper.visibleCommands(command);
  const samples =
    examples.get(command) ??
    (command.parent
      ? children.map((child) => `${commandPath(child)} --help`)
      : [
          "octo-channel-gateway start",
          "octo-channel-gateway run",
          "octo-channel-gateway logs --follow",
          "octo-channel-gateway status",
        ]);
  const section = (title: string, rows: [string, string][]) =>
    rows.length
      ? [
          title,
          ...rows.map(([term, description]) =>
            helper.formatItem(term, width, description, helper),
          ),
          "",
        ]
      : [];
  return [
    ...(!command.parent ? [cliHelpHeader, ""] : []),
    helper.commandDescription(command),
    "",
    "Usage:",
    `  ${helper.commandUsage(command)}`,
    "",
    ...(samples.length
      ? [
          "Examples:",
          ...samples.flatMap((sample) =>
            // heredoc 结束标记不能缩进，否则整段复制到 shell 后不会结束输入。
            sample.includes("\n") ? sample.split("\n") : [`  ${sample}`],
          ),
          "",
        ]
      : []),
    ...section(
      "Available Commands:",
      children.map((child) => [
        child.name(),
        helper.subcommandDescription(child),
      ]),
    ),
    ...section(
      "Arguments:",
      helper
        .visibleArguments(command)
        .map((arg) => [
          helper.argumentTerm(arg),
          helper.argumentDescription(arg),
        ]),
    ),
    ...section(
      "Flags:",
      helper
        .visibleOptions(command)
        .map((option) => [
          helper.optionTerm(option),
          helper.optionDescription(option),
        ]),
    ),
    ...section(
      "Global Flags:",
      helper
        .visibleGlobalOptions(command)
        .map((option) => [
          helper.optionTerm(option),
          helper.optionDescription(option),
        ]),
    ),
    ...(children.length
      ? [
          `Use "${commandPath(command)} [command] --help" for more information about a command.`,
          "",
        ]
      : []),
  ].join("\n");
}

export interface ParsedCliCommand {
  commandHelp: string;
  action: string;
  flags: { home?: string; runtimeHome?: string; json?: boolean };
  options: Record<string, string | boolean>;
  arguments: string[];
  business?: GatewayCommand;
  help?: string;
}

/** 用法错误携带静态帮助；不回显用户参数或输入正文。 */
export class CliUsageError extends GatewayCommandError {
  constructor(
    code: string,
    message: string,
    readonly help: string,
  ) {
    super(code, message);
  }
}

function invalid(message: string): never {
  throw new GatewayCommandError(
    "INVALID_ARGUMENTS",
    `${message} Use --help to see the available commands and flags.`,
  );
}

function helpTarget(root: Command, names: string[]): Command {
  let target = root;
  for (const name of names) {
    const child = target.commands.find((command) => command.name() === name);
    if (!child) invalid("Unknown command.");
    target = child;
  }
  return target;
}

/** 内置信息选项会提前退出；用同一命令声明检查完整输入，不执行业务。
 * 帮助允许省略必填值，但仍拒绝未知选项、多余位置参数及缺少选项值。
 */
function validateInformationalArguments(root: Command, args: string[]): void {
  const copy = (source: Command): Command => {
    const command = new Command(source.name())
      .helpOption(false)
      .addHelpCommand(false)
      .exitOverride()
      .configureOutput({ writeOut() {}, writeErr() {} })
      .option("-h, --help")
      .action(() => {
        if (source.parent === root && source.name() === "help")
          helpTarget(root, command.args);
      });
    for (const option of source.options)
      command.addOption(new Option(option.flags, option.description));
    for (const argument of source.registeredArguments)
      command.argument(`[${argument.name()}${argument.variadic ? "..." : ""}]`);
    for (const child of source.commands) command.addCommand(copy(child));
    return command;
  };
  copy(root).parse(args, { from: "user" });
}

/** 纯解析：帮助、版本与参数失败不读取 Home，不连接 Kernel 或服务管理器。 */
export function parseCliCommand(
  raw: string[],
  definitions: readonly GatewayCommand[],
): ParsedCliCommand {
  let help = "";
  let selected: Command | undefined;
  let business: GatewayCommand | undefined;
  let active: Command;
  const make = (name: string, description: string) =>
    new Command(name)
      .description(description)
      .summary(description)
      .helpOption("-h, --help", "Show help")
      .addHelpCommand(false)
      .exitOverride()
      .hook("preSubcommand", (_parent, child) => {
        active = child;
      })
      .configureHelp({
        showGlobalOptions: true,
        formatHelp,
        subcommandTerm: (child) => child.name(),
      })
      .configureOutput({
        writeOut: (text) => {
          help += text;
        },
        writeErr() {},
      });
  const root = make(
    "octo-channel-gateway",
    "Manage the independent Octo Channel Gateway SDK and service CLI.",
  )
    .option(
      "--home <path>",
      "Gateway Home directory (default: ~/.octo-channel-gateway)",
    )
    .option("--json", "Print JSON")
    .version(
      cliVersionInfo,
      "-V, --version",
      "Print version and build information",
    )
    .action(() => {
      root.outputHelp();
    });
  active = root;
  for (const [name, description] of serviceCommands) {
    const child = make(name, description);
    if (name === "extraset")
      child.description(
        `${description}.\nSupply one complete JSON object through stdin using the example below.\nReplace the Bot ID, API URL, credential and absolute project path; choose a model available to your Codex account.\nThis replaces the entire configuration. Restart Gateway after saving.\nThe heredoc example is for POSIX shells (macOS/Linux).`,
      );
    root.addCommand(child);
    if (name === "run" || name === "start")
      child.option("--runtime-home <path>", "Runtime Home directory (default: ~/.octo-runtime)");
    if (name === "install")
      child.option("--autostart <boolean>", "Enable automatic startup", "true");
    if (name === "logs")
      child
        .option("--lines <count>", "Number of log lines", "200")
        .option("--follow", "Follow logs");
    examples.set(child, [
      name === "extraset"
        ? extrasetExample
        : `octo-channel-gateway ${name}${name === "logs" ? " --follow" : ""}`,
    ]);
    child.action(() => {
      selected = child;
    });
  }
  const register = (parent: Command, definition: GatewayCommand) => {
    const child = make(definition.name, definition.description);
    parent.addCommand(child);
    if (definition.examples) examples.set(child, definition.examples);
    for (const option of definition.options ?? [])
      child.addOption(
        new Option(
          `--${option.name}${option.type === "string" ? " <value>" : ""}`,
          option.description,
        ).makeOptionMandatory(Boolean(option.required)),
      );
    for (const arg of definition.arguments ?? [])
      child.argument(
        arg.required ? `<${arg.name}>` : `[${arg.name}]`,
        arg.name,
      );
    for (const nested of definition.commands ?? []) register(child, nested);
    child.action(() => {
      if (!definition.run) {
        child.outputHelp();
        return;
      }
      selected = child;
      business = definition;
    });
  };
  for (const definition of definitions) register(root, definition);
  const version = make("version", "Print version and build information").action(
    () => {
      help = cliVersionInfo;
    },
  );
  examples.set(version, ["octo-channel-gateway version"]);
  root.addCommand(version);
  const helpCommand = make("help", "Help about any command").argument(
    "[command...]",
    "Command path",
  );
  helpCommand.action(() => {
    helpTarget(root, helpCommand.args).outputHelp();
  });
  root.addCommand(helpCommand);
  const args = raw.map((item) => (/^--json=/.test(item) ? "--json" : item));
  try {
    root.parse(args, { from: "user" });
  } catch (error) {
    if (
      error instanceof CommanderError &&
      ["commander.helpDisplayed", "commander.help", "commander.version"].includes(error.code)
    ) {
      try {
        validateInformationalArguments(root, args);
      } catch (validationError) {
        error = validationError;
      }
    }
    if (error instanceof GatewayCommandError)
      throw new CliUsageError(
        error.code,
        error.message,
        active.helpInformation().trimEnd(),
      );
    if (!(error instanceof CommanderError)) throw error;
    if (
      ![
        "commander.helpDisplayed",
        "commander.help",
        "commander.version",
      ].includes(error.code)
    ) {
      const messages: Record<string, string> = {
        "commander.unknownCommand": "Unknown command.",
        "commander.unknownOption": "Unknown option.",
        "commander.optionMissingArgument": "An option requires a value.",
        "commander.missingMandatoryOptionValue":
          "A required option is missing.",
        "commander.missingArgument": "A required argument is missing.",
        "commander.excessArguments": "Unexpected positional argument.",
      };
      // Commander 原始错误可能包含凭据；只暴露固定白名单提示。
      throw new CliUsageError(
        "INVALID_ARGUMENTS",
        `${messages[error.code] ?? "Invalid command arguments."} Use --help to see the available commands and flags.`,
        active.helpInformation().trimEnd(),
      );
    }
  }
  return {
    commandHelp: active.helpInformation().trimEnd(),
    action: selected?.name() ?? "",
    flags: { ...root.opts(), ...(selected?.opts().runtimeHome !== undefined ? { runtimeHome: selected.opts().runtimeHome } : {}) },
    options: selected?.opts() ?? {},
    arguments: selected?.args ?? [],
    business,
    ...(help ? { help: help.trimEnd() } : {}),
  };
}
