import { constants } from "node:fs";
import { lstat, open, realpath, type FileHandle } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fromMarkdown } from "mdast-util-from-markdown";
import type { ImArtifactPolicy } from "./artifact-policy.js";
import { artifactMime } from "./artifact-types.js";
import { GatewayError, logGatewayError, type GatewayErrorCode, type GatewayErrorStage } from "../errors/gateway-error.js";
import { gatewayFailureMessage } from "../errors/user-message.js";
import type { RuntimeLog } from "../support/runtime-log.js";

interface Span {
  start: number;
  end: number;
}
interface Node {
  type: string;
  url?: string;
  identifier?: string;
  position?: { start: { offset?: number }; end: { offset?: number } };
  children?: Node[];
}
interface Target extends Span {
  url: string;
}
interface Token extends Span {
  type: string;
}

function span(node: Node): Span | undefined {
  const start = node.position?.start.offset,
    end = node.position?.end.offset;
  return start === undefined || end === undefined ? undefined : { start, end };
}

/** AST 决定哪些引用有效，parser token 提供精确地址区间，避免重序列化破坏原 Markdown。 */
function references(text: string): {
  targets: Target[];
  candidates: Target[];
  fileTargets: Set<string>;
  edits: (urls: Map<string, string>, downgraded: Map<string, string>) => Target[];
} {
  const tokens: Token[] = [];
  const tree = fromMarkdown(text, {
    mdastExtensions: [
      {
        beforeEnter(token) {
          if (
            [
              "resourceDestinationString",
              "definitionDestinationString",
              "label",
              "definitionTitle",
            ].includes(token.type)
          )
            tokens.push({
              type: token.type,
              start: token.start.offset,
              end: token.end.offset,
            });
        },
      },
    ],
  });
  const definitions = new Map<string, { node: Node; blocked: boolean }>();
  const allDefinitions: { node: Node; blocked: boolean }[] = [];
  const uses: { node: Node; blocked: boolean }[] = [];
  const inline: Node[] = [];
  const visit = (node: Node, blocked = false): void => {
    blocked ||= ["blockquote", "code", "inlineCode", "html"].includes(
      node.type,
    );
    if (node.type === "definition") allDefinitions.push({ node, blocked });
    if (
      node.type === "definition" &&
      node.identifier &&
      !definitions.has(node.identifier)
    )
      definitions.set(node.identifier, { node, blocked });
    if (["linkReference", "imageReference"].includes(node.type))
      uses.push({ node, blocked });
    if (!blocked && ["link", "image"].includes(node.type)) inline.push(node);
    for (const child of node.children ?? []) visit(child, blocked);
  };
  visit(tree);
  const within = (node: Node, type: string): Token | undefined => {
    const range = span(node);
    return (
      range &&
      tokens
        .filter(
          (token) =>
            token.type === type &&
            token.start >= range.start &&
            token.end <= range.end,
        )
        .at(-1)
    );
  };
  const targets: Target[] = [];
  const candidates: Target[] = [];
  const fileTargets = new Set<string>();
  for (const node of inline) {
    const destination = within(node, "resourceDestinationString");
    if (destination && node.url) {
      targets.push({ ...destination, url: node.url });
      candidates.push({ ...span(node)!, url: node.url });
      if (node.type === "link") fileTargets.add(node.url);
    }
  }
  const expansions: { range: Span; label: Span; title?: Span; url: string }[] =
    [];
  const expansionDestinations = new Set<string>();
  const used = new Set<string>();
  for (const use of uses) {
    if (use.blocked || !use.node.identifier) continue;
    const definition = definitions.get(use.node.identifier);
    if (!definition?.node.url) continue;
    const destination = within(definition.node, "definitionDestinationString");
    if (!destination) continue;
    candidates.push({ ...span(use.node)!, url: definition.node.url });
    if (use.node.type === "linkReference") fileTargets.add(definition.node.url);
    const protectedExample =
      definition.blocked ||
      uses.some(
        (other) =>
          other.blocked && other.node.identifier === use.node.identifier,
      );
    if (protectedExample) {
      const range = span(use.node),
        label = tokens.find(
          (token) => token.type === "label" && token.start === range?.start,
        );
      if (range && label) {
        expansions.push({
          range,
          label,
          title: within(definition.node, "definitionTitle"),
          url: definition.node.url,
        });
        expansionDestinations.add(`${destination.start}:${destination.end}`);
        targets.push({ ...destination, url: definition.node.url });
      }
    } else if (!used.has(use.node.identifier)) {
      targets.push({ ...destination, url: definition.node.url });
      used.add(use.node.identifier);
    }
  }
  return {
    targets,
    candidates: candidates.sort((a, b) => a.start - b.start || b.end - a.end),
    fileTargets,
    edits: (urls, downgraded) => {
      let edits: Target[] = targets
        .filter(
          (target) =>
            !expansionDestinations.has(`${target.start}:${target.end}`),
        )
        .flatMap((target) => {
          const url = urls.get(target.url);
          return url ? [{ ...target, url }] : [];
        });
      // 先降级整条活动引用，再合成外层共享引用；外层降级覆盖内部编辑。
      const collapsed = candidates.filter((entry) => downgraded.has(entry.url));
      for (const entry of collapsed.sort((a, b) => b.start - a.start || a.end - b.end)) {
        edits = edits.filter((edit) => edit.start < entry.start || edit.end > entry.end);
        edits.push({ ...entry, url: downgraded.get(entry.url)! });
      }
      // 内层图片（包括已降级文本）先替换，再合入外层 label，避免相交区间。
      for (const entry of expansions.sort(
        (a, b) => a.range.end - a.range.start - (b.range.end - b.range.start),
      )) {
        const url = urls.get(entry.url);
        if (!url || collapsed.some((range) => range.start <= entry.range.start && range.end >= entry.range.end)) continue;
        let label = text.slice(entry.label.start, entry.label.end);
        const nested = edits.filter(
          (edit) =>
            edit.start >= entry.label.start && edit.end <= entry.label.end,
        );
        for (const edit of nested.sort((a, b) => b.start - a.start))
          label =
            label.slice(0, edit.start - entry.label.start) +
            edit.url +
            label.slice(edit.end - entry.label.start);
        edits = edits.filter(
          (edit) =>
            edit.start < entry.range.start || edit.end > entry.range.end,
        );
        edits.push({
          ...entry.range,
          url: `${label}(<${url}>${entry.title ? ` ${text.slice(entry.title.start, entry.title.end)}` : ""})`,
        });
      }
      for (const { node, blocked } of allDefinitions) {
        if (blocked) continue;
        const activeUses = uses.filter((use) => use.node.identifier === node.identifier);
        if (!activeUses.length || activeUses.some((use) => use.blocked)) continue;
        if (activeUses.every((use) => {
          const range = span(use.node)!;
          return collapsed.some((entry) => entry.start <= range.start && entry.end >= range.end);
        })) edits.push({ ...span(node)!, url: "" });
      }
      return edits;
    },
  };
}

