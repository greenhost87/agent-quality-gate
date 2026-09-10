import type {
  Diagnostic,
  DiagnosticLocation,
  ExecutionFailure,
} from '../execute-verify/check-result.js';

export type RenderedDiagnosticBlock = {
  /** Fully rendered text for this block (may be multi-line). */
  text: string;
  /** Structured findings included in this block (for spill / path collection). */
  diagnostics: readonly Diagnostic[];
};

function formatLocation(location: DiagnosticLocation, pathText: string): string {
  const parts = [pathText];
  if (location.line !== undefined) {
    parts.push(String(location.line));
    if (location.column !== undefined) {
      parts.push(String(location.column));
    }
  }
  const end =
    location.endLine === undefined
      ? ''
      : `-${String(location.endLine)}${
          location.endColumn === undefined ? '' : `:${String(location.endColumn)}`
        }`;
  const label = location.label ? ` (${location.label})` : '';
  const role = location.role ? ` [${location.role}]` : '';
  return `${parts.join(':')}${end}${label}${role}`;
}

function pathOf(location: DiagnosticLocation | undefined): string | undefined {
  return location?.path;
}

function compareDiagnostics(left: Diagnostic, right: Diagnostic): number {
  const leftPath = pathOf(left.location) ?? '';
  const rightPath = pathOf(right.location) ?? '';
  return (
    leftPath.localeCompare(rightPath) ||
    (left.location?.line ?? 0) - (right.location?.line ?? 0) ||
    (left.location?.column ?? 0) - (right.location?.column ?? 0) ||
    (left.ruleId ?? '').localeCompare(right.ruleId ?? '') ||
    left.message.localeCompare(right.message) ||
    compareDiagnosticDetails(left, right)
  );
}

function diagnosticDetailKey(diagnostic: Diagnostic): string {
  const locationKey = (location: DiagnosticLocation) => [
    location.path,
    location.line,
    location.column,
    location.endLine,
    location.endColumn,
    location.offset,
    location.length,
    location.label,
    location.role,
  ];
  return JSON.stringify([
    diagnostic.source,
    diagnostic.ruleId,
    diagnostic.severity,
    diagnostic.message,
    diagnostic.help,
    diagnostic.url,
    diagnostic.groupHeader,
    diagnostic.groupLocation === undefined ? undefined : locationKey(diagnostic.groupLocation),
    diagnostic.location === undefined ? undefined : locationKey(diagnostic.location),
    diagnostic.related?.map(locationKey),
  ]);
}

function compareDiagnosticDetails(left: Diagnostic, right: Diagnostic): number {
  const leftKey = diagnosticDetailKey(left);
  const rightKey = diagnosticDetailKey(right);
  return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
}

/**
 * Stable group key from structured fields. Never merge different source/rule solely by header text.
 */
function groupKey(diagnostic: Diagnostic): string {
  const owner = `${diagnostic.source}\0${diagnostic.ruleId ?? ''}\0${diagnostic.severity}`;
  if (diagnostic.groupLocation !== undefined) {
    return `${owner}\0header:${diagnostic.groupHeader ?? ''}\0location:${JSON.stringify(diagnostic.groupLocation)}`;
  }
  if (diagnostic.groupHeader !== undefined && diagnostic.groupHeader.length > 0) {
    return `${owner}\0header:${diagnostic.groupHeader}`;
  }
  return `${owner}\0${diagnostic.severity}`;
}

function displayGroupHeader(diagnostic: Diagnostic, pathFor: (path: string) => string): string {
  if (diagnostic.groupLocation !== undefined) {
    const location = diagnostic.groupLocation;
    return [diagnostic.groupHeader, formatLocation(location, pathFor(location.path))]
      .filter((part) => part !== undefined && part.length > 0)
      .join(' ');
  }
  return diagnostic.groupHeader ?? '';
}

function isHeaderLocation(location: DiagnosticLocation, diagnostic: Diagnostic): boolean {
  return (
    diagnostic.groupLocation !== undefined &&
    location.path === diagnostic.groupLocation.path &&
    Object.keys(location).every((key) => key === 'path' || key === 'role')
  );
}

function relatedLines(
  diagnostic: Diagnostic,
  pathFor: (path: string) => string,
  options: { omitGroupLocation?: boolean } = {},
): string[] {
  return (
    diagnostic.related
      ?.filter(
        (entry) => !(options.omitGroupLocation === true && isHeaderLocation(entry, diagnostic)),
      )
      .map((entry) => formatLocation(entry, pathFor(entry.path)))
      .filter((entry) => entry.length > 0) ?? []
  );
}

