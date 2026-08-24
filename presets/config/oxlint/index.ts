import { definePlugin, eslintCompatPlugin } from '@oxlint/plugins';

import { environmentBoundaries } from './environment-boundaries.ts';
import { noTrivialValibotSchemaAlias } from './no-trivial-valibot-schema-alias.ts';
import { noValibotCustom } from './no-valibot-custom.ts';

export default eslintCompatPlugin(
  definePlugin({
    meta: {
      name: 'config',
    },
    rules: {
      'environment-boundaries': environmentBoundaries,
      'no-valibot-custom': noValibotCustom,
      'no-trivial-valibot-schema-alias': noTrivialValibotSchemaAlias,
    },
  }),
);
