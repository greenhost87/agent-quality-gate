import { definePlugin, eslintCompatPlugin } from '@oxlint/plugins';

import { noHandmadeJsonTypes } from './no-handmade-json-types.ts';
import { noRawJsonParse } from './no-raw-json-parse.ts';
import { noTypeofObject } from './no-typeof-object.ts';
import { scriptsBoundaries } from './scripts-boundaries.ts';

export default eslintCompatPlugin(
  definePlugin({
    meta: {
      name: 'bun-parse',
    },
    rules: {
      'no-handmade-json-types': noHandmadeJsonTypes,
      'no-raw-json-parse': noRawJsonParse,
      'no-typeof-object': noTypeofObject,
      'scripts-boundaries': scriptsBoundaries,
    },
  }),
);
