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

export interface DaoScanFlags {
  isDatabaseFile: boolean;
  isConnectionFile: boolean;
  isTestDatabaseSetup: boolean;
  isManagedMigrate: boolean;
  isManagedMigrateSatellite: boolean;
  isTestFile: boolean;
  isDaoFile: boolean;
  isProductionDaoImplementation: boolean;
  isTestDaoImplementation: boolean;
  hasValidDaoPlacement: boolean;
  isMigrationPath: boolean;
}
