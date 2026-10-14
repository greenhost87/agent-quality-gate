import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type { Diagnostic, ExecutionFailure } from '../run/check-result.js';
import { writeTextFile } from '#system/process/files/files.js';
import {
  groupDiagnosticsForPresentation,
  renderDiagnosticBlocks,
  renderOpaqueAndFailure,
  type RenderedDiagnosticBlock,
} from './present-diagnostics.js';
import {
  buildPathPrefixDictionary,
  collectDiagnosticPaths,
  shortenPath,
  type PathPrefixAlias,
} from './path-prefixes.js';

/** Replaced by the release build; source execution keeps path prefixes disabled. */
declare const AQG_PATH_PREFIXES: boolean;
const PATH_PREFIXES_ENABLED = typeof AQG_PATH_PREFIXES !== 'undefined' && AQG_PATH_PREFIXES;

export const VERIFY_FAILURE_MAX_LINES = 5;
export const VERIFY_FAILURE_LOG_RELATIVE_PATH = '.aqg/aqg-verify-failure.log';

export type PresentedDiagnostics = {
  text: string;
  full?: string;
  spillPath?: string;
};

type PresentableCheckResult = {
  diagnostics: readonly Diagnostic[];
  opaqueText?: string;
  failures?: readonly ExecutionFailure[];
};

function renderWithPaths(
  diagnostics: readonly Diagnostic[],
  aliases: readonly PathPrefixAlias[],
): string {
  const pathFor = (path: string) => shortenPath(path, aliases);
  return renderDiagnosticBlocks(groupDiagnosticsForPresentation(diagnostics, pathFor));
}

function composeHead(options: { legend: string; opaque: string; body: string }): string {
  return [
    options.legend.trimEnd() || undefined,
    options.opaque || undefined,
    options.body || undefined,
  ]
    .filter((part): part is string => part !== undefined && part.length > 0)
    .join('\n');
}

function spillMarkerLine(): string {
  return `other errors: ${VERIFY_FAILURE_LOG_RELATIVE_PATH}`;
}

async function writeSpill(projectRoot: string, body: string): Promise<string> {
  const logPath = join(projectRoot, VERIFY_FAILURE_LOG_RELATIVE_PATH);
  mkdirSync(dirname(logPath), { recursive: true });
  await writeTextFile(logPath, body.endsWith('\n') ? body : `${body}\n`);
  return VERIFY_FAILURE_LOG_RELATIVE_PATH;
}

function withSpillSuffix(head: string): string {
  if (head.length === 0) {
    return spillMarkerLine();
  }
  return `${head}\n${spillMarkerLine()}`;
}

function lineCount(text: string): number {
  return text.length === 0 ? 0 : text.split('\n').length;
}

function composePresentedHead(diagnostics: readonly Diagnostic[], opaque: string): string {
  const fullPaths = composeHead({ legend: '', opaque, body: renderWithPaths(diagnostics, []) });
  if (!PATH_PREFIXES_ENABLED) {
    return fullPaths;
  }
  const dictionary = buildPathPrefixDictionary(collectDiagnosticPaths(diagnostics));
  if (dictionary.aliases.length === 0) {
    return fullPaths;
  }
  const shortened = composeHead({
    legend: dictionary.legend,
    opaque,
    body: renderWithPaths(diagnostics, dictionary.aliases),
  });
  return shortened.length < fullPaths.length ? shortened : fullPaths;
}

function fitWholeBlocks(
  baseBlocks: readonly RenderedDiagnosticBlock[],
  opaque: string,
  budget: number,
): { headDiagnostics: Diagnostic[]; spillFrom: number } {
  const headBlocks: RenderedDiagnosticBlock[] = [];
  let spillFrom = baseBlocks.length;
  for (let index = 0; index < baseBlocks.length; index += 1) {
    const nextBlock = baseBlocks[index];
    if (nextBlock === undefined) {
      break;
    }
    const trialDiagnostics = [...headBlocks, nextBlock].flatMap((block) => [...block.diagnostics]);
    const headWithoutSpill = composePresentedHead(trialDiagnostics, opaque);
    const willSpill = index + 1 < baseBlocks.length;
    const text = willSpill ? withSpillSuffix(headWithoutSpill) : headWithoutSpill;
    if (lineCount(text) <= budget) {
      headBlocks.push(nextBlock);
      continue;
    }
    spillFrom = index;
    break;
  }
  return {
    headDiagnostics: headBlocks.flatMap((block) => [...block.diagnostics]),
    spillFrom,
  };
}

