import { describe, expect, test } from 'bun:test';

import {
  listFallowDiscoveredFiles,
  parseFallowDiscoveredFiles,
} from '../../preflight/fallow-analysis.js';

describe('parseFallowDiscoveredFiles', () => {
  test('distinguishes malformed JSON from an invalid discovered-files shape', () => {
    expect(() => parseFallowDiscoveredFiles('{', 'verify: ')).toThrow(
      'verify: fallow list returned malformed JSON',
    );
    expect(() => parseFallowDiscoveredFiles('{}', 'verify: ')).toThrow(
      'verify: fallow list returned JSON that does not match the discovered-files schema',
    );
  });

  test('returns a structured failure when list configuration setup fails', async () => {
    const result = await listFallowDiscoveredFiles({
      projectRoot: import.meta.dir,
      fallowConfigPath: '/missing/fallow-config.json',
      listIgnorePatterns: ['generated/**'],
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.result.exitCode).toBe(1);
    expect(result.result.stderr).toContain('verify: failed to prepare fallow list:');
  });
});
