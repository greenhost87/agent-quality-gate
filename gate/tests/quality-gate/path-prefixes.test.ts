import { describe, expect, it } from 'bun:test';

import {
  buildPathPrefixDictionary,
  expandPath,
  shortenPath,
} from '../../quality-gate-run/path-prefixes.js';

describe('path prefix dictionary', () => {
  it('R11: never adds a prefix with negative incremental savings', () => {
    const prefix = 'app/components/features/very-long-feature-directory';
    const paths = Array.from({ length: 12 }, (_, index) => `${prefix}/item-${String(index)}.tsx`);
    const dictionary = buildPathPrefixDictionary(paths);
    expect(dictionary.aliases).toEqual([{ alias: '@p1', prefix }]);
    for (const alias of dictionary.aliases) {
      expect(
        paths.some((path) => shortenPath(path, dictionary.aliases).startsWith(`${alias.alias}/`)),
      ).toBe(true);
    }
  });

  it('round-trips shortened paths and reduces length with a legend', () => {
    const paths = [
      'app/components/features/fabrics/fabric-editor/fabric-editor.tsx',
      'app/components/features/fabrics/fabric-editor/fabric-editor-attributes.tsx',
      'app/components/features/fabrics/fabric-editor/fabric-editor-chrome.tsx',
      'app/components/features/fabrics/fabric-card/fabric-card.tsx',
    ];
    const dictionary = buildPathPrefixDictionary(paths);
    expect(dictionary.aliases.length).toBeGreaterThan(0);
    const shortened = paths.map((path) => shortenPath(path, dictionary.aliases));
    for (let index = 0; index < paths.length; index += 1) {
      const original = paths[index];
      const shortenedPath = shortened[index];
      expect(original).toBeDefined();
      expect(shortenedPath).toBeDefined();
      if (original === undefined || shortenedPath === undefined) {
        continue;
      }
      expect(expandPath(shortenedPath, dictionary.aliases)).toBe(original);
    }
    const originalSize = paths.join('\n').length;
    const shortenedSize = dictionary.legend.length + shortened.join('\n').length;
    expect(shortenedSize).toBeLessThan(originalSize);
  });

  it('does not shorten when aliases would not save characters', () => {
    const paths = ['a/b.ts', 'c/d.ts'];
    const dictionary = buildPathPrefixDictionary(paths);
    expect(dictionary.aliases).toEqual([]);
  });

  it('refuses shortening when a real path looks like an alias', () => {
    const paths = ['@p1/foo.ts', '@p1/bar.ts'];
    const dictionary = buildPathPrefixDictionary(paths);
    expect(dictionary.aliases).toEqual([]);
  });

  it('preserves Next.js bracket segments and basenames', () => {
    const paths = ['app/api/packing/[id]/items/[itemId]/route.ts', 'app/api/packing/[id]/route.ts'];
    const dictionary = buildPathPrefixDictionary(paths);
    for (const path of paths) {
      const shortened = shortenPath(path, dictionary.aliases);
      expect(shortened.endsWith('route.ts')).toBe(true);
      expect(expandPath(shortened, dictionary.aliases)).toBe(path);
      expect(shortened.includes('[id]')).toBe(true);
    }
  });
});
