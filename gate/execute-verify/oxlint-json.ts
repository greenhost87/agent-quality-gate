import * as v from 'valibot';

import type { Diagnostic, DiagnosticLocation } from './check-result.js';

const OxlintSpanSchema = v.object({
  offset: v.optional(v.number()),
  length: v.optional(v.number()),
  line: v.optional(v.number()),
  column: v.optional(v.number()),
});

const OxlintLabelSchema = v.object({
  span: OxlintSpanSchema,
  label: v.optional(v.string()),
});

const OxlintSeveritySchema = v.picklist(['error', 'warning', 'info', 'hint']);

const OxlintDiagnosticSchema = v.object({
  message: v.string(),
  code: v.optional(v.string()),
  severity: OxlintSeveritySchema,
  help: v.optional(v.string()),
  url: v.optional(v.string()),
  filename: v.optional(v.string()),
  labels: v.optional(v.array(OxlintLabelSchema)),
});

export const OxlintJsonOutputSchema = v.object({
  diagnostics: v.array(OxlintDiagnosticSchema),
  number_of_files: v.optional(v.number()),
  number_of_rules: v.optional(v.number()),
  threads_count: v.optional(v.number()),
  start_time: v.optional(v.number()),
});

export type OxlintJsonOutput = v.InferOutput<typeof OxlintJsonOutputSchema>;
export type OxlintJsonDiagnostic = v.InferOutput<typeof OxlintDiagnosticSchema>;
type OxlintJsonSeverity = v.InferOutput<typeof OxlintSeveritySchema>;

/**
 * Map Oxlint JSON `code` (`plugin(rule)`) to config-facing rule ids (`plugin/rule` or bare name).
 * Built-in eslint rules use unqualified config ids (`no-debugger`).
 */
export function oxlintCodeToConfigRuleId(code: string): string {
  const match = /^([^()]+)\((.+)\)$/u.exec(code);
  if (match === null) {
    return code;
  }
  const plugin = match[1];
  const name = match[2];
  if (plugin === undefined || name === undefined) {
    return code;
  }
  if (plugin === 'eslint') {
    return name;
  }
  return `${plugin}/${name}`;
}

export function oxlintDiagnosticMatchesRuleId(
  diagnostic: { ruleId?: string },
  ruleId: string,
): boolean {
  if (diagnostic.ruleId === undefined) {
    return false;
  }
  return diagnostic.ruleId === ruleId;
}

function spanToLocation(
  path: string,
  span: v.InferOutput<typeof OxlintSpanSchema>,
  label?: string,
): DiagnosticLocation {
  return {
    path,
    ...(span.line === undefined ? {} : { line: span.line }),
    ...(span.column === undefined ? {} : { column: span.column }),
    ...(span.offset === undefined ? {} : { offset: span.offset }),
    ...(span.length === undefined ? {} : { length: span.length }),
    ...(label === undefined || label.length === 0 ? {} : { label }),
  };
}

function locationsFromLabels(
  filename: string | undefined,
  labels: readonly v.InferOutput<typeof OxlintLabelSchema>[] | undefined,
): { location?: DiagnosticLocation; related?: DiagnosticLocation[] } {
  if (filename === undefined || labels === undefined || labels.length === 0) {
    return filename === undefined ? {} : { location: { path: filename } };
  }
  const [primary, ...rest] = labels;
  if (primary === undefined) {
    return { location: { path: filename } };
  }
  const location = spanToLocation(filename, primary.span, primary.label);
  if (rest.length === 0) {
    return { location };
  }
  return {
    location,
    related: rest.map((label) => ({
      ...spanToLocation(filename, label.span, label.label),
      role: 'label',
    })),
  };
}

function mapSeverity(severity: OxlintJsonSeverity): 'error' | 'warning' | undefined {
  if (severity === 'error' || severity === 'warning') {
    return severity;
  }
  // info/hint are non-blocking informational; drop from gate findings.
  return undefined;
}

export function diagnosticFromOxlintJson(raw: OxlintJsonDiagnostic): Diagnostic | undefined {
  const severity = mapSeverity(raw.severity);
  if (severity === undefined) {
    return undefined;
  }
  const { location, related } = locationsFromLabels(raw.filename, raw.labels);
  return {
    source: 'oxlint',
    ...(raw.code === undefined ? {} : { ruleId: oxlintCodeToConfigRuleId(raw.code) }),
    severity,
    message: raw.message,
    ...(location === undefined ? {} : { location }),
    ...(related === undefined ? {} : { related }),
    ...(raw.help === undefined ? {} : { help: raw.help }),
    ...(raw.url === undefined ? {} : { url: raw.url }),
  };
}

export function parseOxlintJsonOutput(
  stdout: string,
): { ok: true; output: OxlintJsonOutput } | { ok: false; reason: string } {
  const trimmed = stdout.trim();
  if (trimmed.length === 0) {
    return { ok: false, reason: 'oxlint returned empty stdout; expected JSON diagnostics' };
  }
  const result = v.safeParse(v.pipe(v.string(), v.parseJson(), OxlintJsonOutputSchema), trimmed);
  if (!result.success) {
    const summary = v.summarize(result.issues);
    if (/json|parse/iu.test(summary) && !/diagnostics/iu.test(summary)) {
      return { ok: false, reason: 'oxlint returned non-JSON stdout' };
    }
    return {
      ok: false,
      reason: `oxlint JSON did not match diagnostics schema: ${summary}`,
    };
  }
  return { ok: true, output: result.output };
}

export function diagnosticsFromOxlintJson(output: OxlintJsonOutput): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const raw of output.diagnostics) {
    const diagnostic = diagnosticFromOxlintJson(raw);
    if (diagnostic !== undefined) {
      diagnostics.push(diagnostic);
    }
  }
  return diagnostics;
}
