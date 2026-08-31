import { definePlugin, eslintCompatPlugin } from '@oxlint/plugins';

import consoleFormatPlaceholders from './rules/console-format-placeholders.ts';
import maxInlineParameterObjectMembers from './rules/max-inline-parameter-object-members.ts';
import noClass from './rules/no-class.ts';
import noDoubleWrappedExpectEqual from './rules/no-double-wrapped-expect-equal.ts';
import noDynamicImport from './rules/no-dynamic-import.ts';
import noEmptyExtendedInterfaces from './rules/no-empty-extended-interfaces.ts';
import noIdentityAliases from './rules/no-identity-aliases.ts';
import noIndexedAccessTypes from './rules/no-indexed-access-types.ts';
import noInlineMultilineTestData from './rules/no-inline-multiline-test-data.ts';
import noManualExportedStringLiteralUnions from './rules/no-manual-exported-string-literal-unions.ts';
import noNullUndefinedParameterUnion from './rules/no-null-undefined-parameter-union.ts';
import noOxlintDisableDirectives from './rules/no-oxlint-disable-directives.ts';
import noRuntimeInTypesFiles from './rules/no-runtime-in-types-files.ts';
import noThinForwarders from './rules/no-thin-forwarders.ts';
import noTrivialConstWrappers from './rules/no-trivial-const-wrappers.ts';
import noUnknownParameters from './rules/no-unknown-parameters.ts';
import noUselessExportedTypeAliases from './rules/no-useless-exported-type-aliases.ts';
import noWideParameterUnions from './rules/no-wide-parameter-unions.ts';
import requireExportStringLiteralCatalogsAsConst from './rules/require-export-string-literal-catalogs-as-const.ts';

const rules = {
  'console-format-placeholders': consoleFormatPlaceholders,
  'max-inline-parameter-object-members': maxInlineParameterObjectMembers,
  'no-class': noClass,
  'no-double-wrapped-expect-equal': noDoubleWrappedExpectEqual,
  'no-dynamic-import': noDynamicImport,
  'no-empty-extended-interfaces': noEmptyExtendedInterfaces,
  'no-identity-aliases': noIdentityAliases,
  'no-indexed-access-types': noIndexedAccessTypes,
  'no-inline-multiline-test-data': noInlineMultilineTestData,
  'no-manual-exported-string-literal-unions': noManualExportedStringLiteralUnions,
  'no-null-undefined-parameter-union': noNullUndefinedParameterUnion,
  'no-oxlint-disable-directives': noOxlintDisableDirectives,
  'no-runtime-in-types-files': noRuntimeInTypesFiles,
  'no-thin-forwarders': noThinForwarders,
  'no-trivial-const-wrappers': noTrivialConstWrappers,
  'no-unknown-parameters': noUnknownParameters,
  'no-useless-exported-type-aliases': noUselessExportedTypeAliases,
  'no-wide-parameter-unions': noWideParameterUnions,
  'require-export-string-literal-catalogs-as-const': requireExportStringLiteralCatalogsAsConst,
};

export const AQG_RULE_NAMES = Object.keys(rules).map((name) => `aqg/${name}`);

export default eslintCompatPlugin(
  definePlugin({
    meta: {
      name: 'aqg',
    },
    rules,
  }),
);