function helpLine(diagnostic: Diagnostic): string | undefined {
  const lines = [
    diagnostic.help ? `help: ${diagnostic.help}` : undefined,
    diagnostic.url ? `rule: ${diagnostic.url}` : undefined,
  ].filter((line): line is string => line !== undefined);
  return lines.length === 0 ? undefined : lines.join('\n');
}

function formatSingleDiagnostic(diagnostic: Diagnostic, pathFor: (path: string) => string): string {
  const path = diagnostic.location?.path;
  const locationText =
    diagnostic.location === undefined || path === undefined
      ? undefined
      : formatLocation(diagnostic.location, pathFor(path));
  const rule = diagnostic.ruleId ?? diagnostic.source;
  const head = `${diagnostic.severity} ${rule}`;
  const related = relatedLines(diagnostic, pathFor, { omitGroupLocation: true });
  const help = helpLine(diagnostic);
  const header = displayGroupHeader(diagnostic, pathFor);
  if (header.length > 0 && locationText !== undefined) {
    const line = `${locationText} ${header}`;
    const extras = [diagnostic.message, ...related, help].filter(
      (part): part is string => part !== undefined && part.length > 0 && part !== header,
    );
    if (extras.length === 0) {
      return line;
    }
    return [line, ...extras.map((part) => `  ${part}`)].join('\n');
  }
  const primary =
    locationText === undefined
      ? `${head}: ${diagnostic.message}`
      : `${locationText}: ${head}: ${diagnostic.message}`;
  const extras = [...related, help].filter(
    (part): part is string => part !== undefined && part.length > 0,
  );
  if (extras.length === 0) {
    return primary;
  }
  return [primary, ...extras.map((part) => `  ${part}`)].join('\n');
}

function collectGroupLocationLabels(
  entries: readonly Diagnostic[],
  pathFor: (path: string) => string,
): string[] {
  return entries
    .flatMap((entry) => {
      const parts: string[] = [];
      if (entry.location !== undefined) {
        parts.push(formatLocation(entry.location, pathFor(entry.location.path)));
      }
      for (const related of entry.related ?? []) {
        // The shared location is already rendered in the group header.
        if (isHeaderLocation(related, entry)) {
          continue;
        }
        parts.push(formatLocation(related, pathFor(related.path)));
      }
      if (parts.length === 0 && entry.message.length > 0) {
        parts.push(entry.message);
      }
      return parts;
    })
    .filter((value) => value.length > 0);
}

function sharedHelpLine(entries: readonly Diagnostic[]): string | undefined {
  const helps = [
    ...new Set(entries.map((entry) => helpLine(entry) ?? '').filter((help) => help.length > 0)),
  ];
  if (helps.length !== 1) {
    return undefined;
  }
  const help = helps[0];
  return help;
}

function blockForIdenticalGroupHeader(
  entries: readonly Diagnostic[],
  pathFor: (path: string) => string,
): RenderedDiagnosticBlock {
  const sample = entries[0];
  const header = sample === undefined ? '' : displayGroupHeader(sample, pathFor);
  const locations = collectGroupLocationLabels(entries, pathFor);
  const help = sharedHelpLine(entries);
  const messages = [...new Set(entries.map((entry) => entry.message))];
  const messageExtra =
    messages.length === 1 &&
    messages[0] !== undefined &&
    messages[0].length > 0 &&
    messages[0] !== header
      ? messages[0]
      : undefined;
  const lines = [header, `  ${locations.join(', ')}`];
  if (messageExtra !== undefined) {
    lines.push(`  ${messageExtra}`);
  }
  if (help !== undefined) {
    lines.push(`  ${help}`);
  }
  return {
    text: lines.join('\n'),
    diagnostics: entries,
  };
}

function blockForIdenticalDetail(
  entries: readonly Diagnostic[],
  pathFor: (path: string) => string,
): RenderedDiagnosticBlock | undefined {
  const sample = entries[0];
  if (sample === undefined) {
    return undefined;
  }
  const rule = sample.ruleId ?? sample.source;
  const locations = entries
    .map((entry) => {
      if (entry.location === undefined) return undefined;
      return formatLocation(entry.location, pathFor(entry.location.path));
    })
    .filter((value): value is string => value !== undefined);
  const related = entries.flatMap((entry) => relatedLines(entry, pathFor));
  const help = sharedHelpLine(entries);
  const lines = [`${sample.severity} ${rule}: ${sample.message}`, `  ${locations.join(', ')}`];
  for (const entry of related) {
    lines.push(`  ${entry}`);
  }
  if (help !== undefined) {
    lines.push(`  ${help}`);
  }
  return {
    text: lines.join('\n'),
    diagnostics: entries,
  };
}

