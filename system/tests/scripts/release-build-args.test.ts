import { expect, test } from 'bun:test';
import { parseReleaseBuildArgs } from '#system/scripts/build-release/build-release-package.ts';

test('release build defaults path prefixes to off and accepts explicit on/off', () => {
  expect(parseReleaseBuildArgs([])).toBe(false);
  expect(parseReleaseBuildArgs(['--path-prefixes=off'])).toBe(false);
  expect(parseReleaseBuildArgs(['--path-prefixes=on'])).toBe(true);
  expect(parseReleaseBuildArgs(['--path-prefixes', 'on'])).toBe(true);
});

test('release build rejects invalid, missing and unknown flags', () => {
  expect(() => parseReleaseBuildArgs(['--path-prefixes=enabled'])).toThrow();
  expect(() => parseReleaseBuildArgs(['--path-prefixes'])).toThrow();
  expect(() => parseReleaseBuildArgs(['--unknown'])).toThrow();
});
