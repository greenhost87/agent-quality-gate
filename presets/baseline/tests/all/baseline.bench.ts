import {
  formatAggregateSameAstResult,
  measureAggregateSameAstFixture,
  registerAggregateSameAstFixtureBenches,
  registerCreateOnceRules,
  registerSharedAstCreateOnceRules,
  replaySharedAstPrepared,
  runRegisteredBenches,
} from 'agent-quality-gate/testing/oxlint';
import { astIndexBuildStats, resetAstIndexBuildCount } from 'agent-quality-gate/shared/oxlint';
import { repeat } from 'agent-quality-gate/testing/oxlint';

import { consoleFormatPlaceholdersBench } from 'agent-quality-gate/internal/presets/baseline/tests/console-format-placeholders/bench.ts';
import { maxInlineParameterObjectMembersBench } from 'agent-quality-gate/internal/presets/baseline/tests/max-inline-parameter-object-members/bench.ts';
import { noClassBench } from 'agent-quality-gate/internal/presets/baseline/tests/no-class/bench.ts';
import { noDoubleWrappedExpectEqualBench } from 'agent-quality-gate/internal/presets/baseline/tests/no-double-wrapped-expect-equal/bench.ts';
import { noDynamicImportBench } from 'agent-quality-gate/internal/presets/baseline/tests/no-dynamic-import/bench.ts';
import { noEmptyInterfacesBench } from 'agent-quality-gate/internal/presets/baseline/tests/no-empty-interfaces/bench.ts';
import { noIdentityAliasesBench } from 'agent-quality-gate/internal/presets/baseline/tests/no-identity-aliases/bench.ts';
import { noIndexedAccessTypesBench } from 'agent-quality-gate/internal/presets/baseline/tests/no-indexed-access-types/bench.ts';
import { noInlineMultilineTestDataBench } from 'agent-quality-gate/internal/presets/baseline/tests/no-inline-multiline-test-data/bench.ts';
import { noJsonParseJsonStringifyBench } from 'agent-quality-gate/internal/presets/baseline/tests/no-json-parse-json-stringify/bench.ts';
import { noManualExportedStringLiteralUnionsBench } from 'agent-quality-gate/internal/presets/baseline/tests/no-manual-exported-string-literal-unions/bench.ts';
import { noMixedNullishTypesBench } from 'agent-quality-gate/internal/presets/baseline/tests/no-mixed-nullish-types/bench.ts';
import { noRuntimeInTypesFilesBench } from 'agent-quality-gate/internal/presets/baseline/tests/no-runtime-in-types-files/bench.ts';
import { noThinForwardersBench } from 'agent-quality-gate/internal/presets/baseline/tests/no-thin-forwarders/bench.ts';
import { noTrivialConstWrappersBench } from 'agent-quality-gate/internal/presets/baseline/tests/no-trivial-const-wrappers/bench.ts';
import { noUnknownParametersBench } from 'agent-quality-gate/internal/presets/baseline/tests/no-unknown-parameters/bench.ts';
import { noUselessExportedTypeAliasesBench } from 'agent-quality-gate/internal/presets/baseline/tests/no-useless-exported-type-aliases/bench.ts';
import { noWideParameterUnionsBench } from 'agent-quality-gate/internal/presets/baseline/tests/no-wide-parameter-unions/bench.ts';
import { requireExportStringLiteralCatalogsAsConstBench } from 'agent-quality-gate/internal/presets/baseline/tests/require-export-string-literal-catalogs-as-const/bench.ts';

const perRuleBenches = [
  consoleFormatPlaceholdersBench,
  maxInlineParameterObjectMembersBench,
  noClassBench,
  noDoubleWrappedExpectEqualBench,
  noDynamicImportBench,
  noEmptyInterfacesBench,
  noIdentityAliasesBench,
  noIndexedAccessTypesBench,
  noInlineMultilineTestDataBench,
  noJsonParseJsonStringifyBench,
  noManualExportedStringLiteralUnionsBench,
  noMixedNullishTypesBench,
  noRuntimeInTypesFilesBench,
  noThinForwardersBench,
  noTrivialConstWrappersBench,
  noUnknownParametersBench,
  noUselessExportedTypeAliasesBench,
  noWideParameterUnionsBench,
  requireExportStringLiteralCatalogsAsConstBench,
];

