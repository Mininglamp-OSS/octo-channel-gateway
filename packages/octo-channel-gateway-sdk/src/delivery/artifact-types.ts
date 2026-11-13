import path from "node:path";

/** 固定类型白名单；宿主 MIME 配置只能在此范围内收窄。 */
export const ARTIFACT_TYPES: Readonly<Record<string, string>> = Object.freeze({
  ".md": "text/markdown",
  ".markdown": "text/markdown",
  ".txt": "text/plain",
  ".log": "text/plain",
  ".rst": "text/plain",
  ".adoc": "text/plain",
  ".json": "application/json",
  ".jsonl": "application/x-ndjson",
  ".ndjson": "application/x-ndjson",
  ".xml": "application/xml",
  ".csv": "text/csv",
  ".tsv": "text/tab-separated-values",
  ".yaml": "text/yaml",
  ".yml": "text/yaml",
  ".toml": "application/toml",
  ".ini": "text/plain",
  ".conf": "text/plain",
  ".properties": "text/plain",
  ".html": "text/html",
  ".htm": "text/html",
  ".css": "text/css",
  ".sql": "application/sql",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".rtf": "application/rtf",
  ".zip": "application/zip",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".bmp": "image/bmp",
  ".ico": "image/x-icon",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
});

export function artifactMime(filename: string): string | undefined {
  return ARTIFACT_TYPES[path.extname(filename).toLowerCase()];
}
