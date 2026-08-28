import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { file } from 'bun';

import { fallowCacheEnvironment } from '../../gate/preflight/fallow-analysis.js';
import { fallowExecutablePath } from '../../gate/execute-verify/verify-tool-run.js';
import { runCapturedProcess } from '../../process/run-command/run-command.js';
import { importFanInByPath, parseFallowDot } from './parse-fallow-dot.js';

const CONFIG_BASENAME = 'collapse-types.fallowrc.json';
const DOT_BASENAME = 'collapse-types.dot';
const FALLOW_VIZ_TIMEOUT_MS = 120_000;

const DEFAULT_FALLOW_CONFIG = {
  entry: ['**/*.{ts,tsx}'],
  ignorePatterns: [
    '**/node_modules/**',
    '**/.*/**',
    '**/dist/**',
    '**/build/**',
    '**/coverage/**',
    '**/tests/**',
    '**/__tests__/**',
  ],
  production: true,
} as const;

/** Absolute imported path → absolute importer paths from fallow viz. */
export async function loadImportFanIn(projectRoot: string): Promise<Map<string, string[]>> {
  const root = resolve(projectRoot);
  const cacheDir = join(root, 'node_modules', '.cache', 'agent-quality-gate');
  mkdirSync(cacheDir, { recursive: true });
  const configPath = join(cacheDir, CONFIG_BASENAME);
  const outPath = join(cacheDir, DOT_BASENAME);
  writeFileSync(configPath, `${JSON.stringify(DEFAULT_FALLOW_CONFIG, null, 2)}\n`);

  const viz = await runCapturedProcess({
    command: fallowExecutablePath(),
    args: [
      'viz',
      '--viz-format',
      'dot',
      '--out',
      outPath,
      '--no-open',
      '--config',
      configPath,
      '--root',
      root,
    ],
    cwd: root,
    environment: fallowCacheEnvironment(root),
    timeoutMs: FALLOW_VIZ_TIMEOUT_MS,
    timeoutMessage: 'collapse-types: fallow viz exceeded timeout and was killed',
  });
  if (viz.exitCode !== 0) {
    const stderr = viz.stderr.trim();
    const stdout = viz.stdout.trim();
    const detail =
      stderr.length === 0 ? stdout : stdout.length === 0 ? stderr : `${stderr}\n${stdout}`;
    throw new Error(`collapse-types: fallow viz failed\n${detail}`);
  }

  const relativeFanIn = importFanInByPath(parseFallowDot(await file(outPath).text()));
  return new Map(
    [...relativeFanIn].map(([relativePath, relativeImporters]) => [
      resolve(root, relativePath.replace(/^\.\//u, '').replaceAll('\\', '/')),
      relativeImporters.map((importer) =>
        resolve(root, importer.replace(/^\.\//u, '').replaceAll('\\', '/')),
      ),
    ]),
  );
}
