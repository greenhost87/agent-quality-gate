import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import {
  executeVerify,
  streamResultFromVerifyResult,
} from './node_modules/agent-quality-gate/dist/extensions/public-verify.js';

const firstResult = await executeVerify({
  projectRoot: process.cwd(),
  entries: ['src/index.ts'],
  presets: ['config'],
});
const first = streamResultFromVerifyResult(firstResult);
if (
  first.exitCode !== 1 ||
  !first.stderr.includes('managed preset files do not match') ||
  !first.stderr.includes('example .aqg/config/system/config/environment.ts')
) {
  console.error(JSON.stringify(first));
  process.exit(2);
}

const examplePath = join(process.cwd(), '.aqg', 'config', 'system', 'config', 'environment.ts');
const managedPath = join(process.cwd(), 'system', 'config', 'environment.ts');
await mkdir(join(process.cwd(), 'system', 'config'), { recursive: true });
await Bun.write(managedPath, await Bun.file(examplePath).text());

const secondResult = await executeVerify({
  projectRoot: process.cwd(),
  entries: ['src/index.ts'],
  presets: ['config'],
});
const second = streamResultFromVerifyResult(secondResult);
const diagnostics = `${second.stdout}\n${second.stderr}`;
if (second.exitCode === 0 || !diagnostics.includes('environment-boundaries')) {
  console.error(JSON.stringify(second));
  process.exit(3);
}
