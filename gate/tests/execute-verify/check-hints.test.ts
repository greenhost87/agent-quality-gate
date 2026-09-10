import { describe, expect, it } from 'bun:test';

import {
  attachHintOwners,
  collectCheckHints,
  isSafeHintSegment,
  resolveCheckHints,
} from '../../execute-verify/check-hints.js';

describe('check hints', () => {
  it('attaches the activated preset as document owner', () => {
    expect(
      attachHintOwners(
        [
          { kind: 'document', id: 'sample-check', body: '# sample\n' },
          { kind: 'builtin', id: 'avoid-micro-splits' },
        ],
        'optional-alpha',
      ),
    ).toEqual([
      { kind: 'document', id: 'sample-check', body: '# sample\n', owner: 'optional-alpha' },
      { kind: 'builtin', id: 'avoid-micro-splits' },
    ]);
  });

  it('deduplicates identical hints and keeps independent owners separate', () => {
    const resolved = resolveCheckHints([
      {
        kind: 'document',
        id: 'sample-check',
        owner: 'optional-alpha',
        body: '# sample\n',
      },
      {
        kind: 'document',
        id: 'sample-check',
        owner: 'optional-alpha',
        body: '# sample\n',
      },
      {
        kind: 'document',
        id: 'sample-check',
        owner: 'optional-beta',
        body: '# other owner\n',
      },
      { kind: 'builtin', id: 'avoid-micro-splits' },
      { kind: 'builtin', id: 'avoid-micro-splits' },
    ]);
    expect(resolved).toHaveLength(3);
    expect(
      resolved
        .filter((hint) => hint.kind === 'document')
        .map((hint) => hint.owner)
        .sort(),
    ).toEqual(['optional-alpha', 'optional-beta']);
  });

  it('rejects conflicting bodies, missing owners, and unsafe segments', () => {
    expect(() =>
      resolveCheckHints([
        {
          kind: 'document',
          id: 'sample-check',
          owner: 'optional-alpha',
          body: '# one\n',
        },
        {
          kind: 'document',
          id: 'sample-check',
          owner: 'optional-alpha',
          body: '# two\n',
        },
      ]),
    ).toThrow(/conflicting document hint body/);
    expect(() =>
      resolveCheckHints([{ kind: 'document', id: 'sample-check', body: '# sample\n' }]),
    ).toThrow(/missing owner/);
    expect(isSafeHintSegment('../escape')).toBe(false);
    expect(isSafeHintSegment('sample-check')).toBe(true);
  });

  it('collects hints across merged tool results', () => {
    expect(
      collectCheckHints([
        { hints: [{ kind: 'builtin', id: 'avoid-micro-splits' }] },
        {},
        {
          hints: [
            {
              kind: 'document',
              id: 'sample-check',
              owner: 'optional-alpha',
              body: '# sample\n',
            },
          ],
        },
      ]),
    ).toEqual([
      { kind: 'builtin', id: 'avoid-micro-splits' },
      {
        kind: 'document',
        id: 'sample-check',
        owner: 'optional-alpha',
        body: '# sample\n',
      },
    ]);
  });
});
