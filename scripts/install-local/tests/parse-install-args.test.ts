import { describe, expect, it } from 'bun:test';

import { parseInstallArgs, INSTALL_USAGE } from '../parse-install-args.js';

const DEFAULT_PREFIX = '/tmp/aqg-install';

describe('parseInstallArgs', () => {
  it('defaults to latest download with both harnesses unset', () => {
    expect(parseInstallArgs([], DEFAULT_PREFIX)).toEqual({
      prefix: DEFAULT_PREFIX,
      version: undefined,
      localBuild: false,
      wireOnly: false,
      piFlag: false,
      cursorFlag: false,
      claudeFlag: false,
      codexFlag: false,
    });
  });

  it('accepts --pi and --cursor as positive harness selectors', () => {
    expect(parseInstallArgs(['--pi'], DEFAULT_PREFIX)).toMatchObject({
      piFlag: true,
      cursorFlag: false,
      claudeFlag: false,
      codexFlag: false,
    });
    expect(parseInstallArgs(['--cursor', '--pi'], DEFAULT_PREFIX)).toMatchObject({
      piFlag: true,
      cursorFlag: true,
      claudeFlag: false,
      codexFlag: false,
    });
  });

  it('accepts --claude alone and with --pi/--cursor', () => {
    expect(parseInstallArgs(['--claude'], DEFAULT_PREFIX)).toMatchObject({
      piFlag: false,
      cursorFlag: false,
      claudeFlag: true,
      codexFlag: false,
    });
    expect(parseInstallArgs(['--claude', '--pi', '--cursor'], DEFAULT_PREFIX)).toMatchObject({
      piFlag: true,
      cursorFlag: true,
      claudeFlag: true,
      codexFlag: false,
    });
  });

  it('accepts --codex alone and with other harness flags', () => {
    expect(parseInstallArgs(['--codex'], DEFAULT_PREFIX)).toMatchObject({
      piFlag: false,
      cursorFlag: false,
      claudeFlag: false,
      codexFlag: true,
    });
    expect(
      parseInstallArgs(['--codex', '--pi', '--cursor', '--claude'], DEFAULT_PREFIX),
    ).toMatchObject({
      piFlag: true,
      cursorFlag: true,
      claudeFlag: true,
      codexFlag: true,
    });
  });

  it('mentions --claude and --codex in help', () => {
    expect(INSTALL_USAGE).toContain('--claude');
    expect(INSTALL_USAGE).toContain('--codex');
  });

  it('documents local-build preflight gates in help', () => {
    expect(INSTALL_USAGE).toMatch(/--local-build\s+Verify, test, run pack integration tests/);
  });

  it('rejects --no-pi and --no-cursor', () => {
    expect(() => parseInstallArgs(['--no-pi'], DEFAULT_PREFIX)).toThrow(/unexpected argument/);
    expect(() => parseInstallArgs(['--no-cursor'], DEFAULT_PREFIX)).toThrow(/unexpected argument/);
  });

  it('rejects --local-build with --version', () => {
    expect(() => parseInstallArgs(['--local-build', '--version', '0.3.5'], DEFAULT_PREFIX)).toThrow(
      /cannot be used together/,
    );
  });

  it('returns help for -h', () => {
    expect(parseInstallArgs(['-h'], DEFAULT_PREFIX)).toBe('help');
  });
});
