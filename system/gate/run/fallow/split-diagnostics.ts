import * as v from 'valibot';

import type { CheckResult } from '../check-result.js';
import type { ToolRunResult } from '../execute-verify.js';
import {
  checkResultFromCombinedOutput,
  checkResultFromOwnSectionDiagnostics,
  combinedOutputFromToolRun,
  parseFallowStdout,
} from './json-diagnostics.js';
import {
  CombinedUiOnlySchema,
  type CombinedDupesSection,
  type CombinedUiSection,
} from './json-schemas.js';
import { codeDuplicationDiagnostics, withDuplicationHint } from './hygiene-list-diagnostics.js';

/**
 * Scenario coverage from the standalone `fallow ui` report.
 * `undefined` when the run produced no usable section.
 */
export function combinedUiSectionFromToolRun(raw: ToolRunResult): CombinedUiSection | undefined {
  const parsed = parseFallowStdout(raw);
  if (!('output' in parsed)) {
    return undefined;
  }
  const standalone = v.safeParse(
    v.looseObject({ kind: v.literal('ui'), scenario_coverage: CombinedUiOnlySchema.entries.ui }),
    parsed.output,
  );
  if (standalone.success) {
    const { kind: _kind, ...coverage } = standalone.output.scenario_coverage;
    return coverage;
  }
  const combined = v.safeParse(CombinedUiOnlySchema, parsed.output);
  return combined.success ? combined.output.ui : undefined;
}

export function uiAuditFromToolRun(raw: ToolRunResult) {
  const parsed = parseFallowStdout(raw);
  if (!('output' in parsed)) return undefined;
  const report = v.safeParse(
    v.looseObject({
      kind: v.literal('ui'),
      audit: v.object({
        kind: v.literal('ui-audit'),
        schema_version: v.literal(1),
        findings: v.array(
          v.object({
            rule: v.string(),
            path: v.string(),
            line: v.number(),
            message: v.string(),
          }),
        ),
      }),
    }),
    parsed.output,
  );
  return report.success ? report.output.audit : undefined;
}

/**
 * `dupes` section of the dedicated third verify launch (`fallow --only dupes`).
 * `undefined` when the run produced no usable section.
 */
export function combinedDupesSectionFromToolRun(
  raw: ToolRunResult,
): CombinedDupesSection | undefined {
  return combinedOutputFromToolRun(raw)?.dupes;
}

/**
 * Dupes half of the split hygiene stage: the dedicated third verify launch
 * (`fallow --only dupes`) backs code-duplication diagnostics in-process.
 * Exit derivation matches the former combined fan-out (1 iff its own
 * findings are non-empty); crashes and schema failures still fail the phase.
 */
export function checkResultFromFallowDupesToolRun(raw: ToolRunResult): CheckResult {
  return checkResultFromCombinedOutput(raw, (combined) =>
    withDuplicationHint(checkResultFromOwnSectionDiagnostics(codeDuplicationDiagnostics(combined))),
  );
}
