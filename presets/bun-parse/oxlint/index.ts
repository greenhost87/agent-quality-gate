import { definePlugin, eslintCompatPlugin } from '@oxlint/plugins';

import { noHandmadeJsonTypes } from './no-handmade-json-types.ts';

export default eslintCompatPlugin(
  definePlugin({
    meta: {
      name: 'bun-parse',
    },
    rules: {
      'no-handmade-json-types': noHandmadeJsonTypes,
    },
  }),
);
