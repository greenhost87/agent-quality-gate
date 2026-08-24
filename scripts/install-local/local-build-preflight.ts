import { testLocalPresetPackIntegrations } from '../self-verify/preset-pack-run.js';
import { runRequired } from '../run-required/run-required.js';

export async function runLocalBuildPreflight(repoRoot: string): Promise<void> {
  process.stdout.write('Running self-verify before local build\n');
  runRequired('bun', ['./scripts/self-verify/self-verify.ts'], repoRoot, true);

  process.stdout.write('Running tests before local build\n');
  runRequired('bun', ['./scripts/self-test/self-test.ts'], repoRoot, true);

  process.stdout.write('Running integration tests before local build\n');
  const integration = await testLocalPresetPackIntegrations(repoRoot);
  if (integration.stdout.length > 0) {
    process.stdout.write(integration.stdout);
  }
  if (integration.stderr.length > 0) {
    process.stderr.write(integration.stderr);
  }
  if (integration.exitCode !== 0) {
    throw new Error(
      integration.stderr ||
        integration.stdout ||
        `integration tests exited with code ${String(integration.exitCode)}`,
    );
  }
}
