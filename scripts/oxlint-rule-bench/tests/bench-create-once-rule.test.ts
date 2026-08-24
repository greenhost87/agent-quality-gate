import { describe, expect, it } from 'bun:test';
import { defineRule } from '@oxlint/plugins';

import { benchCreateOnceRule, replayCreateOnceRule } from '../bench-create-once-rule.js';

const createOnlyRule = {
  meta: { type: 'problem' as const, schema: [], messages: { x: 'x' } },
  create() {
    return {
      Program() {},
    };
  },
};

const countingRule = defineRule({
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      hit: 'hit',
    },
  },
  createOnce(context) {
    let calls = 0;
    return {
      before() {
        calls = 0;
      },
      CallExpression(node) {
        calls += 1;
        if (node.callee.type === 'Identifier' && node.callee.name === 'boom') {
          context.report({ node, messageId: 'hit' });
        }
      },
      after() {
        if (calls === 0) {
          return;
        }
      },
    };
  },
});

describe('replayCreateOnceRule', () => {
  it('rejects rules that only expose create', () => {
    expect(() =>
      replayCreateOnceRule({
        ruleId: 'test/create-only',
        rule: createOnlyRule,
        cases: [{ name: 'empty', code: 'void 0;' }],
      }),
    ).toThrow(/createOnce/);
  });

  it('parses outside replay and reports from createOnce visitors', () => {
    const result = replayCreateOnceRule({
      ruleId: 'test/counting',
      rule: countingRule,
      cases: [
        {
          name: 'hot',
          code: 'boom(); boom(); quiet();',
          filename: '/tmp/hot.ts',
        },
      ],
    });

    expect(result.cases).toHaveLength(1);
    expect(result.cases[0]?.reports).toHaveLength(2);
    expect(result.cases[0]?.reports[0]?.messageId).toBe('hit');
  });

  it('honors before returning false by skipping the walk', () => {
    const skipRule = defineRule({
      meta: { type: 'problem', schema: [], messages: { hit: 'hit' } },
      createOnce(context) {
        return {
          before() {
            return false;
          },
          Program(node) {
            context.report({ node, messageId: 'hit' });
          },
        };
      },
    });

    const result = replayCreateOnceRule({
      ruleId: 'test/skip',
      rule: skipRule,
      cases: [{ name: 'skipped', code: 'export {};' }],
    });

    expect(result.cases[0]?.reports).toHaveLength(0);
  });
});

describe('benchCreateOnceRule', () => {
  it('runs mitata for a createOnce rule without throwing', async () => {
    await benchCreateOnceRule({
      name: 'counting',
      ruleId: 'test/counting',
      rule: countingRule,
      cases: [{ name: 'hot', code: 'boom(); quiet();' }],
    });
  });
});
