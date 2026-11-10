import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { publishRelease, verifyIntegrity } from "./release-state.mjs";
import { releaseVersion } from "./validate-release.mjs";

const execute = promisify(execFile);
export const packageName = "@mininglamp-oss/octo-channel-gateway";
const repository = "Mininglamp-OSS/octo-channel-gateway";
const registry = "https://registry.npmjs.org";
const api = `https://api.github.com/repos/${repository}`;
const filename = (version) => `mininglamp-oss-octo-channel-gateway-${version}.tgz`;
export const integrityOf = (bytes) => `sha512-${createHash("sha512").update(bytes).digest("base64")}`;

// 限制每次 HTTP 请求的时间和响应大小；只重试只读操作，写入丢 ACK 由下次恢复确认。
async function request(url, { token, method = "GET", body, binary = false, accept = binary ? "application/octet-stream" : "application/json", allow404 = false } = {}) {
  let response;
  try {
    response = await fetch(url, {
      method, signal: AbortSignal.timeout(30_000),
      headers: { Accept: accept, "User-Agent": "octo-channel-gateway-release",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { "Content-Type": Buffer.isBuffer(body) ? "application/octet-stream" : "application/json" } : {}) },
      ...(body ? { body: Buffer.isBuffer(body) ? body : JSON.stringify(body) } : {}),
    });
    if (response.status === 404 && allow404) { await response.body?.cancel(); return null; }
    if (!response.ok) {
      await response.body?.cancel();
      const error = new Error(`HTTP ${response.status} from ${new URL(url).hostname}`);
      error.retryable = response.status >= 500 || response.status === 429;
      throw error;
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > 32 * 1024 * 1024) throw new Error("Release response exceeds 32 MiB");
      chunks.push(chunk);
    }
    const bytes = Buffer.concat(chunks);
    return binary ? bytes : bytes.length ? JSON.parse(bytes.toString("utf8")) : null;
  } catch (error) {
    if (!response || ["AbortError", "TimeoutError"].includes(error.name) || error instanceof TypeError) error.retryable = true;
    throw error;
  }
}

