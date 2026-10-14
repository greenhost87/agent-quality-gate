import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import * as v from 'valibot';

import { writeBytesFile } from '#system/process/files/files.js';

export const GITHUB_REPO = 'greenhost87/agent-quality-gate';

const TARBALL_NAME = /^agent-quality-gate-.+\.tgz$/;
const ReleaseAssetSchema = v.object({
  name: v.string(),
  browser_download_url: v.string(),
});
const GithubReleaseSchema = v.object({
  tag_name: v.pipe(v.string(), v.minLength(1)),
  assets: v.array(v.looseObject({})),
});
const ReleasePayloadSchema = v.pipe(v.string(), v.parseJson(), v.looseObject({}));

export function releaseApiUrl(version: string | undefined): string {
  if (version === undefined) {
    return `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
  }
  const tag = version.startsWith('v') ? version : `v${version}`;
  return `https://api.github.com/repos/${GITHUB_REPO}/releases/tags/${tag}`;
}

export function selectReleaseTarballAsset(release: GithubRelease): GithubReleaseAsset {
  const asset = release.assets.find((entry) => TARBALL_NAME.test(entry.name));
  if (asset === undefined) {
    throw new Error(`GitHub release ${release.tag_name} has no agent-quality-gate-*.tgz asset`);
  }
  return asset;
}

export function parseGithubRelease(payload: object): GithubRelease {
  const release = v.safeParse(GithubReleaseSchema, payload);
  if (!release.success) {
    throw new Error('GitHub release payload is invalid');
  }
  const assets: GithubReleaseAsset[] = [];
  for (const entry of release.output.assets) {
    const asset = v.safeParse(ReleaseAssetSchema, entry);
    if (asset.success) {
      assets.push(asset.output);
    }
  }
  return { tag_name: release.output.tag_name, assets };
}

export async function downloadReleaseTarball(
  version: string | undefined,
  destinationDir: string,
): Promise<string> {
  const apiResponse = await fetch(releaseApiUrl(version), {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'agent-quality-gate-install',
    },
  });
  if (!apiResponse.ok) {
    throw new Error(
      `GitHub release lookup failed (${String(apiResponse.status)}): ${releaseApiUrl(version)}`,
    );
  }
  const payload = v.parse(ReleasePayloadSchema, await apiResponse.text());
  const release = parseGithubRelease(payload);
  const asset = selectReleaseTarballAsset(release);
  const tarballResponse = await fetch(asset.browser_download_url, {
    headers: { 'User-Agent': 'agent-quality-gate-install' },
    redirect: 'follow',
  });
  if (!tarballResponse.ok) {
    throw new Error(
      `download failed (${String(tarballResponse.status)}): ${asset.browser_download_url}`,
    );
  }
  const bytes = new Uint8Array(await tarballResponse.arrayBuffer());
  mkdirSync(destinationDir, { recursive: true });
  const tarballPath = join(destinationDir, asset.name);
  await writeBytesFile(tarballPath, bytes);
  return tarballPath;
}

export function pinnedTarballPath(artifactsDir: string, packageVersion: string): string {
  return join(artifactsDir, `agent-quality-gate-${packageVersion}.tgz`);
}

export type GithubReleaseAsset = {
  name: string;
  browser_download_url: string;
};

export type GithubRelease = {
  tag_name: string;
  assets: readonly GithubReleaseAsset[];
};
