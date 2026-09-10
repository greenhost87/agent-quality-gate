import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import {
  executeVerify,
  streamResultFromVerifyResult,
} from './node_modules/agent-quality-gate/dist/extensions/public-verify.js';

const first = await executeVerify({
  projectRoot: process.cwd(),
  entries: ['src/index.ts'],
  presets: ['config'],
});
const firstStreams = streamResultFromVerifyResult(first);
if (
  first.exitCode !== 1 ||
  !firstStreams.stderr.includes('managed preset files do not match') ||
  !firstStreams.stderr.includes('example .aqg/config/system/config/environment.ts')
) {
  console.error(JSON.stringify({ first, firstStreams }));
  process.exit(2);
}

const examplePath = join(process.cwd(), '.aqg', 'config', 'system', 'config', 'environment.ts');
const managedPath = join(process.cwd(), 'system', 'config', 'environment.ts');
await mkdir(join(process.cwd(), 'system', 'config'), { recursive: true });
await Bun.write(managedPath, await Bun.file(examplePath).text());

const second = await executeVerify({
  projectRoot: process.cwd(),
  entries: ['src/index.ts'],
  presets: ['config'],
});
const secondStreams = streamResultFromVerifyResult(second);
const diagnostics = `${secondStreams.stdout}\n${secondStreams.stderr}`;
if (second.exitCode === 0 || !diagnostics.includes('environment-boundaries')) {
  console.error(JSON.stringify({ second, secondStreams }));
  process.exit(3);
}
