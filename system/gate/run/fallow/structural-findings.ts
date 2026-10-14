import * as v from 'valibot';

import { readJsonFile } from '#system/process/files/files.js';
import { fallowProcessCrashResult } from './json-diagnostics.js';
import { StructuralFindingFieldsSchema, type StructuralFindingFields } from './json-schemas.js';
import {
  checkResultFromDiagnostics,
  failedCheckResult,
  type CheckResult,
  type Diagnostic,
  type DiagnosticLocation,
} from '../check-result.js';

const NonEmptyUnknownArraySchema = v.pipe(v.array(v.unknown()), v.minLength(1));

const STRUCTURAL_FINDING_KEYS = new Set([
  'prop_drilling_chains',
  'thin_wrappers',
  'duplicate_prop_shapes',
]);

/** Loose view of a combined `check` section for structural adaptation. */
const StructuralSectionSchema = v.pipe(
  v.looseObject({
    total_issues: v.optional(v.number()),
    ...StructuralFindingFieldsSchema,
  }),
  v.check((output) => {
    if (output.total_issues !== undefined) {
      return true;
    }
    if (
      output.prop_drilling_chains.length > 0 ||
      output.thin_wrappers.length > 0 ||
      output.duplicate_prop_shapes.length > 0
    ) {
      return true;
    }
    return Object.entries(output).some(([key, value]) => {
      if (key === 'kind' || key === 'total_issues') {
        return false;
      }
      return v.is(NonEmptyUnknownArraySchema, value);
    });
  }, 'Fallow structural report requires an issue summary or findings'),
);

function hasNonStructuralFindings(output: v.InferOutput<typeof StructuralSectionSchema>): boolean {
  return Object.entries(output).some(([key, value]) => {
    if (key === 'kind' || key === 'total_issues' || STRUCTURAL_FINDING_KEYS.has(key)) {
      return false;
    }
    return v.is(NonEmptyUnknownArraySchema, value);
  });
}
const SeveritySchema = v.picklist(['off', 'warn', 'error']);
const RulesObjectSchema = v.object({
  'prop-drilling': v.optional(SeveritySchema, 'off'),
  'thin-wrapper': v.optional(SeveritySchema, 'off'),
  'duplicate-prop-shape': v.optional(SeveritySchema, 'off'),
});
const RulesSchema = v.object({
  rules: RulesObjectSchema,
});

/** JSX/UI Fallow diagnostics reported through the verify `ui` lint group. */
export const FALLOW_UI_RULE_IDS = [
  'fallow/prop-drilling',
  'fallow/thin-wrapper',
  'fallow/duplicate-prop-shape',
] as const;

type StructuralDiagnostic = {
  rule: 'prop-drilling' | 'thin-wrapper' | 'duplicate-prop-shape';
  file: string;
  line: number;
  message: string;
  related?: readonly DiagnosticLocation[];
};

type SeverityRules = v.InferOutput<typeof RulesObjectSchema>;

function compareFileLine(
  left: { file: string; line: number },
  right: { file: string; line: number },
): number {
  return left.file.localeCompare(right.file) || left.line - right.line;
}

function structuralDiagnostics(output: StructuralFindingFields): StructuralDiagnostic[] {
  const diagnostics: StructuralDiagnostic[] = [];
  for (const chain of output.prop_drilling_chains) {
    const source = chain.hops[0];
    if (source === undefined) throw new Error('Fallow prop-drilling chain has no source');
    diagnostics.push({
      rule: 'prop-drilling',
      file: source.file,
      line: source.line,
      message: `Prop ${chain.prop} is forwarded through ${chain.hops.map((hop) => hop.component).join(' -> ')}. Give the consuming view the data or operation it needs at the owning boundary.`,
      related: chain.hops.map((hop) => ({
        path: hop.file,
        line: hop.line,
        label: hop.component,
        role: 'prop-hop',
      })),
    });
  }
  for (const wrapper of output.thin_wrappers) {
    diagnostics.push({
      rule: 'thin-wrapper',
      file: wrapper.file,
      line: wrapper.line,
      message: `${wrapper.component} only forwards props to ${wrapper.child_component}; use the owning component directly.`,
    });
  }
  for (const shape of output.duplicate_prop_shapes) {
    diagnostics.push({
      rule: 'duplicate-prop-shape',
      file: shape.file,
      line: shape.line,
      message: `${shape.component} repeats the prop shape (${shape.shape.join(', ')}). Check responsibility and narrow the contract; do not invent a shared abstraction based only on matching prop names.`,
    });
  }
  return diagnostics;
}

function toCheckDiagnostics(
  diagnostics: readonly StructuralDiagnostic[],
  rules: SeverityRules,
): CheckResult {
  const mapped: Diagnostic[] = [];
  let exitCode = 0;
  const sorted = [...diagnostics].sort(
    (left, right) => compareFileLine(left, right) || left.rule.localeCompare(right.rule),
  );
  for (const diagnostic of sorted) {
    const severity = rules[diagnostic.rule];
    if (severity === 'off') continue;
    if (severity === 'error') exitCode = 1;
    mapped.push({
      source: 'fallow',
      ruleId: `fallow/${diagnostic.rule}`,
      severity: severity === 'warn' ? 'warning' : 'error',
      message: diagnostic.message,
      location: { path: diagnostic.file, line: diagnostic.line },
      ...('related' in diagnostic && diagnostic.related !== undefined
        ? { related: diagnostic.related }
        : {}),
    });
  }
  return checkResultFromDiagnostics(mapped, { exitCode });
}

export function structuralRulesAllOff(rules: SeverityRules): boolean {
  return Object.values(rules).every((severity) => severity === 'off');
}

export async function readStructuralSeverityRules(configPath: string): Promise<SeverityRules> {
  const { rules } = await readJsonFile(configPath, RulesSchema);
  return rules;
}

/**
 * Pure structural adaptation of one shared combined run (Stage A / V3b).
 * Parses the `check` section of combined stdout; the caller keeps the early
 * return when every structural rule is `off`.
 */
export function structuralCheckResultFromCombinedToolRun(
  result: { exitCode: number; stdout: string; stderr: string },
  rules: SeverityRules,
): CheckResult {
  const crash = fallowProcessCrashResult(result, 'fallow structural failed');
  if (crash !== undefined) return crash;
  const parsed = v.safeParse(v.pipe(v.string(), v.parseJson(), v.looseObject({})), result.stdout);
  if (!parsed.success) {
    return failedCheckResult(
      result.exitCode === 0 ? 1 : result.exitCode,
      `Fallow structural analysis returned invalid JSON output: ${v.summarize(parsed.issues)}`,
      { stdout: result.stdout, stderr: result.stderr },
    );
  }
  const section = v.safeParse(StructuralSectionSchema, parsed.output['check'] ?? parsed.output);
  if (!section.success) {
    return failedCheckResult(
      result.exitCode === 0 ? 1 : result.exitCode,
      `Fallow structural analysis returned invalid JSON output: ${v.summarize(section.issues)}`,
      { stdout: result.stdout, stderr: result.stderr },
    );
  }
  const findings = structuralDiagnostics(section.output);
  if (
    (section.output.total_issues ?? 0) > 0 &&
    findings.length === 0 &&
    !hasNonStructuralFindings(section.output)
  ) {
    return failedCheckResult(
      result.exitCode === 0 ? 1 : result.exitCode,
      'fallow reported total_issues without recognizable findings',
      { stdout: result.stdout, stderr: result.stderr },
    );
  }
  return toCheckDiagnostics(findings, rules);
}
