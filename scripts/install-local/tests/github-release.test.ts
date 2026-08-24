import { describe, expect, it } from 'bun:test';

import { parseGithubRelease, releaseApiUrl, selectReleaseTarballAsset } from '../github-release.js';

describe('github-release', () => {
  it('builds latest and tagged API URLs', () => {
    expect(releaseApiUrl(undefined)).toBe(
      'https://api.github.com/repos/greenhost87/agent-quality-gate/releases/latest',
    );
    expect(releaseApiUrl('0.3.5')).toBe(
      'https://api.github.com/repos/greenhost87/agent-quality-gate/releases/tags/v0.3.5',
    );
    expect(releaseApiUrl('v0.3.5')).toBe(
      'https://api.github.com/repos/greenhost87/agent-quality-gate/releases/tags/v0.3.5',
    );
  });

  it('selects the agent-quality-gate tarball asset', () => {
    const release = parseGithubRelease({
      tag_name: 'v0.3.5',
      assets: [
        { name: 'notes.txt', browser_download_url: 'https://example.test/notes.txt' },
        {
          name: 'agent-quality-gate-0.3.5.tgz',
          browser_download_url: 'https://example.test/agent-quality-gate-0.3.5.tgz',
        },
      ],
    });
    expect(selectReleaseTarballAsset(release)).toEqual({
      name: 'agent-quality-gate-0.3.5.tgz',
      browser_download_url: 'https://example.test/agent-quality-gate-0.3.5.tgz',
    });
  });

  it('fails when the release has no tarball asset', () => {
    const release = parseGithubRelease({ tag_name: 'v0.3.5', assets: [] });
    expect(() => selectReleaseTarballAsset(release)).toThrow(/no agent-quality-gate-\*\.tgz/);
  });
});