async function readRequest(url, options = {}) {
  for (let attempt = 0; ; attempt++) {
    try { return await request(url, options); }
    catch (error) {
      if (!error.retryable || attempt >= 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
}

/** 包元数据和构建来源必须同时匹配；恢复旧版本不以新构建产物替代原发布物。 */
export async function inspectArchive(path, version, sha) {
  const absolute = resolve(path);
  const readEntry = async (entry) => JSON.parse((await execute("tar", ["-xOf", absolute, `package/${entry}`], {
    timeout: 30_000, maxBuffer: 2 * 1024 * 1024,
  })).stdout);
  const manifest = await readEntry("package.json");
  const info = await readEntry("dist/apps/cli/src/build-info.json");
  if (manifest.name !== packageName || manifest.version !== version || info.commit !== sha || info.dirty !== false)
    throw new Error("Archive package/version/source commit does not match the validated clean release tag");
  return { path: absolute, integrity: integrityOf(await readFile(absolute)) };
}

export function createReleaseClient(directory, { token = process.env.GH_TOKEN, log = console.log } = {}) {
  const gh = (path, options = {}) => readRequest(`${api}${path}`, { token, ...options });
  const mutate = (path, method, body) => {
    if (!token) throw new Error("GH_TOKEN is required to publish GitHub Releases");
    return request(`${api}${path}`, { token, method, body });
  };
  const getRelease = async (version) => {
    const published = await gh(`/releases/tags/v${version}`, { allow404: true });
    if (published) return published;
    // tag 查询不保证返回草稿；认证列表用于恢复创建草稿后中断的上传。
    const matches = [];
    for (let page = 1; ; page++) {
      const batch = await gh(`/releases?per_page=100&page=${page}`);
      matches.push(...batch.filter((release) => release.tag_name === `v${version}`));
      if (batch.length < 100) break;
    }
    if (matches.length > 1) throw new Error("Multiple Releases reference the same tag; inspect before recovery");
    return matches[0] ?? null;
  };
  const verifyTag = async (version, sha) => {
    const ref = await gh(`/git/ref/tags/v${version}`);
    if (ref.object?.type !== "tag") throw new Error("Release tag must still be annotated");
    const tag = await gh(`/git/tags/${ref.object.sha}`);
    if (tag.object?.type !== "commit" || tag.object.sha !== sha)
      throw new Error("Release tag changed after validation; refusing to create or modify a Release");
  };
  const registryMetadata = async (version) => {
    const value = await readRequest(`${registry}/${packageName}/${version}`, { allow404: true });
    if (!value) return null;
    if (value.name !== packageName || (version !== "latest" && value.version !== version) ||
        typeof value.dist?.integrity !== "string" || typeof value.dist?.tarball !== "string")
      throw new Error("Invalid registry package metadata");
    releaseVersion(`v${value.version}`);
    verifyIntegrity(value.dist.integrity, value.dist.integrity);
    return { version: value.version, integrity: value.dist.integrity, tarball: value.dist.tarball };
  };
  const downloadPublished = async (version, metadata, sha) => {
    const url = new URL(metadata.tarball);
    if (url.origin !== registry || url.username || url.password || url.search || url.hash)
      throw new Error("Published archive must come from the official npm registry");
    const bytes = await readRequest(url.href, { binary: true });
    verifyIntegrity(integrityOf(bytes), metadata.integrity);
    const path = join(directory, filename(version));
    await writeFile(path, bytes, { mode: 0o600 });
    return inspectArchive(path, version, sha);
  };
  const assets = async (release) => {
    const result = [];
    for (let page = 1; ; page++) {
      const batch = await gh(`/releases/${release.id}/assets?per_page=100&page=${page}`);
      result.push(...batch);
      if (batch.length < 100) return result;
    }
  };
  const verifyAsset = async (release, version, integrity) => {
    const matches = (await assets(release)).filter((asset) => asset.name === filename(version));
    if (!matches.length) return false;
    if (matches.length !== 1 || matches[0].state !== "uploaded") throw new Error("Conflicting or incomplete Release asset");
    const bytes = await gh(`/releases/assets/${matches[0].id}`, { binary: true, accept: "application/octet-stream" });
    verifyIntegrity(integrityOf(bytes), integrity);
    return true;
  };
  const notes = async (version, sha) => {
    const generated = await mutate("/releases/generate-notes", "POST", { tag_name: `v${version}`, target_commitish: sha });
    // 首次发行没有上一 tag，仍提供完整源码历史入口。
    return generated.body.includes("Full Changelog") ? generated.body
      : `${generated.body}\n\n**Full Changelog**: https://github.com/${repository}/commits/v${version}`;
  };
  return {
    log, inspectArchive, verifyTag, registry: registryMetadata, downloadPublished,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    async publish(path, version) {
      if (!process.env.NODE_AUTH_TOKEN) throw Object.assign(new Error("Configure NPM_TOKEN before publishing"), { fatal: true });
      log(`Uploading verified archive ${version} under release-${version}; latest promotion follows confirmation`);
      try {
        await execute("npm", ["publish", path, "--ignore-scripts", "--access", "public", "--provenance", "--tag", `release-${version}`],
          { timeout: 5 * 60_000, maxBuffer: 2 * 1024 * 1024 });
      } catch (error) {
        if (/\b(E401|E403|ENEEDAUTH|EOTP)\b/.test(error.stderr ?? ""))
          throw Object.assign(new Error("npm rejected authentication or publish permission; check NPM_TOKEN"), { fatal: true });
        throw new Error("npm upload result is uncertain; registry confirmation is required");
      }
    },
    async ensureRelease(version, sha, artifact) {
      await verifyTag(version, sha);
      let release = await getRelease(version);
      if (!release) release = await mutate("/releases", "POST", {
        tag_name: `v${version}`, target_commitish: sha, name: version, body: await notes(version, sha),
        draft: true, prerelease: false, make_latest: "false",
      });
      if (release.prerelease) throw new Error("Stable tag has a prerelease GitHub Release; inspect before recovery");
      if (!(await verifyAsset(release, version, artifact.integrity))) {
        await request(`https://uploads.github.com/repos/${repository}/releases/${release.id}/assets?name=${filename(version)}`, {
          token, method: "POST", body: await readFile(artifact.path),
        });
      }
      if (!(await verifyAsset(release, version, artifact.integrity))) throw new Error("Release asset verification failed");
      if (release.draft || !release.body?.trim()) await mutate(`/releases/${release.id}`, "PATCH", {
        draft: false, make_latest: "false", ...(!release.body?.trim() ? { body: await notes(version, sha) } : {}),
      });
      release = await getRelease(version);
      if (!release || release.draft || !release.body?.trim()) throw new Error("Published Release not confirmed");
    },
    async latest() {
      const npm = await registryMetadata("latest");
      const github = await gh("/releases/latest", { allow404: true });
      return { npm: npm?.version ?? null, github: github ? releaseVersion(github.tag_name) : null };
    },
    async verifyComplete(version) {
      const metadata = await registryMetadata(version), release = await getRelease(version);
      if (!metadata || !release || release.draft || release.prerelease || !release.body?.trim() ||
          !(await verifyAsset(release, version, metadata.integrity)))
        throw new Error(`Version ${version} is not complete in npm and GitHub; repair it before latest promotion`);
    },
    async promoteNpm(version) {
      await execute("npm", ["dist-tag", "add", `${packageName}@${version}`, "latest", "--registry", registry], { timeout: 60_000 });
    },
    async promoteGithub(version) {
      const release = await getRelease(version);
      await mutate(`/releases/${release.id}`, "PATCH", { make_latest: "true" });
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const directory = await mkdtemp(join(tmpdir(), "gateway-release-"));
  try {
    const version = releaseVersion(`v${process.env.VERSION}`);
    const sha = process.env.RELEASE_SHA;
    if (!/^[a-f0-9]{40}$/.test(sha ?? "")) throw new Error("Validated RELEASE_SHA is required");
    await publishRelease(createReleaseClient(directory), {
      version, sha, archive: `./release/${filename(version)}`,
      dryRun: process.env.DRY_RUN === "true", recoverExisting: process.env.RECOVER_EXISTING === "true",
    });
  } catch (error) {
    console.error(`Release failed: ${error.message}`);
    process.exitCode = 1;
  } finally { await rm(directory, { recursive: true, force: true }); }
}
