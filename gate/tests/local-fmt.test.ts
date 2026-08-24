import { describe, expect, it } from 'bun:test';

import { repositoryOxfmtArgs } from '../../scripts/self-fmt/self-fmt.js';

describe('local fmt', () => {
  it('excludes packs with fmt scripts from the repository oxfmt args', () => {
    expect(repositoryOxfmtArgs(['config', 'database'])).toEqual([
      '.',
      '!presets/config/**',
      '!presets/database/**',
    ]);
  });

  it('formats only the repository tree when no packs declare fmt', () => {
    expect(repositoryOxfmtArgs([])).toEqual(['.']);
  });
});
