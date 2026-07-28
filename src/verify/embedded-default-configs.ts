import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import fallowConfig from '../../.fallowrc.json' with { type: 'json' };
import oxlintConfig from '../../.oxlintrc.jsonc' with { type: 'text' };
import qualityPlugin from '../../oxlint-quality-plugin.mjs' with { type: 'text' };
import uiPlugin from '../../oxlint-ui-plugin.mjs' with { type: 'text' };
import type { EmbeddedConfigPaths } from './types.js';

function toJsonText(value: object): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function embeddedFiles(eslintPluginPath: string): Record<string, string> {
  const renderedOxlintConfig = String(oxlintConfig).replace(
    '"specifier": "oxlint-plugin-eslint"',
    `"specifier": ${JSON.stringify(eslintPluginPath)}`
  );
  return {
    '.fallowrc.json': toJsonText(fallowConfig),
    '.oxlintrc.jsonc': renderedOxlintConfig,
    'oxlint-quality-plugin.mjs': qualityPlugin,
    'oxlint-ui-plugin.mjs': uiPlugin,
  };
}

function embeddedFilesHash(files: Record<string, string>): string {
  const hash = createHash('sha256');
  for (const [path, content] of Object.entries(files).sort(([left], [right]) => left.localeCompare(right))) {
    hash.update(path);
    hash.update('\0');
    hash.update(content);
    hash.update('\0');
  }
  return hash.digest('hex').slice(0, 16);
}

export function extractEmbeddedDefaultConfigs(eslintPluginPath: string): EmbeddedConfigPaths {
  const files = embeddedFiles(eslintPluginPath);
  const outputDir = join(process.cwd(), '.tmp', 'agent-quality-gate', 'configs', embeddedFilesHash(files));
  for (const [path, content] of Object.entries(files)) {
    const outputPath = join(outputDir, path);
    const temporaryPath = `${outputPath}.${process.pid}.${randomUUID()}.tmp`;
    mkdirSync(dirname(outputPath), { recursive: true });
    try {
      writeFileSync(temporaryPath, content, 'utf8');
      renameSync(temporaryPath, outputPath);
    } finally {
      rmSync(temporaryPath, { force: true });
    }
  }
  return {
    fallow: join(outputDir, '.fallowrc.json'),
    oxlint: join(outputDir, '.oxlintrc.jsonc'),
  };
}