/** Greedy prefix of findings fitting the budget with the spill marker. Pure. */
function fitFindingHead(
  orderedDiagnostics: readonly Diagnostic[],
  opaque: string,
  budget: number,
): Diagnostic[] {
  const head: Diagnostic[] = [];
  for (const diagnostic of orderedDiagnostics) {
    const trial = [...head, diagnostic];
    const trialHead = composePresentedHead(trial, opaque);
    const trialText =
      trial.length < orderedDiagnostics.length ? withSpillSuffix(trialHead) : trialHead;
    if (lineCount(trialText) > budget) {
      break;
    }
    head.push(diagnostic);
  }
  return head;
}

async function spillRemainder(
  projectRoot: string,
  orderedDiagnostics: readonly Diagnostic[],
  opaque: string,
  headCount: number,
  full: string,
): Promise<PresentedDiagnostics> {
  const head = withSpillSuffix(
    composePresentedHead(orderedDiagnostics.slice(0, headCount), opaque),
  );
  await writeSpill(
    projectRoot,
    renderDiagnosticBlocks(groupDiagnosticsForPresentation(orderedDiagnostics.slice(headCount))),
  );
  return { text: head, full, spillPath: VERIFY_FAILURE_LOG_RELATIVE_PATH };
}

/**
 * Fit diagnostic blocks into the head line budget with optional reversible path aliases.
 * Legend, opaque/failure text, and the spill link count toward the budget.
 * Spill gets full-path remainder; findings are never truncated mid-text,
 * a large block is split between findings instead.
 */
export async function presentStructuredDiagnostics(
  projectRoot: string,
  result: PresentableCheckResult,
  budget: number = VERIFY_FAILURE_MAX_LINES,
): Promise<PresentedDiagnostics> {
  const diagnostics = result.diagnostics;
  const opaque = renderOpaqueAndFailure(result);
  const baseBlocks = groupDiagnosticsForPresentation(diagnostics);
  if (baseBlocks.length === 0) {
    return presentOpaqueOnly(projectRoot, opaque, budget);
  }

  const completeHead = composePresentedHead(diagnostics, opaque);
  if (lineCount(completeHead) <= budget) {
    return { text: completeHead };
  }
  const fullBody = renderDiagnosticBlocks(baseBlocks);
  const full = composeHead({ legend: '', opaque, body: fullBody });

  const orderedDiagnostics = baseBlocks.flatMap((block) => [...block.diagnostics]);
  const whole = fitWholeBlocks(baseBlocks, opaque, budget);
  if (whole.spillFrom >= baseBlocks.length) {
    return { text: composePresentedHead(whole.headDiagnostics, opaque) };
  }
  if (whole.headDiagnostics.length > 0) {
    const head = withSpillSuffix(composePresentedHead(whole.headDiagnostics, opaque));
    if (lineCount(head) <= budget) {
      return spillRemainder(
        projectRoot,
        orderedDiagnostics,
        opaque,
        whole.headDiagnostics.length,
        full,
      );
    }
  }

  // No whole block fits (e.g. a single large block): split between findings so
  // the head still respects the budget. Findings are never truncated mid-text.
  const headFindings = fitFindingHead(orderedDiagnostics, opaque, budget);
  if (headFindings.length === orderedDiagnostics.length) {
    return { text: composePresentedHead(headFindings, opaque) };
  }
  if (headFindings.length > 0) {
    return spillRemainder(projectRoot, orderedDiagnostics, opaque, headFindings.length, full);
  }

  // Nothing fits under budget with the spill link: move the whole payload to spill.
  const spillPayload = [opaque || undefined, fullBody]
    .filter((part): part is string => part !== undefined && part.length > 0)
    .join('\n');
  await writeSpill(projectRoot, spillPayload);
  return {
    text: spillMarkerLine(),
    full,
    spillPath: VERIFY_FAILURE_LOG_RELATIVE_PATH,
  };
}

async function presentOpaqueOnly(
  projectRoot: string,
  opaque: string,
  budget: number,
): Promise<PresentedDiagnostics> {
  if (lineCount(opaque) <= budget) {
    return { text: opaque };
  }
  await writeSpill(projectRoot, opaque);
  return {
    text: spillMarkerLine(),
    full: opaque,
    spillPath: VERIFY_FAILURE_LOG_RELATIVE_PATH,
  };
}

export function diagnosticsHaveHandmadeJsonMarker(
  diagnostics: readonly Diagnostic[] | undefined,
): boolean {
  return (diagnostics ?? []).some(
    (diagnostic) => diagnostic.ruleId === 'bun-parse/no-handmade-json-types',
  );
}
