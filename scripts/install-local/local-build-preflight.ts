import { runRequired } from '../run-required/run-required.js';

export function runLocalBuildPreflight(repoRoot: string): void {
  process.stdout.write('Running self-verify before local build\n');
  runRequired('bun', ['./scripts/self-verify/self-verify.ts'], repoRoot, true);

  process.stdout.write('Running tests before local build\n');
  runRequired('bun', ['./scripts/self-test/self-test.ts'], repoRoot, true);

  process.stdout.write('Running integration tests before local build\n');
  runRequired('bun', ['./scripts/self-test/self-test.ts', '--integration'], repoRoot, true);
}
