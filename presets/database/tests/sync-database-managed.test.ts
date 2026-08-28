import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';

import { parsePresetManifest } from '../../../preset-catalog/manifest/parse-preset-manifest.ts';
import { EXECUTE_VERIFY_REPO_ROOT } from '../../../tests/support/execute-verify-fixture.ts';

describe('sync-database-managed', () => {
  it('keeps MANAGED_FILES in sync with manifest managed files', async () => {
    const databaseManifest = await parsePresetManifest(
      join(EXECUTE_VERIFY_REPO_ROOT, 'presets', 'database', 'manifest.json'),
    );
    const configManifest = await parsePresetManifest(
      join(EXECUTE_VERIFY_REPO_ROOT, 'presets', 'config', 'manifest.json'),
    );

    const expected = [
      ...configManifest.files
        .filter((file) => file.exampleOnly !== true)
        .map((file) => ({ preset: 'config', destination: file.destination })),
      ...databaseManifest.files
        .filter((file) => file.exampleOnly !== true)
        .map((file) => ({ preset: 'database', destination: file.destination })),
    ];

    const script = await readFile(
      join(
        EXECUTE_VERIFY_REPO_ROOT,
        'presets',
        'database',
        'payload',
        'scripts',
        'sync-database-managed.ts',
      ),
      'utf8',
    );

    for (const entry of expected) {
      expect(script).toContain(`preset: '${entry.preset}'`);
      expect(script).toContain(`destination: '${entry.destination}'`);
    }

    // Ensure script does not contain extra database/config entries beyond manifests
    const managedDestinations = expected.map((entry) => entry.destination);
    const scriptDestinations = [...script.matchAll(/destination:\s*'([^']+)'/g)].map(
      (match) => match[1],
    );
    expect(new Set(scriptDestinations)).toEqual(new Set(managedDestinations));
  });
});