const aggregateCorpus = {
  filename: '/bench/aggregate-same-ast.ts',
  code: [
    repeat((index) => [
      `console.log('item %s %d', 'name-${index}', ${index});`,
      `class HashCache${index} { get(key: string): string | undefined { return key; } }`,
      `expect(wrap${index}(value)).toEqual(wrap${index}(value));`,
      `const mod${index} = await import('./mod-${index}.ts');`,
      `interface Empty${index} {}`,
      `interface ExtendedEmpty${index} extends Base {}`,
      `const alias${index} = source${index};`,
      `type Indexed${index} = Item[${index}];`,
      `export const bag${index} = { call: (value: number) => target${index}.call(value) };`,
      `export const wrapConst${index} = () => VALUE;`,
      `function take${index}(x: string | number) { return x; }`,
    ]),
    repeat((index) => [`const multiline${index} = 'line-a-${index}\\n' + 'line-b-${index}';`]),
  ].join('\n'),
};

const sharedAstRules = [
  consoleFormatPlaceholdersBench,
  noClassBench,
  noDoubleWrappedExpectEqualBench,
  noDynamicImportBench,
  noEmptyInterfacesBench,
  noIdentityAliasesBench,
  noIndexedAccessTypesBench,
  noInlineMultilineTestDataBench,
  noJsonParseJsonStringifyBench,
  noThinForwardersBench,
  noTrivialConstWrappersBench,
  noUnknownParametersBench,
  maxInlineParameterObjectMembersBench,
  noMixedNullishTypesBench,
  noWideParameterUnionsBench,
].map((input) => ({
  name: input.name,
  ruleId: input.ruleId,
  rule: input.rule,
  options: input.cases[0]?.options,
}));

registerCreateOnceRules(perRuleBenches);

const aggregateResult = measureAggregateSameAstFixture(
  aggregateCorpus.filename,
  aggregateCorpus.code,
);
console.log(formatAggregateSameAstResult(aggregateResult));
if (aggregateResult.indexBuilds !== 1) {
  throw new Error(`expected one index build, got ${aggregateResult.indexBuilds}`);
}
if (aggregateResult.walkHits !== aggregateResult.indexedHits) {
  throw new Error(
    `walk/index hit mismatch: walk=${aggregateResult.walkHits} index=${aggregateResult.indexedHits}`,
  );
}
if (!(aggregateResult.sharedIndexMs < aggregateResult.repeatedWalkMs)) {
  throw new Error(
    `shared index was not faster: walk=${aggregateResult.repeatedWalkMs} index=${aggregateResult.sharedIndexMs}`,
  );
}

registerAggregateSameAstFixtureBenches('/bench/aggregate-same-ast-walk.ts', aggregateCorpus.code);

const sharedPrepared = registerSharedAstCreateOnceRules({
  name: 'aggregate-same-ast',
  filename: '/bench/aggregate-same-ast-rules.test.ts',
  code: aggregateCorpus.code,
  rules: sharedAstRules,
});

resetAstIndexBuildCount();
replaySharedAstPrepared(sharedPrepared);
const sharedRuleIndexBuilds = astIndexBuildStats().builds;
console.log(`aggregate-same-ast shared-rule-indexBuilds=${sharedRuleIndexBuilds}`);
// O1 rules use typed visitors; shared index may be unused (0 builds).
if (sharedRuleIndexBuilds > 1) {
  throw new Error(`expected at most one shared-rule index build, got ${sharedRuleIndexBuilds}`);
}

await runRegisteredBenches();
