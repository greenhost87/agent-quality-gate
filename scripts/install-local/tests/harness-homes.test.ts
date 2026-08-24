import { describe, expect, it } from 'bun:test';

import { applyHarnessPresence } from '../harness-homes.js';

describe('applyHarnessPresence', () => {
  it('keeps selected harnesses when homes exist', () => {
    expect(
      applyHarnessPresence(
        { wirePi: true, wireCursor: true, wireClaude: true, wireCodex: true },
        {
          piHomePresent: true,
          cursorHomePresent: true,
          claudeHomePresent: true,
          codexHomePresent: true,
        },
      ),
    ).toEqual({ wirePi: true, wireCursor: true, wireClaude: true, wireCodex: true });
  });

  it('skips harnesses whose home directory is missing', () => {
    expect(
      applyHarnessPresence(
        { wirePi: true, wireCursor: true, wireClaude: true, wireCodex: true },
        {
          piHomePresent: false,
          cursorHomePresent: true,
          claudeHomePresent: true,
          codexHomePresent: true,
        },
      ),
    ).toEqual({ wirePi: false, wireCursor: true, wireClaude: true, wireCodex: true });
    expect(
      applyHarnessPresence(
        { wirePi: true, wireCursor: true, wireClaude: true, wireCodex: true },
        {
          piHomePresent: true,
          cursorHomePresent: false,
          claudeHomePresent: true,
          codexHomePresent: true,
        },
      ),
    ).toEqual({ wirePi: true, wireCursor: false, wireClaude: true, wireCodex: true });
    expect(
      applyHarnessPresence(
        { wirePi: true, wireCursor: true, wireClaude: true, wireCodex: true },
        {
          piHomePresent: true,
          cursorHomePresent: true,
          claudeHomePresent: false,
          codexHomePresent: true,
        },
      ),
    ).toEqual({ wirePi: true, wireCursor: true, wireClaude: false, wireCodex: true });
    expect(
      applyHarnessPresence(
        { wirePi: true, wireCursor: true, wireClaude: true, wireCodex: true },
        {
          piHomePresent: true,
          cursorHomePresent: true,
          claudeHomePresent: true,
          codexHomePresent: false,
        },
      ),
    ).toEqual({ wirePi: true, wireCursor: true, wireClaude: true, wireCodex: false });
  });

  it('does not enable a harness that was not selected', () => {
    expect(
      applyHarnessPresence(
        { wirePi: false, wireCursor: true, wireClaude: false, wireCodex: false },
        {
          piHomePresent: true,
          cursorHomePresent: true,
          claudeHomePresent: true,
          codexHomePresent: true,
        },
      ),
    ).toEqual({ wirePi: false, wireCursor: true, wireClaude: false, wireCodex: false });
  });

  it('keeps a selected Codex wire when ~/.codex is present', () => {
    expect(
      applyHarnessPresence(
        { wirePi: false, wireCursor: false, wireClaude: false, wireCodex: true },
        {
          piHomePresent: false,
          cursorHomePresent: false,
          claudeHomePresent: false,
          codexHomePresent: true,
        },
      ),
    ).toEqual({ wirePi: false, wireCursor: false, wireClaude: false, wireCodex: true });
  });
});
