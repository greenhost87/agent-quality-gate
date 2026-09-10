import { describe, expect, it } from 'bun:test';

import { createOptionsRefCache } from '../options-ref-cache.ts';

describe('createOptionsRefCache', () => {
  it('parses once while options reference is stable', () => {
    let parses = 0;
    const options: Array<{ max: number }> = [{ max: 3 }];
    const cache = createOptionsRefCache((value: Array<{ max: number }>) => {
      parses += 1;
      return value[0]?.max ?? -1;
    });

    expect(cache.get(options)).toBe(3);
    expect(cache.get(options)).toBe(3);
    expect(cache.get(options)).toBe(3);
    expect(parses).toBe(1);
    expect(cache.parseCount()).toBe(1);
  });

  it('re-parses when options reference changes and does not leak prior values', () => {
    const cache = createOptionsRefCache((value: Array<{ label: string }>) => {
      return value[0]?.label ?? '';
    });
    const first = [{ label: 'a' }];
    const second = [{ label: 'b' }];

    expect(cache.get(first)).toBe('a');
    expect(cache.get(second)).toBe('b');
    expect(cache.get(first)).toBe('a');
    expect(cache.parseCount()).toBe(3);
  });

  it('treats equal-content distinct references as separate keys', () => {
    let parses = 0;
    const cache = createOptionsRefCache((value: Array<{ n: number }>) => {
      parses += 1;
      return value[0]?.n ?? -1;
    });
    expect(cache.get([{ n: 1 }])).toBe(1);
    expect(cache.get([{ n: 1 }])).toBe(1);
    expect(parses).toBe(2);
  });
});
