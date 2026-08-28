import { describe, expect, it } from 'bun:test';

import { parseSelfTestArgs, SELF_TEST_USAGE } from '../self-test.js';

describe('parseSelfTestArgs', () => {
  it('defaults to unit mode', () => {
    expect(parseSelfTestArgs([])).toEqual({ mode: 'unit' });
  });

  it('accepts --integration', () => {
    expect(parseSelfTestArgs(['--integration'])).toEqual({ mode: 'integration' });
  });

  it('returns help for -h and --help', () => {
    expect(parseSelfTestArgs(['-h'])).toBe('help');
    expect(parseSelfTestArgs(['--help'])).toBe('help');
  });

  it('documents default unit and --integration', () => {
    expect(SELF_TEST_USAGE).toContain('(default)');
    expect(SELF_TEST_USAGE).toContain('--integration');
    expect(SELF_TEST_USAGE).toContain('test:integration');
  });

  it('rejects unknown flags and positionals', () => {
    expect(() => parseSelfTestArgs(['--dry-run'])).toThrow();
    expect(() => parseSelfTestArgs(['extra'])).toThrow(/unexpected argument/);
  });
});
