import {
  executeVerify,
  streamResultFromVerifyResult,
} from './node_modules/agent-quality-gate/dist/extensions/public-verify.js';

const verifyResult = await executeVerify({
  projectRoot: process.cwd(),
  entries: ['src/index.ts', 'tests/example.test.ts'],
});
const result = streamResultFromVerifyResult(verifyResult);
const diagnostics = `${result.stdout}\n${result.stderr}`;
if (result.exitCode === 0) {
  console.error(JSON.stringify(result));
  process.exit(2);
}
if (!diagnostics.includes('no-inline-multiline-test-data')) {
  console.error(JSON.stringify(result));
  process.exit(3);
}
if (!diagnostics.includes('Store it in a fixture file')) {
  console.error(JSON.stringify(result));
  process.exit(4);
}
