import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import * as v from 'valibot';

import { writeBytesFile } from '../../process/files/files.js';
import { parseGithubRelease, releaseApiUrl, selectReleaseTarballAsset } from './github-release.js';

const ReleasePayloadSchema = v.pipe(v.string(), v.parseJson(), v.looseObject({}));

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