function localPath(target: string, workspace?: string): string | undefined {
  if (/^file:/i.test(target)) {
    try {
      return fileURLToPath(target);
    } catch (cause) {
      throw new GatewayError("OV_DELIVERY_PATH_INVALID", "reference", { cause });
    }
  }
  // 其他操作系统的盘符/UNC 也是本地引用，不能当作外部 URL 跳过或在本机错误拼接。
  if (/^[a-z]:[\\/]/i.test(target) || target.startsWith("\\\\")) {
    if (process.platform !== "win32") throw new GatewayError("OV_DELIVERY_PATH_INVALID", "reference");
    return target;
  }
  if (
    /^[a-z][a-z\d+.-]*:/i.test(target) ||
    target.startsWith("//") ||
    target.startsWith("#")
  )
    return undefined;
  const clean = target.split(/[?#]/, 1)[0];
  let decoded: string;
  try {
    decoded = decodeURIComponent(clean);
  } catch (cause) {
    throw new GatewayError("OV_DELIVERY_PATH_INVALID", "reference", { cause });
  }
  if (!decoded || decoded.includes("\0") || decoded.startsWith("~"))
    throw new GatewayError("OV_DELIVERY_PATH_INVALID", "reference");
  if (path.isAbsolute(decoded)) return decoded;
  if (!workspace) throw new GatewayError("OV_DELIVERY_PATH_INVALID", "reference");
  return path.resolve(workspace, decoded);
}

function contained(root: string, file: string): boolean {
  const relative = path.relative(root, file);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  );
}

function referencePath(target: string): string | undefined {
  if (!/^file:/i.test(target) && !/^[a-z]:[\\/]/i.test(target) && !target.startsWith("\\\\") &&
    (/^[a-z][a-z\d+.-]*:/i.test(target) || target.startsWith("//") || target.startsWith("#"))) return undefined;
  const clean = /^file:/i.test(target) ? new URL(target).pathname : target.split(/[?#]/, 1)[0]!;
  return decodeURIComponent(clean);
}

function downgradedName(target: string): string {
  let decoded: string;
  try { decoded = referencePath(target) ?? ""; } catch { decoded = ""; }
  const name = decoded.replace(/[\\/]+$/, "").split(/[\\/]/).at(-1) || "文件";
  const safe = ([...name.replace(/[\x00-\x1f\x7f]/g, " ").trim()].slice(0, 120).join("").trim() || "文件")
    .replace(/[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/g, "\\$&");
  return `***${safe}***`;
}

export type ArtifactUpload = (
  bytes: Uint8Array,
  filename: string,
  mime: string,
  signal: AbortSignal,
) => Promise<string>;

/** 已核验并上传的文件元数据；不向发送层暴露本机路径。 */
export interface ArtifactFile {
  url: string;
  name: string;
  size: number;
  extension: string;
}

export interface PreparedArtifacts {
  text: string;
  files: ArtifactFile[];
  incomplete?: true;
}

/** 只交付成功 final 的显式引用；失败不改变生成终态，缓存由 transport 的 final effect 闭包持有。 */
export async function prepareArtifacts(
  text: string,
  policy: ImArtifactPolicy,
  ownerSignal: AbortSignal,
  upload: ArtifactUpload,
  diagnostics?: { log?: RuntimeLog; effectKey?: string },
): Promise<PreparedArtifacts> {
  if (policy.mode === "tools") return { text, files: [] };
  ownerSignal.throwIfAborted();
  const parsed = references(text);
  const signal = AbortSignal.any([
    ownerSignal,
    AbortSignal.timeout(policy.timeoutMs),
  ]);
  const urls = new Map<string, string>();
  const downgraded = new Map<string, string>();
  const processed = new Set<string>();
  const files = new Map<string, Promise<ArtifactFile>>();
  const cards = new Map<string, ArtifactFile>();
  const failures: GatewayErrorCode[] = [];
  let total = 0;
  let count = 0;
  let roots: string[] | undefined;
  let hiddenUntil = -1;
  for (const candidate of parsed.candidates) {
    if (candidate.start < hiddenUntil) continue;
    const target = candidate.url;
    if (processed.has(target)) {
      if (downgraded.has(target)) hiddenUntil = candidate.end;
      continue;
    }
    processed.add(target);
    let stage: GatewayErrorStage = "reference";
    try {
      const decoded = referencePath(target);
      if (decoded === undefined) continue;
      if (!artifactMime(decoded)) {
        downgraded.set(target, downgradedName(target));
        continue;
      }
      const file = localPath(target, policy.workspace);
      if (file === undefined) continue;
      stage = "read";
      const resolved = await realpath(file);
      const entry = await lstat(resolved);
      const mime = artifactMime(resolved);
      if (!entry.isFile() || !mime || mime !== artifactMime(decoded)) {
        downgraded.set(target, downgradedName(target));
        continue;
      }
      signal.throwIfAborted();
      if (policy.roots !== undefined && !roots)
        roots = await Promise.all(policy.roots.map((root) => realpath(root)));
      if (roots && !roots.some((root) => contained(root, resolved)))
        throw new GatewayError("OV_DELIVERY_POLICY_DENIED", "read");
      let result = files.get(resolved);
      if (!result) {
        if (++count > policy.maxFiles) throw new GatewayError("OV_DELIVERY_FILE_COUNT_LIMIT", "read");
        result = (async () => {
          let handle: FileHandle | undefined;
          try {
            handle = await open(
              resolved,
              constants.O_RDONLY |
                (constants.O_NOFOLLOW ?? 0) |
                (constants.O_NONBLOCK ?? 0),
            );
            const stat = await handle.stat();
            if (
              !stat.isFile() ||
              stat.dev !== entry.dev ||
              stat.ino !== entry.ino ||
              (await realpath(file)) !== resolved
            )
              throw new GatewayError("OV_DELIVERY_READ_FAILED", "read");
            if (stat.size > policy.maxFileBytes)
              throw new GatewayError("OV_DELIVERY_FILE_SIZE_LIMIT", "read");
            if (total + stat.size > policy.maxTotalBytes)
              throw new GatewayError("OV_DELIVERY_TOTAL_SIZE_LIMIT", "read");
            if (policy.mimeTypes && !policy.mimeTypes.includes(mime))
              throw new GatewayError("OV_DELIVERY_POLICY_DENIED", "read");
            total += stat.size;
            signal.throwIfAborted();
            // 同一描述符读取且预分配有界容量，文件增长也不能绕过已核验的字节预算。
            const bytes = Buffer.alloc(stat.size);
            let offset = 0;
            while (offset < bytes.length) {
              signal.throwIfAborted();
              const read = await handle.read(
                bytes,
                offset,
                Math.min(64 << 10, bytes.length - offset),
                offset,
              );
              if (!read.bytesRead) throw new GatewayError("OV_DELIVERY_READ_FAILED", "read");
              offset += read.bytesRead;
            }
            const after = await handle.stat();
            if (
              after.size !== stat.size ||
              after.mtimeMs !== stat.mtimeMs ||
              after.ctimeMs !== stat.ctimeMs
            )
              throw new GatewayError("OV_DELIVERY_READ_FAILED", "read");
            signal.throwIfAborted();
            const name = path.basename(resolved);
            let url: string;
            try {
              url = await upload(bytes, name, mime, signal);
            } catch (cause) {
              const native = cause as { status?: unknown; code?: unknown } | undefined;
              const status = native?.status;
              const timeout = (cause instanceof Error && cause.name === "TimeoutError") ||
                status === 408 || status === 504 || native?.code === "ETIMEDOUT";
              throw new GatewayError(status === 413 ? "OV_DELIVERY_FILE_SIZE_LIMIT" : timeout
                ? "OV_DELIVERY_TIMEOUT" : "OV_DELIVERY_UPLOAD_FAILED", "upload", { cause });
            }
            return {
              url,
              name,
              size: bytes.length,
              extension: path.extname(name).slice(1).toLowerCase(),
            };
          } finally {
            await handle?.close();
          }
        })();
        files.set(resolved, result);
      }
      const artifact = await result;
      if (parsed.fileTargets.has(target)) cards.set(resolved, artifact);
      // 对最终 Markdown 只写安全地址字节；不让云地址中的括号、空格或实体改变原文结构。
      urls.set(
        target,
        artifact.url
          .replace(
            /[\s()<>"\\]/g,
            (character) =>
              `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
          )
          .replace(/&/g, "&amp;"),
      );
    } catch (error) {
      ownerSignal.throwIfAborted();
      const failure = signal.aborted
        ? new GatewayError("OV_DELIVERY_TIMEOUT", error instanceof GatewayError ? error.stage : stage, { cause: error })
        : error instanceof GatewayError ? error
        : new GatewayError(stage === "reference" ? "OV_DELIVERY_PATH_INVALID" : "OV_DELIVERY_READ_FAILED", stage, { cause: error });
      downgraded.set(target, downgradedName(target));
      failures.push(failure.code);
      logGatewayError(diagnostics?.log, failure, diagnostics?.effectKey);
    } finally {
      if (downgraded.has(target)) hiddenUntil = candidate.end;
    }
  }
  ownerSignal.throwIfAborted();
  let output = text;
  const edits = parsed.edits(urls, downgraded);
  // 同一定义可能被多个 reference 使用，重复区间只替换一次。
  for (const edit of [
    ...new Map(
      edits.map((entry) => [`${entry.start}:${entry.end}`, entry]),
    ).values(),
  ].sort((a, b) => b.start - a.start))
    output = output.slice(0, edit.start) + edit.url + output.slice(edit.end);
  if (failures.length)
    output += `\n\n${gatewayFailureMessage(failures)}`;
  return {
    text: output,
    files: [...cards.values()],
    ...(failures.length ? { incomplete: true as const } : {}),
  };
}
