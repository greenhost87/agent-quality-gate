import * as v from 'valibot';

import { readJsonFile } from '../../process/files/files.js';
import { fallowToolRun } from './fallow-tool-run.js';
import { fallowProcessCrashResult } from './fallow-json-diagnostics.js';
import { FallowSourceLocationSchema } from './fallow-source-location.js';
import type { ToolRunner } from './execute-verify.js';
import {
  checkResultFromDiagnostics,
  failedCheckResult,
  type CheckResult,
  type Diagnostic,
  type DiagnosticLocation,
} from './check-result.js';

const LocationSchema = v.object({
  ...FallowSourceLocationSchema.entries,
  component: v.string(),
});
const StructuralFindingFieldsSchema = {
  prop_drilling_chains: v.optional(
    v.array(
      v.object({
        prop: v.string(),
        hops: v.pipe(v.array(LocationSchema), v.minLength(1)),
      }),
    ),
    [],
  ),
  thin_wrappers: v.optional(
    v.array(
      v.object({
        ...LocationSchema.entries,
        child_component: v.string(),
      }),
    ),
    [],
  ),
  duplicate_prop_shapes: v.optional(
    v.array(
      v.object({
        ...LocationSchema.entries,
        shape: v.array(v.string()),
      }),
    ),
    [],
  ),
} as const;

const StructuralOutputSchema = v.looseObject({
  kind: v.literal('dead-code'),
  total_issues: v.optional(v.number()),
  ...StructuralFindingFieldsSchema,
});
const NonEmptyUnknownArraySchema = v.pipe(v.array(v.unknown()), v.minLength(1));

const OutputTextSchema = v.pipe(
  v.string(),
  v.parseJson(),
  StructuralOutputSchema,
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

const STRUCTURAL_FINDING_KEYS = new Set([
  'prop_drilling_chains',
  'thin_wrappers',
  'duplicate_prop_shapes',
]);

function hasNonStructuralFindings(output: v.InferOutput<typeof StructuralOutputSchema>): boolean {
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

function structuralDiagnostics(
  output: v.InferOutput<typeof StructuralOutputSchema>,
): StructuralDiagnostic[] {
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

export async function checkFallowStructuralFindings(
  run: ToolRunner,
  projectRoot: string,
  configPath: string,
): Promise<CheckResult> {
  const { rules } = await readJsonFile(configPath, RulesSchema);
  if (Object.values(rules).every((severity) => severity === 'off')) {
    return checkResultFromDiagnostics([]);
  }
  const result = await run(
    fallowToolRun(projectRoot, configPath, ['dead-code', '--fail-on-issues'], 'json'),
  );
  const crash = fallowProcessCrashResult(result, 'fallow structural failed');
  if (crash !== undefined) return crash;
  const output = v.safeParse(OutputTextSchema, result.stdout);
  if (!output.success) {
    return failedCheckResult(
      result.exitCode === 0 ? 1 : result.exitCode,
      `Fallow structural analysis returned invalid JSON output: ${v.summarize(output.issues)}`,
      { stdout: result.stdout, stderr: result.stderr },
    );
  }
  const findings = structuralDiagnostics(output.output);
  if (
    (output.output.total_issues ?? 0) > 0 &&
    findings.length === 0 &&
    !hasNonStructuralFindings(output.output)
  ) {
    return failedCheckResult(
      result.exitCode === 0 ? 1 : result.exitCode,
      'fallow reported total_issues without recognizable findings',
      { stdout: result.stdout, stderr: result.stderr },
    );
  }
  return toCheckDiagnostics(findings, rules);
}
