import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CheckResult } from '../../execute-verify/check-result.js';
import type { PresetVerifyContext } from '../../../preset-catalog/contract/preset-check.types.js';

export async function runToolChecks(
  context: PresetVerifyContext,
  config?: { mode?: string },
): Promise<CheckResult[]> {
  if (config?.mode === 'held') {
    await mkdir(join(context.projectRoot, '.aqg/fallow'), { recursive: true });
    const scratch = join(context.projectRoot, '.aqg/fallow/preset-scratch.json');
    await writeFile(scratch, '{}');
    await writeFile(join(context.projectRoot, 'started'), context.fallowConfigPath);
    while (!existsSync(join(context.projectRoot, 'release'))) await Bun.sleep(5);
    await readFile(scratch, 'utf8');
    const content = await readFile(context.fallowConfigPath, 'utf8');
    await writeFile(join(context.projectRoot, 'finished'), content);
    return [];
  }
  if (config?.mode === 'reject') {
    while (!existsSync(join(context.projectRoot, 'started'))) await Bun.sleep(5);
    throw new Error('preset rejected');
  }
  return [
    {
      exitCode: 0,
      diagnostics: [
        {
          source: 'sample',
          severity: 'warning',
          message: JSON.stringify({
            projectRoot: context.projectRoot,
            entries: context.entries,
            ignorePatterns: context.ignorePatterns,
            config: JSON.parse(await readFile(context.fallowConfigPath, 'utf8')),
            managedFilePaths: [...context.managedFilePaths],
          }),
        },
      ],
      hints: [{ kind: 'builtin', id: 'avoid-micro-splits' }],
    },
  ];
}
