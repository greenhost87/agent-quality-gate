import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
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

function isManifestFile(value: unknown): value is ManifestFile {
  return (
    typeof value === 'object' &&
    value !== null &&
    'file' in value &&
    typeof value.file === 'string' &&
    'sha256' in value &&
    typeof value.sha256 === 'string' &&
    'size' in value &&
    typeof value.size === 'number'
  );
}

function isManifestShape(value: unknown): value is ManifestShape {
  return (
    typeof value === 'object' &&
    value !== null &&
    'version' in value &&
    typeof value.version === 'string' &&
    'builtAt' in value &&
    typeof value.builtAt === 'string' &&
    'files' in value &&
    Array.isArray(value.files) &&
    value.files.every(isManifestFile)
  );
}

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const MANIFEST_PATH = join(REPO_ROOT, 'dist', 'default-configs', 'manifest.json');
const VERIFY_BIN_PATH = join(REPO_ROOT, 'dist', 'bin', 'verify.js');

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
    const manifest: unknown = JSON.parse(rawManifest);
    expect(isManifestShape(manifest)).toBe(true);
    if (!isManifestShape(manifest)) {
      throw new Error('manifest has an unexpected shape');
    }
    expect(typeof manifest.version).toBe('string');
    expect(typeof manifest.builtAt).toBe('string');
    const manifestFiles = manifest.files.map((entry) => entry.file);
    for (const expectedFile of [
      '.dependency-cruiser.cjs',
      '.jscpd.json',
      'eslint.config.mjs',
      'eslint-length.config.mjs',
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
    ]) {
      expect(manifestFiles).toContain(expectedFile);
    }
    for (const file of manifest.files) {
      expect(file.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(file.size).toBeGreaterThan(0);
    }
  });

  it('runs the bundled verify entrypoint without losing bundled helper paths', () => {
    runBuildScript();

    const consumerDir = mkdtempSync(join(tmpdir(), 'verify-bundle-consumer-'));
    try {
      writeFileSync(join(consumerDir, 'package.json'), '{"name":"verify-bundle-consumer","private":true}\n', 'utf-8');
      const result = spawnSync('bun', [VERIFY_BIN_PATH, '--timings'], {
        cwd: consumerDir,
        encoding: 'utf-8',
        env: { ...process.env, FORCE_COLOR: '0' },
      });
      expect(result.status ?? 1).toBe(0);
      expect(result.stdout).toContain('verify: ok');
      expect(result.stdout).toContain('protected-coverage take ');
      expect(result.stderr).not.toContain('Module not found');
      expect(result.stderr).not.toContain('verify-protected-coverage.ts');
    } finally {
      rmSync(consumerDir, { recursive: true, force: true });
    }
  });
});
