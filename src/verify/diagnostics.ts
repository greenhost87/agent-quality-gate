const DIAGNOSTIC_LINE_PATTERNS: RegExp[] = [
  /\berror\b/i,
  /\bwarning\b/i,
  /\bfailed\b/i,
  /\bclone\b/i,
  /\bunused\b/i,
  /:\d+:\d+\b/,
  /\d+:\d+-\d+:\d+/,
  /\(\d+,\d+\):/,
];

function toNonEmptyLines(output: string): string[] {
  return output
    .replaceAll('\r\n', '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);
}

function looksLikePath(line: string): boolean {
  const value = line.trim();
  return /^(\/|\.\/|\.\.\/|~\/|[A-Za-z]:\\)/.test(value) || /\.[a-z0-9]+(?::\d+(?::\d+)?)?$/i.test(value);
}

export function mergeOutput(stdout: string, stderr: string, all?: string): string {
  return (all || [stdout, stderr].filter(Boolean).join('\n')).trim();
}

export function extractFirstDiagnostic(output: string): string {
  const lines = toNonEmptyLines(output);
  if (lines.length === 0) {
    return '';
  }

  const firstDiagnosticIndex = lines.findIndex((line) => {
    return DIAGNOSTIC_LINE_PATTERNS.some((pattern) => pattern.test(line));
  });
  if (firstDiagnosticIndex < 0) {
    return lines[0] ?? '';
  }

  const diagnosticLine = lines[firstDiagnosticIndex] ?? '';
  const previousLine = firstDiagnosticIndex > 0 ? (lines[firstDiagnosticIndex - 1] ?? '') : '';
  if (previousLine && looksLikePath(previousLine)) {
    return `${previousLine}\n${diagnosticLine}`;
  }
  return diagnosticLine;
}
