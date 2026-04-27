import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import dependencyCruiserConfig from '../../.dependency-cruiser.cjs' with { type: 'text' };
import jscpdConfig from '../../.jscpd.json' with { type: 'json' };
import knipConfig from '../../knip.json' with { type: 'json' };
import duplicateShapesScript from '../../tools/analyze/detect-duplicate-exported-shapes.mjs' with { type: 'text' };
import duplicateShapesConfig from '../../tools/analyze/duplicate-shapes.config.json' with { type: 'json' };
import tsconfigVerify from '../../tsconfig.verify.json' with { type: 'json' };

function asEmbeddedText(value: unknown, filePath: string): string {
  if (typeof value !== 'string') {
    throw new TypeError(`verify: embedded config "${filePath}" was not loaded as text`);
  }
  return value;
}

function asEmbeddedJsonText(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function toStandaloneTsconfigText(value: unknown): string {
  if (!import.meta.url.includes('/$bunfs/') || existsSync(join(process.cwd(), 'node_modules', 'bun-types'))) {
    return asEmbeddedJsonText(value);
  }
  const config = structuredClone(value);
  if (typeof config === 'object' && config !== null && 'compilerOptions' in config) {
    const compilerOptions = config.compilerOptions;
    if (typeof compilerOptions === 'object' && compilerOptions !== null && 'types' in compilerOptions) {
      delete compilerOptions.types;
    }
  }
  return asEmbeddedJsonText(config);
}

const EMBEDDED_DEFAULT_CONFIG_FILES: Record<string, string> = {
  '.dependency-cruiser.cjs': asEmbeddedText(dependencyCruiserConfig, '.dependency-cruiser.cjs'),
  '.jscpd.json': asEmbeddedJsonText(jscpdConfig),
  'knip.json': asEmbeddedJsonText(knipConfig),
  'tools/analyze/detect-duplicate-exported-shapes.mjs': asEmbeddedText(
    duplicateShapesScript,
    'tools/analyze/detect-duplicate-exported-shapes.mjs'
  ),
  'tools/analyze/duplicate-shapes.config.json': asEmbeddedJsonText(duplicateShapesConfig),
  'tsconfig.verify.json': toStandaloneTsconfigText(tsconfigVerify),
};

function hashEmbeddedFiles(): string {
  const hash = createHash('sha256');
  for (const [filePath, content] of Object.entries(EMBEDDED_DEFAULT_CONFIG_FILES).sort(([left], [right]) =>
    left.localeCompare(right)
  )) {
    hash.update(filePath);
    hash.update('\0');
    hash.update(content);
    hash.update('\0');
  }
  return hash.digest('hex').slice(0, 16);
}

export function extractEmbeddedDefaultConfigs(): string {
  const outputDir = join(process.cwd(), '.tmp', 'agent-quality-gate', 'embedded-default-configs', hashEmbeddedFiles());
  for (const [filePath, content] of Object.entries(EMBEDDED_DEFAULT_CONFIG_FILES)) {
    const outputPath = join(outputDir, filePath);
    if (existsSync(outputPath)) {
      continue;
    }
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, content, 'utf-8');
  }
  const projectNodeModulesPath = join(process.cwd(), 'node_modules');
  const runtimeNodeModulesPath = join(outputDir, 'node_modules');
  if (existsSync(projectNodeModulesPath) && !existsSync(runtimeNodeModulesPath)) {
    symlinkSync(projectNodeModulesPath, runtimeNodeModulesPath, 'dir');
  }
  return outputDir;
}
