import { describe, expect, it } from 'bun:test';

describe('consumer inline fixture', () => {
  it('embeds program source', () => {
    const source = ['export function helper() {', '  return 1;', '}'].join('\n');
    expect(source).toContain('helper');
  });
});
