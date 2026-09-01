import { file } from 'bun';
import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { parsePresetManifest } from '../../../../preset-catalog/manifest/parse-preset-manifest.ts';
import { EXECUTE_VERIFY_REPO_ROOT } from '../../../../tests/support/execute-verify-fixture.ts';

test('keeps the sync helper aligned with managed manifest files', async () => {
  const sqliteManifest = await parsePresetManifest(
    join(EXECUTE_VERIFY_REPO_ROOT, 'presets', 'database-sqlite', 'manifest.json'),
  );
  const configManifest = await parsePresetManifest(
    join(EXECUTE_VERIFY_REPO_ROOT, 'presets', 'config', 'manifest.json'),
  );
  const expected = [
    ...configManifest.files
      .filter((entry) => entry.exampleOnly !== true)
      .map((entry) => ({ preset: 'config', destination: entry.destination })),
    ...sqliteManifest.files
      .filter((entry) => entry.exampleOnly !== true)
      .map((entry) => ({ preset: 'database-sqlite', destination: entry.destination })),
  ];
  const script = await file(
    join(
      EXECUTE_VERIFY_REPO_ROOT,
      'presets',
      'database-sqlite',
      'payload',
      'scripts',
      'sync-database-sqlite-managed.ts',
    ),
  ).text();

  for (const entry of expected) {
    expect(script).toContain(`preset: '${entry.preset}'`);
    expect(script).toContain(`destination: '${entry.destination}'`);
  }
  const expectedDestinations = new Set(expected.map((entry) => entry.destination));
  const scriptDestinations = new Set(
    [...script.matchAll(/destination:\s*'([^']+)'/gu)].flatMap((match) =>
      match[1] === undefined ? [] : [match[1]],
    ),
  );
  expect(scriptDestinations).toEqual(expectedDestinations);
});
