import { describe, expect, it } from 'bun:test';

import { runVerifyCli } from '../src/index.js';

describe('agent-quality-gate smoke', () => {
  it('exports CLI runner', () => {
    expect(typeof runVerifyCli).toBe('function');
  });
});
