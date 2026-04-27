import { readFileSync } from 'node:fs';

import { resolveVerifyTargets } from './targets.js';
import type { DuplicateHeading, FenceState, HeadingLocation } from './internal-steps.types.js';

function isDebugEnabled(): boolean {
  const value = process.env.VERIFY_DEBUG;
  return value === '1' || value === 'true';
}

export function runProtectedCoverageStep(): number {
  const targets = resolveVerifyTargets(process.cwd());
  if (isDebugEnabled()) {
    process.stderr.write(
      [
        `verify: debug coverage eslint=${targets.eslint.length}`,
        `verify: debug coverage markdown=${targets.markdown.length}`,
        `verify: debug coverage tsc=${targets.tsc.length}`,
        `verify: debug coverage jscpd=${targets.jscpd.length}`,
      ].join('\n')
    );
    process.stderr.write('\n');
  }
  return 0;
}

function normalizeHeadingText(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLowerCase();
}

function parseAtxHeading(line: string, lineNumber: number): HeadingLocation | null {
  const match = /^( {0,3})(#{1,6})(?:\s+|$)(.*)$/.exec(line);
  if (!match) {
    return null;
  }

  const leadingSpaces = match[1] ?? '';
  const marker = match[2] ?? '';
  const rawText = match[3] ?? '';
  const text = rawText.replace(/\s+#+\s*$/, '').trim();
  if (text.length === 0) {
    return null;
  }

  return {
    text,
    normalizedText: normalizeHeadingText(text),
    line: lineNumber,
    column: leadingSpaces.length + marker.length + 2,
  };
}

function parseSetextUnderline(line: string): boolean {
  return /^ {0,3}(=+|-+)\s*$/.test(line);
}

function parseFence(line: string): FenceState | null {
  const match = /^ {0,3}(`{3,}|~{3,})/.exec(line);
  if (!match) {
    return null;
  }
  const marker = match[1] ?? '';
  return {
    marker: marker[0] ?? '',
    length: marker.length,
  };
}

function closesFence(line: string, fence: FenceState): boolean {
  const pattern = new RegExp(`^ {0,3}\\${fence.marker}{${fence.length},}\\s*$`);
  return pattern.test(line);
}

function findDuplicateHeadings(filePath: string): DuplicateHeading[] {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.replaceAll('\r\n', '\n').split('\n');
  const firstHeadings = new Map<string, HeadingLocation>();
  const duplicates: DuplicateHeading[] = [];
  let fence: FenceState | null = null;
  let previousTextLine: HeadingLocation | null = null;

  for (const [index, line] of lines.entries()) {
    const lineNumber = index + 1;

    if (fence) {
      if (closesFence(line, fence)) {
        fence = null;
      }
      previousTextLine = null;
      continue;
    }

    const openingFence = parseFence(line);
    if (openingFence) {
      fence = openingFence;
      previousTextLine = null;
      continue;
    }

    const atxHeading = parseAtxHeading(line, lineNumber);
    if (atxHeading) {
      const firstHeading = firstHeadings.get(atxHeading.normalizedText);
      if (firstHeading) {
        duplicates.push({ filePath, heading: atxHeading, firstHeading });
      } else {
        firstHeadings.set(atxHeading.normalizedText, atxHeading);
      }
      previousTextLine = null;
      continue;
    }

    if (previousTextLine && parseSetextUnderline(line)) {
      const firstHeading = firstHeadings.get(previousTextLine.normalizedText);
      if (firstHeading) {
        duplicates.push({ filePath, heading: previousTextLine, firstHeading });
      } else {
        firstHeadings.set(previousTextLine.normalizedText, previousTextLine);
      }
      previousTextLine = null;
      continue;
    }

    const trimmedLine = line.trim();
    previousTextLine =
      trimmedLine.length > 0
        ? {
            text: trimmedLine,
            normalizedText: normalizeHeadingText(trimmedLine),
            line: lineNumber,
            column: line.indexOf(trimmedLine) + 1,
          }
        : null;
  }

  return duplicates;
}

export function runMarkdownHeadingsStep(args: readonly string[]): number {
  const duplicates = args.flatMap((filePath) => findDuplicateHeadings(filePath));
  if (duplicates.length === 0) {
    return 0;
  }

  for (const duplicate of duplicates) {
    process.stderr.write(`${duplicate.filePath}\n`);
    process.stderr.write(
      `${duplicate.heading.line}:${duplicate.heading.column} error Duplicate markdown heading "${duplicate.heading.text}" ` +
        `(first defined at ${duplicate.firstHeading.line}:${duplicate.firstHeading.column})\n`
    );
  }
  return 1;
}
