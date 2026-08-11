import consoleFormatPlaceholders from './rules/console-format-placeholders.mjs';
import noEmptyExtendedInterfaces from './rules/no-empty-extended-interfaces.mjs';
import noIndexedAccessTypes from './rules/no-indexed-access-types.mjs';
import noManualExportedStringLiteralUnions from './rules/no-manual-exported-string-literal-unions.mjs';
import noNullUndefinedParameterUnion from './rules/no-null-undefined-parameter-union.mjs';
import noRuntimeInTypesFiles from './rules/no-runtime-in-types-files.mjs';
import noSingleUseForwarders from './rules/no-single-use-forwarders.mjs';
import noTypesInRuntimeFiles from './rules/no-types-in-runtime-files.mjs';
import noUnknownParameters from './rules/no-unknown-parameters.mjs';
import noUselessExportedTypeAliases from './rules/no-useless-exported-type-aliases.mjs';
import noWideParameterUnions from './rules/no-wide-parameter-unions.mjs';
import requireExportStringLiteralCatalogsAsConst from './rules/require-export-string-literal-catalogs-as-const.mjs';

const qualityPlugin = {
  meta: {
    name: 'quality',
  },
  rules: {
    'console-format-placeholders': consoleFormatPlaceholders,
    'no-empty-extended-interfaces': noEmptyExtendedInterfaces,
    'no-indexed-access-types': noIndexedAccessTypes,
    'no-manual-exported-string-literal-unions': noManualExportedStringLiteralUnions,
    'no-null-undefined-parameter-union': noNullUndefinedParameterUnion,
    'no-runtime-in-types-files': noRuntimeInTypesFiles,
    'no-single-use-forwarders': noSingleUseForwarders,
    'no-types-in-runtime-files': noTypesInRuntimeFiles,
    'no-unknown-parameters': noUnknownParameters,
    'no-useless-exported-type-aliases': noUselessExportedTypeAliases,
    'no-wide-parameter-unions': noWideParameterUnions,
    'require-export-string-literal-catalogs-as-const': requireExportStringLiteralCatalogsAsConst,
  },
};

export default qualityPlugin;
