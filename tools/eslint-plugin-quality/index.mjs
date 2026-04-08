import noEmptyInterfaceExtends from './rules/no-empty-interface-extends.mjs';
import noRecordStringUnknown from './rules/no-record-string-unknown.mjs';
import noRuntimeInTypesFiles from './rules/no-runtime-in-types-files.mjs';
import noTypeDeclarationsInRuntimeFiles from './rules/no-type-declarations-in-runtime-files.mjs';
import noUselessExportedTypeAlias from './rules/no-useless-exported-type-alias.mjs';

const plugin = {
  meta: {
    name: 'internal-quality-rules',
  },
  rules: {
    'no-empty-interface-extends': noEmptyInterfaceExtends,
    'no-record-string-unknown': noRecordStringUnknown,
    'no-runtime-in-types-files': noRuntimeInTypesFiles,
    'no-type-declarations-in-runtime-files': noTypeDeclarationsInRuntimeFiles,
    'no-useless-exported-type-alias': noUselessExportedTypeAlias,
  },
};

export default plugin;
