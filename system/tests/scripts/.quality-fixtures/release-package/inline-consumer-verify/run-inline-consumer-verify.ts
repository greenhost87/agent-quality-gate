import { executeVerify, streamResultFromVerifyResult } from 'agent-quality-gate/shared/verify';

const result = await executeVerify({
  projectRoot: process.cwd(),
  entries: ['src/index.ts', 'tests/example.test.ts'],
});
const streams = streamResultFromVerifyResult(result);
const diagnostics = `${streams.stdout}\n${streams.stderr}`;
if (result.exitCode === 0) {
  console.error(JSON.stringify({ result, streams }));
  process.exit(2);
}
if (!diagnostics.includes('no-inline-multiline-test-data')) {
  console.error(JSON.stringify({ result, streams }));
  process.exit(3);
}
if (!diagnostics.includes('Store it in a fixture file')) {
  console.error(JSON.stringify({ result, streams }));
  process.exit(4);
}