function blockForDivergentMulti(
  key: string,
  entries: readonly Diagnostic[],
  pathFor: (path: string) => string,
): RenderedDiagnosticBlock {
  const sample = entries[0];
  const rule = sample?.ruleId ?? sample?.source ?? key;
  const severity = sample?.severity ?? 'error';
  const header =
    sample === undefined || displayGroupHeader(sample, pathFor).length === 0
      ? `${severity} ${rule}:`
      : displayGroupHeader(sample, pathFor);
  const lines = entries.flatMap((entry) => {
    const location =
      entry.location === undefined
        ? undefined
        : formatLocation(entry.location, pathFor(entry.location.path));
    const head = location === undefined ? `  ${entry.message}` : `  ${location}: ${entry.message}`;
    const extras = [...relatedLines(entry, pathFor), helpLine(entry)].filter(
      (part): part is string => part !== undefined && part.length > 0,
    );
    return [head, ...extras.map((part) => `    ${part}`)];
  });
  return {
    text: `${header}\n${lines.join('\n')}`,
    diagnostics: entries,
  };
}

function blockForMultiEntryGroup(
  key: string,
  entries: readonly Diagnostic[],
  pathFor: (path: string) => string,
): RenderedDiagnosticBlock | undefined {
  const messages = new Set(entries.map((entry) => entry.message));
  const helps = new Set(entries.map((entry) => entry.help ?? ''));
  const urls = new Set(entries.map((entry) => entry.url ?? ''));
  const sharedRelations = entries.every((entry) =>
    (entry.related ?? []).every((related) => isHeaderLocation(related, entry)),
  );
  const identicalDetail =
    messages.size === 1 && helps.size === 1 && urls.size === 1 && sharedRelations;
  const sample = entries[0];
  if (identicalDetail && sample !== undefined && displayGroupHeader(sample, pathFor).length > 0) {
    return blockForIdenticalGroupHeader(entries, pathFor);
  }
  if (identicalDetail) {
    return blockForIdenticalDetail(entries, pathFor);
  }
  return blockForDivergentMulti(key, entries, pathFor);
}

function partitionDiagnosticsByGroup(diagnostics: readonly Diagnostic[]): {
  order: string[];
  groups: Map<string, Diagnostic[]>;
} {
  const sorted = [...diagnostics].sort(compareDiagnostics);
  const groups = new Map<string, Diagnostic[]>();
  const order: string[] = [];
  const warningGroups: string[] = [];
  for (const diagnostic of sorted) {
    const key = groupKey(diagnostic);
    let bucket = groups.get(key);
    if (bucket === undefined) {
      bucket = [];
      groups.set(key, bucket);
      // Shared-location review warnings follow ordinary diagnostic groups.
      if (diagnostic.severity === 'warning' && diagnostic.groupLocation !== undefined) {
        warningGroups.push(key);
      } else {
        order.push(key);
      }
    }
    bucket.push(diagnostic);
  }
  return { order: [...order, ...warningGroups], groups };
}

/**
 * Group diagnostics deterministically for agent/CLI presentation.
 * Differing messages/help/related locations are not collapsed.
 */
export function groupDiagnosticsForPresentation(
  diagnostics: readonly Diagnostic[],
  pathFor: (path: string) => string = (path) => path,
): RenderedDiagnosticBlock[] {
  const { order, groups } = partitionDiagnosticsByGroup(diagnostics);
  const blocks: RenderedDiagnosticBlock[] = [];
  for (const key of order) {
    const entries = groups.get(key) ?? [];
    if (entries.length === 0) {
      continue;
    }
    if (entries.length === 1) {
      const only = entries[0];
      if (only === undefined) continue;
      blocks.push({
        text: formatSingleDiagnostic(only, pathFor),
        diagnostics: [only],
      });
      continue;
    }
    const block = blockForMultiEntryGroup(key, entries, pathFor);
    if (block !== undefined) {
      blocks.push(block);
    }
  }
  return blocks;
}

export function renderDiagnosticBlocks(blocks: readonly RenderedDiagnosticBlock[]): string {
  return blocks.map((block) => block.text).join('\n');
}

export function renderOpaqueAndFailure(options: {
  opaqueText?: string;
  failures?: readonly ExecutionFailure[];
}): string {
  const parts = [...(options.failures ?? []).map((failure) => failure.message), options.opaqueText]
    .filter((part): part is string => part !== undefined && part.trim().length > 0)
    .map((part) => part.trimEnd());
  return parts.join('\n');
}
