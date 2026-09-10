import { definePlugin, eslintCompatPlugin } from '@oxlint/plugins';

import { noErrorInstanceInToThrow } from './no-error-instance-in-to-throw.ts';
import { noInterpolationInRegularString } from './no-interpolation-in-regular-string.ts';
import { noSkippedTests } from './no-skipped-tests.ts';
import { noUnneededBackticks } from './no-unneeded-backticks.ts';
import { noUnusedParamInCatchClause } from './no-unused-param-in-catch-clause.ts';

export default eslintCompatPlugin(
  definePlugin({
    meta: {
      name: 'n8n-lints',
    },
    rules: {
      'no-error-instance-in-to-throw': noErrorInstanceInToThrow,
      'no-interpolation-in-regular-string': noInterpolationInRegularString,
      'no-skipped-tests': noSkippedTests,
      'no-unneeded-backticks': noUnneededBackticks,
      'no-unused-param-in-catch-clause': noUnusedParamInCatchClause,
    },
  }),
);
