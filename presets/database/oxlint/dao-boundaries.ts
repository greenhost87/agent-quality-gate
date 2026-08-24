import { definePlugin, eslintCompatPlugin } from '@oxlint/plugins';

import { daoBoundaries } from './dao-boundaries-rule.ts';
import { testDatabaseBoundaries } from './test-database-boundaries-rule.ts';

export default eslintCompatPlugin(
  definePlugin({
    meta: {
      name: 'database',
    },
    rules: {
      'dao-boundaries': daoBoundaries,
      'test-database-boundaries': testDatabaseBoundaries,
    },
  }),
);
