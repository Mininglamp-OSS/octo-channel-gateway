import { releaseVersion } from "./validate-release.mjs";

export function compareVersions(a, b) {
  releaseVersion(`v${a}`);
  releaseVersion(`v${b}`);
  const left = a.split(".").map(BigInt), right = b.split(".").map(BigInt);
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return left[i] > right[i] ? 1 : -1;
  return 0;
}

export function verifyIntegrity(actual, expected) {
  if (!/^sha512-[A-Za-z0-9+/]{86}==$/.test(expected) || actual !== expected)
    throw new Error("Archive integrity conflict; never overwrite or blindly republish an immutable version");
}

/** npm 上传 ACK 不是完成证明；缺失和暂态网络错误在共同截止时间内继续确认。 */
export async function waitForRegistry(client, version, integrity, {
  timeoutMs = 20 * 60_000, intervalMs = 15_000,
  now = Date.now, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  const deadline = now() + timeoutMs;
  while (true) {
    try {
      const metadata = await client.registry(version);
      if (metadata) {
        verifyIntegrity(metadata.integrity, integrity);
        return metadata;
      }
      client.log(`Waiting for npm ${version}: version not visible yet`);
    } catch (error) {
      if (!error.retryable) throw error;
      client.log(`Waiting for npm ${version}: transient registry/network error`);
    }
    if (now() >= deadline)
      throw new Error(`Registry confirmation timed out for ${version}; inspect the registry before retrying. Do not blindly republish.`);
    await sleep(Math.min(intervalMs, deadline - now()));
  }
}

/** 单包发布状态机：先不可变内容，后 Release，最后协调两个 latest 指针。 */
export async function publishRelease(client, { version, sha, archive, dryRun = false, recoverExisting = false, polling }) {
  releaseVersion(`v${version}`);
  let artifact = await client.inspectArchive(archive, version, sha);
  await client.verifyTag(version, sha);
  // 预检查失败必须停止，不能把网络故障当成版本不存在并上传。
  const existing = await client.registry(version);
  if (recoverExisting) {
    if (!existing) throw new Error("Recovery requires an already published npm version");
    artifact = await client.downloadPublished(version, existing, sha);
    verifyIntegrity(artifact.integrity, existing.integrity);
    client.log(`Recovery uses the original npm archive for ${version}; no republish or retag`);
  } else if (existing) verifyIntegrity(existing.integrity, artifact.integrity);
  if (dryRun) {
    client.log(`Dry run: verified ${version}; would ${existing ? "reuse" : "publish"} npm archive, verify Release/assets, then reconcile latest. No remote writes or visibility wait.`);
    return { version, dryRun: true };
  }
  if (!existing) {
    try { await client.publish(artifact.path, version); }
    catch (error) {
      if (error.fatal) throw error;
      client.log("npm publish did not acknowledge success; checking the registry without uploading again");
    }
  }
  await waitForRegistry(client, version, artifact.integrity, polling);
  await client.ensureRelease(version, sha, artifact);
  // 在两个指针中取更高版本；旧版本恢复不降级，也不能把未完成的版本晋升。
  let floor = version;
  const observe = (pointers) => {
    floor = [floor, pointers.npm, pointers.github].filter(Boolean).sort(compareVersions).at(-1);
    return floor;
  };
  for (let attempt = 0; attempt < 20; attempt++) {
    if (attempt) await client.sleep(3000);
    const pointers = await client.latest();
    const target = observe(pointers);
    await client.verifyComplete(target);
    const beforeNpm = await client.latest();
    if (compareVersions(observe(beforeNpm), target) > 0) continue;
    if (beforeNpm.npm !== target) await client.promoteNpm(target);
    // 重新读指针，避免在 npm 晋升期间有更新的发布被 GitHub latest 覆盖。
    const current = await client.latest();
    if (compareVersions(observe(current), target) > 0) continue;
    if (current.github !== target) await client.promoteGithub(target);
    const after = await client.latest();
    observe(after);
    if (after.npm === target && after.github === target) {
      client.log(`Finished ${version}: npm integrity, GitHub Release and package asset verified; latest=${target}`);
      return { version, latest: target };
    }
  }
  throw new Error("Latest pointers changed concurrently; rerun recovery to reconcile without downgrading");
}
