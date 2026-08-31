import { benchCreateOnceRules } from 'agent-quality-gate/oxlint-rule-bench';

import { consoleFormatPlaceholdersBench } from '../console-format-placeholders/bench.ts';
import { maxInlineParameterObjectMembersBench } from '../max-inline-parameter-object-members/bench.ts';
import { noClassBench } from '../no-class/bench.ts';
import { noDoubleWrappedExpectEqualBench } from '../no-double-wrapped-expect-equal/bench.ts';
import { noDynamicImportBench } from '../no-dynamic-import/bench.ts';
import { noEmptyExtendedInterfacesBench } from '../no-empty-extended-interfaces/bench.ts';
import { noIdentityAliasesBench } from '../no-identity-aliases/bench.ts';
import { noIndexedAccessTypesBench } from '../no-indexed-access-types/bench.ts';
import { noInlineMultilineTestDataBench } from '../no-inline-multiline-test-data/bench.ts';
import { noManualExportedStringLiteralUnionsBench } from '../no-manual-exported-string-literal-unions/bench.ts';
import { noNullUndefinedParameterUnionBench } from '../no-null-undefined-parameter-union/bench.ts';
import { noRuntimeInTypesFilesBench } from '../no-runtime-in-types-files/bench.ts';
import { noThinForwardersBench } from '../no-thin-forwarders/bench.ts';
import { noTrivialConstWrappersBench } from '../no-trivial-const-wrappers/bench.ts';
import { noUnknownParametersBench } from '../no-unknown-parameters/bench.ts';
import { noUselessExportedTypeAliasesBench } from '../no-useless-exported-type-aliases/bench.ts';
import { noWideParameterUnionsBench } from '../no-wide-parameter-unions/bench.ts';
import { requireExportStringLiteralCatalogsAsConstBench } from '../require-export-string-literal-catalogs-as-const/bench.ts';

await benchCreateOnceRules([
  consoleFormatPlaceholdersBench,
  maxInlineParameterObjectMembersBench,
  noClassBench,
  noDoubleWrappedExpectEqualBench,
  noDynamicImportBench,
  noEmptyExtendedInterfacesBench,
  noIdentityAliasesBench,
  noIndexedAccessTypesBench,
  noInlineMultilineTestDataBench,
  noManualExportedStringLiteralUnionsBench,
  noNullUndefinedParameterUnionBench,
  noRuntimeInTypesFilesBench,
  noThinForwardersBench,
  noTrivialConstWrappersBench,
  noUnknownParametersBench,
  noUselessExportedTypeAliasesBench,
  noWideParameterUnionsBench,
  requireExportStringLiteralCatalogsAsConstBench,
]);
