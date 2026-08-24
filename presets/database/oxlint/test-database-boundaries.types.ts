import type { ESTree } from '@oxlint/plugins';

export interface TestDatabaseScanFlags {
  isTestOrE2eFile: boolean;
  isTestDatabaseSetup: boolean;
  isUnitTest: boolean;
}

export interface TestDatabaseBindings {
  productionDaoBindings: Set<string>;
  bunTestBindings: Set<string>;
  bunTestNamespaces: Set<string>;
  beforeAllBindings: Set<string>;
}

export interface TestDatabaseState {
  usesManagedHook: boolean;
}

export interface TestDatabaseDeferred {
  identifierReferences: ESTree.Node[];
  concurrentReferences: ESTree.Node[];
}

export interface TestDatabaseScanState {
  flags: TestDatabaseScanFlags;
  bindings: TestDatabaseBindings;
  state: TestDatabaseState;
  deferred: TestDatabaseDeferred;
}

export interface TestDatabaseImportOptions {
  isTestOrE2eFile: boolean;
  isTestDatabaseSetup: boolean;
  isUnitTest: boolean;
  bunTestBindings: Set<string>;
  bunTestNamespaces: Set<string>;
  beforeAllBindings: Set<string>;
  productionDaoBindings: Set<string>;
  state: TestDatabaseState;
}
