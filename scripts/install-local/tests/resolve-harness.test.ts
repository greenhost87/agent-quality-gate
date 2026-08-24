import { describe, expect, it } from 'bun:test';

import { resolveHarnessSelection } from '../resolve-harness.js';

describe('resolveHarnessSelection', () => {
  it('uses flags when present and skips the prompt', () => {
    expect(
      resolveHarnessSelection({
        piFlag: true,
        cursorFlag: false,
        claudeFlag: false,
        codexFlag: false,
        isTTY: true,
        prompt: () => 'all',
      }),
    ).toEqual({ wirePi: true, wireCursor: false, wireClaude: false, wireCodex: false });
  });

  it('wires Claude when --claude is set alone or with other harness flags', () => {
    expect(
      resolveHarnessSelection({
        piFlag: false,
        cursorFlag: false,
        claudeFlag: true,
        codexFlag: false,
        isTTY: false,
        prompt: () => {
          throw new Error('prompt must not run');
        },
      }),
    ).toEqual({ wirePi: false, wireCursor: false, wireClaude: true, wireCodex: false });
    expect(
      resolveHarnessSelection({
        piFlag: true,
        cursorFlag: true,
        claudeFlag: true,
        codexFlag: false,
        isTTY: false,
        prompt: () => {
          throw new Error('prompt must not run');
        },
      }),
    ).toEqual({ wirePi: true, wireCursor: true, wireClaude: true, wireCodex: false });
  });

  it('wires Codex when --codex is set alone or with other harness flags', () => {
    expect(
      resolveHarnessSelection({
        piFlag: false,
        cursorFlag: false,
        claudeFlag: false,
        codexFlag: true,
        isTTY: false,
        prompt: () => {
          throw new Error('prompt must not run');
        },
      }),
    ).toEqual({ wirePi: false, wireCursor: false, wireClaude: false, wireCodex: true });
    expect(
      resolveHarnessSelection({
        piFlag: true,
        cursorFlag: true,
        claudeFlag: true,
        codexFlag: true,
        isTTY: false,
        prompt: () => {
          throw new Error('prompt must not run');
        },
      }),
    ).toEqual({ wirePi: true, wireCursor: true, wireClaude: true, wireCodex: true });
  });

  it('does not wire Claude when --pi is set without --claude', () => {
    expect(
      resolveHarnessSelection({
        piFlag: true,
        cursorFlag: false,
        claudeFlag: false,
        codexFlag: false,
        isTTY: false,
        prompt: () => {
          throw new Error('prompt must not run');
        },
      }),
    ).toEqual({ wirePi: true, wireCursor: false, wireClaude: false, wireCodex: false });
  });

  it('installs every harness when no flags and not a TTY', () => {
    expect(
      resolveHarnessSelection({
        piFlag: false,
        cursorFlag: false,
        claudeFlag: false,
        codexFlag: false,
        isTTY: false,
        prompt: () => {
          throw new Error('prompt must not run');
        },
      }),
    ).toEqual({ wirePi: true, wireCursor: true, wireClaude: true, wireCodex: true });
  });

  it('asks when no flags and stdin is a TTY', () => {
    expect(
      resolveHarnessSelection({
        piFlag: false,
        cursorFlag: false,
        claudeFlag: false,
        codexFlag: false,
        isTTY: true,
        prompt: () => 'cursor',
      }),
    ).toEqual({ wirePi: false, wireCursor: true, wireClaude: false, wireCodex: false });
    expect(
      resolveHarnessSelection({
        piFlag: false,
        cursorFlag: false,
        claudeFlag: false,
        codexFlag: false,
        isTTY: true,
        prompt: () => 'claude',
      }),
    ).toEqual({ wirePi: false, wireCursor: false, wireClaude: true, wireCodex: false });
    expect(
      resolveHarnessSelection({
        piFlag: false,
        cursorFlag: false,
        claudeFlag: false,
        codexFlag: false,
        isTTY: true,
        prompt: () => 'codex',
      }),
    ).toEqual({ wirePi: false, wireCursor: false, wireClaude: false, wireCodex: true });
  });
});
