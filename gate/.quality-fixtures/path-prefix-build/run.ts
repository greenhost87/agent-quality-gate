import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Diagnostic } from '../../execute-verify/check-result.js';
import {
  presentStructuredDiagnostics,
  VERIFY_FAILURE_LOG_RELATIVE_PATH,
} from '../../quality-gate-run/present-verify-failure.js';
import {
  groupDiagnosticsForPresentation,
  renderDiagnosticBlocks,
} from '../../quality-gate-run/present-diagnostics.js';
import {
  buildPathPrefixDictionary,
  collectDiagnosticPaths,
  shortenPath,
} from '../../quality-gate-run/path-prefixes.js';

const root = process.argv[2];
if (root === undefined) throw new Error('Missing project root');
const prefix = 'app/components/features/very-long-feature-directory';
const diagnostics: Diagnostic[] = Array.from({ length: 12 }, (_, index) => ({
  source: 'test',
  ruleId: `rule-${String(index)}`,
  severity: 'error',
  message: index === 0 ? 'detail'.repeat(100) : 'detail',
  location: { path: `${prefix}/item-${String(index).padStart(2, '0')}.tsx` },
}));
const dictionary = buildPathPrefixDictionary(collectDiagnosticPaths(diagnostics));
const compressed =
  dictionary.legend +
  renderDiagnosticBlocks(
    groupDiagnosticsForPresentation(diagnostics, (path) => shortenPath(path, dictionary.aliases)),
  );
const fullText = renderDiagnosticBlocks(groupDiagnosticsForPresentation(diagnostics));
const complete = await presentStructuredDiagnostics(root, { diagnostics }, compressed.length);
const visible = await presentStructuredDiagnostics(root, { diagnostics });
const spilled = await presentStructuredDiagnostics(root, {
  diagnostics: [
    ...diagnostics,
    {
      source: 'test',
      ruleId: 'oversized',
      severity: 'error',
      message: 'large'.repeat(1000),
      location: { path: `${prefix}/zz-oversized.tsx` },
    },
  ],
});
const spillText = await readFile(join(root, VERIFY_FAILURE_LOG_RELATIVE_PATH), 'utf8');
console.log(
  JSON.stringify({ visible, spilled, complete, fullText, spillText, budget: compressed.length }),
);
