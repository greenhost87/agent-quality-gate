import { describe, expect, test } from 'bun:test';

import {
  checkResultForNonzeroFallowList,
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
    expect(result.result.opaqueText ?? result.result.failures?.[0]?.message ?? '').toContain(
      'verify: failed to prepare fallow list:',
    );
  });

  test('nonzero fallow list with empty streams includes a fallback message', () => {
    const result = checkResultForNonzeroFallowList(2, '', '', 'verify: ');
    expect(result.exitCode).toBe(2);
    expect(result.failures?.[0]?.message).toBe(
      'verify: fallow list exited with code 2 and no output',
    );
    expect(result.opaqueText).toBeUndefined();
  });

  test('nonzero fallow list keeps joined tool output when present', () => {
    const result = checkResultForNonzeroFallowList(1, 'stdout-part', 'stderr-part', 'verify: ');
    expect(result.exitCode).toBe(1);
    expect(result.opaqueText?.split(/\n/u)).toEqual(['stdout-part', 'stderr-part']);
    expect(result.failures).toBeUndefined();
  });
});
