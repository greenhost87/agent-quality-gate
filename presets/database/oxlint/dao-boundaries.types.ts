export interface DaoScanFlags {
  isDatabaseFile: boolean;
  isConnectionFile: boolean;
  isTestDatabaseSetup: boolean;
  isManagedMigrate: boolean;
  isTestFile: boolean;
  isDaoFile: boolean;
  isProductionDaoImplementation: boolean;
  isTestDaoImplementation: boolean;
  hasValidDaoPlacement: boolean;
  isMigrationPath: boolean;
}
