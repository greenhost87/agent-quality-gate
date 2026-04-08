import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';

interface ManifestFile {
  file: string;
  sha256: string;
  size: number;
}

interface ManifestShape {
  version: string;
  builtAt: string;
  files: ManifestFile[];
}

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const MANIFEST_PATH = join(REPO_ROOT, 'dist', 'default-configs', 'manifest.json');

function runBuildScript(): void {
  const result = spawnSync('bun', ['run', 'build:verify'], {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
    env: { ...process.env, FORCE_COLOR: '0' },
  });
  if ((result.status ?? 1) !== 0) {
    const message = [
      `build script failed with status ${result.status ?? 'null'}`,
      `stdout:\n${result.stdout ?? ''}`,
      `stderr:\n${result.stderr ?? ''}`,
    ].join('\n');
    throw new Error(message);
  }
}

describe('verify bundle build', () => {
  it('writes bundled config manifest with required files', () => {
    runBuildScript();

    const rawManifest = readFileSync(MANIFEST_PATH, 'utf-8');
    const manifest = JSON.parse(rawManifest) as ManifestShape;
    expect(typeof manifest.version).toBe('string');
    expect(typeof manifest.builtAt).toBe('string');
    expect(manifest.files.map((entry) => entry.file).sort()).toEqual(
      expect.arrayContaining([
        '.dependency-cruiser.cjs',
        '.jscpd.json',
        '.remarkrc.mjs',
        'eslint.config.mjs',
        'knip.json',
        'rules/no-empty-interface-extends.yml',
        'rules/no-record-string-unknown.yml',
        'rules/no-useless-exported-type-alias.yml',
        'sgconfig.yml',
        'tools/analyze/detect-duplicate-exported-shapes.mjs',
        'tools/analyze/duplicate-shapes.config.json',
        'tools/eslint-plugin-quality/create-rule.mjs',
        'tools/eslint-plugin-quality/glob-utils.mjs',
        'tools/eslint-plugin-quality/index.mjs',
        'tools/eslint-plugin-quality/rules/no-empty-interface-extends.mjs',
        'tools/eslint-plugin-quality/rules/no-record-string-unknown.mjs',
        'tools/eslint-plugin-quality/rules/no-runtime-in-types-files.mjs',
        'tools/eslint-plugin-quality/rules/no-type-declarations-in-runtime-files.mjs',
        'tools/eslint-plugin-quality/rules/no-useless-exported-type-alias.mjs',
        'tsconfig.verify.json',
      ])
    );
    for (const file of manifest.files) {
      expect(file.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(file.size).toBeGreaterThan(0);
    }
  });
});
