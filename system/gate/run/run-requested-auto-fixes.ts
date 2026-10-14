import { fallowConfigPathForProject } from '#system/config/project-artifacts.js';
import { packagedFallowConfigPath } from '#system/config/packaged-assets/packaged-assets.js';
import {
  TYPE_AWARE_OXLINT_TIMEOUT_HINT,
  TYPE_AWARE_OXLINT_TIMEOUT_MS,
} from '#system/config/tuning/tuning.js';
import { failedCheckResult, type CheckResult } from './check-result.js';
import { fallowToolRun } from './fallow/tool-run.js';
import {
  checkResultFromOxlintToolRun,
  oxlintToolRun,
  writeFallowConfigWithEntries,
} from './verify-tool-run.js';
import type { EphemeralProjectConfigPaths } from './ephemeral-project-configs.js';
import type { ToolRunner, VerifyRequest } from './execute-verify.js';

export async function runRequestedAutoFixes(
  request: VerifyRequest,
  run: ToolRunner,
  projectRoot: string,
  ephemeral: EphemeralProjectConfigPaths,
  oxlintConfigPath: string,
  typeAware: boolean,
  ignorePatterns: readonly string[],
  combinedCacheDir: string,
): Promise<CheckResult | undefined> {
  if (request.autoFix?.oxlint === true) {
    const fix = oxlintToolRun(oxlintConfigPath, ignorePatterns, true);
    const fixed = checkResultFromOxlintToolRun(
      await run({
        name: 'oxlint',
        args: fix.args,
        environment: fix.environment,
        cwd: projectRoot,
        timeoutMs: typeAware ? TYPE_AWARE_OXLINT_TIMEOUT_MS : undefined,
        timeoutMessage: typeAware ? TYPE_AWARE_OXLINT_TIMEOUT_HINT : undefined,
        failurePrefix: 'verify: failed to start ',
      }),
      new Set(request.ignoreOxlintRuleIds ?? []),
    );
    // Ordinary unfixed findings are handled by the later read-only lint pass.
    if ((fixed.failures?.length ?? 0) > 0) return fixed;
  }
  if (request.autoFix?.fallow === true) {
    // Fallow fix may edit its config; use a disposable copy, never the persistent verify config.
    const fixConfigPath = fallowConfigPathForProject(projectRoot);
    ephemeral.fallowConfigPaths.push(fixConfigPath);
    await writeFallowConfigWithEntries(
      packagedFallowConfigPath(),
      projectRoot,
      request.entries,
      ignorePatterns,
      request.fallowIgnoreDependencies ?? [],
      undefined,
      fixConfigPath,
      {
        intrinsicInteractions: request.intrinsicInteractions,
        lifecycleCallbacks: request.lifecycleCallbacks,
        actionCompatibility: request.actionCompatibility,
      },
      {},
      combinedCacheDir,
    );
    const fixed = await run(
      fallowToolRun(
        projectRoot,
        fixConfigPath,
        ['fix', '--yes', '--no-create-config'],
        'json',
        combinedCacheDir,
      ),
    );
    if (fixed.exitCode !== 0) {
      return failedCheckResult(
        fixed.exitCode,
        `verify: fallow fix failed: ${fixed.stderr.trim() || fixed.stdout.trim() || `exit code ${String(fixed.exitCode)}`}`,
      );
    }
  }
  return undefined;
}
