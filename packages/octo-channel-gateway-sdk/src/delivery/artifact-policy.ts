import type {
  ContextEnvelope,
  ContextItem,
} from "@mininglamp-oss/octo-runtime-client/protocol";
import type { OctoBotConfig } from "../contracts.js";
import { ARTIFACT_TYPES } from "./artifact-types.js";

export interface ImArtifactPolicy {
  mode: "channel" | "tools";
  workspace?: string;
  roots?: string[];
  mimeTypes?: string[];
  maxFileBytes: number;
  maxTotalBytes: number;
  maxFiles: number;
  timeoutMs: number;
}

export const ARTIFACT_LIMITS = {
  max_file_bytes: 20 * 1024 * 1024,
  max_total_bytes: 50 * 1024 * 1024,
  max_files: 16,
  timeout_ms: 30_000,
} as const;

/** 固定白名单由代码执行；仅可信宿主配置可额外限制 MIME 与根目录。 */
export function artifactPolicy(
  config: OctoBotConfig,
  context: ContextEnvelope,
): ImArtifactPolicy {
  const options = config.artifact_delivery;
  const workspace = context.items.find(
    (item) => item.namespace === "octo.execution" && item.name === "workspace",
  )?.payload.path;
  return {
    mode: options?.mode ?? "channel",
    ...(typeof workspace === "string" ? { workspace } : {}),
    ...(options?.allowed_roots !== undefined
      ? { roots: [...options.allowed_roots] }
      : {}),
    ...(options?.allowed_mime_types
      ? { mimeTypes: [...options.allowed_mime_types] }
      : {}),
    maxFileBytes: options?.max_file_bytes ?? ARTIFACT_LIMITS.max_file_bytes,
    maxTotalBytes: options?.max_total_bytes ?? ARTIFACT_LIMITS.max_total_bytes,
    maxFiles: options?.max_files ?? ARTIFACT_LIMITS.max_files,
    timeoutMs: options?.timeout_ms ?? ARTIFACT_LIMITS.timeout_ms,
  };
}

/** 默认交付只约定本地引用格式；真实上传策略由代码执行，不以提示词授予访问权限。 */
export function artifactContext(policy: ImArtifactPolicy): ContextItem {
  return {
    namespace: "extra.im",
    name: "artifact-delivery",
    payload: {
      guidance:
        policy.mode === "channel"
          ? `For supported local files, use Markdown with an absolute path: [label](/absolute/path); for images, use ![alt](/absolute/path). Supported extensions: ${Object.keys(ARTIFACT_TYPES).join(", ")}. Directories and other file types are displayed as names without automatic upload.`
          : [
              "This channel does not automatically upload output files.",
              "Use normal tool calls when the task requires file delivery and return recipient-accessible URLs.",
              "Do not present runtime-local paths as downloadable attachments.",
              "Do not send a duplicate final reply with a messaging tool.",
            ].join("\n"),
      mode: policy.mode,
      ...(policy.mode === "channel" ? { supportedExtensions: Object.keys(ARTIFACT_TYPES) } : {}),
      ...(policy.workspace ? { workspace: policy.workspace } : {}),
      ...(policy.roots !== undefined ? { allowedRoots: policy.roots } : {}),
      ...(policy.mimeTypes ? { allowedMimeTypes: policy.mimeTypes } : {}),
      maxFileBytes: policy.maxFileBytes,
      maxTotalBytes: policy.maxTotalBytes,
      maxFiles: policy.maxFiles,
      timeoutMs: policy.timeoutMs,
    },
  };
}
