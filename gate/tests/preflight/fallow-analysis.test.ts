import { describe, expect, test } from 'bun:test';

import { parseFallowDiscoveredFiles } from '../../preflight/fallow-analysis.js';

describe('parseFallowDiscoveredFiles', () => {
  test('distinguishes malformed JSON from an invalid discovered-files shape', () => {
    expect(() => parseFallowDiscoveredFiles('{', 'verify: ')).toThrow(
      'verify: fallow list returned malformed JSON',
    );
    expect(() => parseFallowDiscoveredFiles('{}', 'verify: ')).toThrow(
      'verify: fallow list returned JSON that does not match the discovered-files schema',
    );
  });
});
