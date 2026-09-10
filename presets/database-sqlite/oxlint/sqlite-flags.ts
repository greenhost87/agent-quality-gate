export type SqliteFileFlags = {
  isDatabaseInfrastructure: boolean;
  isDaoFile: boolean;
  isMigrationRunner: boolean;
  isSystemFile: boolean;
  isTestDatabaseSetup: boolean;
};

export type SqliteTestFileFlags = {
  isManagedSetup: boolean;
  isTestFile: boolean;
  isUnitTest: boolean;
};

export type SqliteTestState = {
  usesManagedHook: boolean;
};

export type SqliteTestBindings = {
  apis: Set<string>;
  namespaces: Set<string>;
};
