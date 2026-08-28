import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';

import { SHIPPED_PRESET_NAMES } from '../../../preset-catalog/catalog/preset-catalog.js';
import { optionalPresetSourceRoots } from '../install-optional-presets.js';

const REPO_PRESETS = join(import.meta.dir, '../../..', 'presets');

describe('optionalPresetSourceRoots', () => {
  it('lists optional preset directories with manifest.json', () => {
    const roots = optionalPresetSourceRoots(REPO_PRESETS);
    expect(roots.length).toBeGreaterThan(0);
    expect(roots.some((root) => root.endsWith('/react-duplication'))).toBe(true);
    expect(roots.some((root) => root.endsWith('/oxlint-ui-surface'))).toBe(true);
    for (const shipped of SHIPPED_PRESET_NAMES) {
      expect(roots.some((root) => root.endsWith(`/${shipped}`))).toBe(false);
    }
  });

  it('returns empty when presets directory is missing', () => {
    expect(optionalPresetSourceRoots(join(REPO_PRESETS, 'missing-directory'))).toEqual([]);
  });
});
