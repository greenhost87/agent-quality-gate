import { expect, test } from 'bun:test';
import { phoenixOptions, runOxlintFixture } from './run-oxlint';

const placementMessage = 'Place production modules in a named package instead of the project root.';
const privateAppMessage = 'Package "app" is private; import it only from inside that package.';
const privatePackageMessage =
  'Package "visual" is private; import it only from inside that package.';
const testsImportMessage = 'Production modules must not import test modules under tests/.';
const dependencyMessage = 'Package "media" must not import package "orders".';
const privateAppOptions = { ...phoenixOptions, privatePackages: ['app'] };

test('package boundaries reject unclassified root production modules', async () => {
  const result = await runOxlintFixture(
    'package-boundaries/invalid/unclassified-root',
    'inventory.ts',
    phoenixOptions,
  );
  expect(result.status).not.toBe(0);
  expect(result.output).toContain(placementMessage);
});

test('package boundaries ignore package-boundaries.json in the target project', async () => {
  const result = await runOxlintFixture(
    'package-boundaries/invalid/ignored-project-json',
    'inventory.ts',
    phoenixOptions,
  );
  expect(result.status).not.toBe(0);
  expect(result.output).toContain(placementMessage);
});

test('package boundaries allow configured root entrypoints and shared modules', async () => {
  for (const [fixture, entry] of [
    ['instrumentation', 'instrumentation.ts'],
    ['config', 'config.ts'],
    ['utils', 'utils.ts'],
    ['validation', 'validation.ts'],
    ['next-config', 'next.config.ts'],
  ] as const) {
    const result = await runOxlintFixture(
      `package-boundaries/valid/${fixture}`,
      entry,
      phoenixOptions,
    );
    expect(result.output).toBe('');
    expect(result.status).toBe(0);
  }
});

test('package boundaries reject undeclared cross-package dependencies', async () => {
  const result = await runOxlintFixture(
    'package-boundaries/invalid/undeclared-dependency',
    'media/media-service.ts',
    phoenixOptions,
  );
  expect(result.status).not.toBe(0);
  expect(result.output).toContain(dependencyMessage);
});

test('package boundaries allow own-package, shared, infrastructure, and declared package dependencies', async () => {
  for (const [fixture, entry] of [
    ['own-package-type', 'media/media-service.ts'],
    ['shared-validation', 'media/media-service.ts'],
    ['infrastructure', 'fabrics/import-service.ts'],
    ['declared-dependency', 'fabrics/editor-data.ts'],
    ['shopify-dependency', 'orders/order-sync.ts'],
  ] as const) {
    const result = await runOxlintFixture(
      `package-boundaries/valid/${fixture}`,
      entry,
      phoenixOptions,
    );
    expect(result.output).toBe('');
    expect(result.status).toBe(0);
  }
});

test('package boundaries allow composition and infrastructure layers to depend on packages', async () => {
  for (const [fixture, entry] of [
    ['composition-app', 'app/orders/page.tsx'],
    ['composition-components', 'components/features/orders/order-list.tsx'],
    ['composition-system', 'system/database/orders/order-list.dao.ts'],
  ] as const) {
    const result = await runOxlintFixture(
      `package-boundaries/valid/${fixture}`,
      entry,
      phoenixOptions,
    );
    expect(result.output).toBe('');
    expect(result.status).toBe(0);
  }
});

test('package boundaries reject imports of private packages from outside that package', async () => {
  const privateOptions = { ...phoenixOptions, privatePackages: ['visual'] };
  for (const [fixture, entry] of [
    ['private-package-app', 'app/visual/page.tsx'],
    ['private-package-relative', 'tests/edge-routing.test.ts'],
  ] as const) {
    const result = await runOxlintFixture(
      `package-boundaries/invalid/${fixture}`,
      entry,
      privateOptions,
    );
    expect(result.status).not.toBe(0);
    expect(result.output).toContain(privatePackageMessage);
  }
});

test('package boundaries allow imports inside a private package', async () => {
  const result = await runOxlintFixture(
    'package-boundaries/valid/private-package-internal',
    'visual/edge-routing/use.ts',
    { ...phoenixOptions, privatePackages: ['visual'] },
  );
  expect(result.output).toBe('');
  expect(result.status).toBe(0);
});

test('package boundaries reject imports of private composition roots from outside', async () => {
  const privateOptions = { ...phoenixOptions, privatePackages: ['app'] };
  const result = await runOxlintFixture(
    'package-boundaries/invalid/private-composition-root',
    'visual/auto-layout/use.ts',
    privateOptions,
  );
  expect(result.status).not.toBe(0);
  expect(result.output).toContain(privateAppMessage);
});

test('package boundaries allow imports inside a private composition root', async () => {
  const result = await runOxlintFixture(
    'package-boundaries/valid/private-composition-internal',
    'app/workflow-editor/use.ts',
    privateAppOptions,
  );
  expect(result.output).toBe('');
  expect(result.status).toBe(0);
});

test('package boundaries allow root tests and helpers to import private app', async () => {
  for (const [fixture, entry] of [
    ['private-app-from-tests', 'tests/components/card.test.ts'],
    ['private-app-from-tests', 'tests/support/card-render.ts'],
    ['private-app-from-tests', 'tests/setup/app-seed.ts'],
    ['private-app-from-tests', 'tests/e2e/login.pw.ts'],
    ['private-app-from-e2e-helper-import', 'tests/e2e/helper.ts'],
    ['private-app-relative-from-tests', 'tests/components/card.test.ts'],
  ] as const) {
    const result = await runOxlintFixture(
      `package-boundaries/valid/${fixture}`,
      entry,
      privateAppOptions,
    );
    expect(result.output).toBe('');
    expect(result.status).toBe(0);
  }
});

test('package boundaries reject private app imports from production and non-root tests trees', async () => {
  for (const [fixture, entry] of [
    ['private-app-from-system', 'system/example.ts'],
    ['private-app-from-system-tests', 'system/tests/example.test.ts'],
    ['private-app-from-tests-other', 'tests-other/example.ts'],
    ['private-app-from-testlike-name', 'system/card.test.ts'],
  ] as const) {
    const result = await runOxlintFixture(
      `package-boundaries/invalid/${fixture}`,
      entry,
      privateAppOptions,
    );
    expect(result.status).not.toBe(0);
    expect(result.output).toContain(privateAppMessage);
  }
});

test('package boundaries reject production imports of root tests modules', async () => {
  for (const [fixture, entry] of [
    ['production-imports-tests', 'system/example.ts'],
    ['app-imports-tests', 'app/page.ts'],
    ['production-reexports-tests', 'system/example.ts'],
  ] as const) {
    const result = await runOxlintFixture(
      `package-boundaries/invalid/${fixture}`,
      entry,
      privateAppOptions,
    );
    expect(result.status).not.toBe(0);
    expect(result.output).toContain(testsImportMessage);
  }
});

test('package boundaries keep other private packages closed to root tests', async () => {
  const result = await runOxlintFixture(
    'package-boundaries/invalid/private-other-from-tests',
    'tests/edge.test.ts',
    { ...phoenixOptions, privatePackages: ['visual'] },
  );
  expect(result.status).not.toBe(0);
  expect(result.output).toContain(privatePackageMessage);
});

test('package boundaries use defaults when gate options are absent', async () => {
  const allowed = await runOxlintFixture('package-boundaries/valid/default-config', 'config.ts');
  const rejected = await runOxlintFixture(
    'package-boundaries/invalid/default-next-config',
    'next.config.ts',
  );
  expect(allowed.output).toBe('');
  expect(allowed.status).toBe(0);
  expect(rejected.status).not.toBe(0);
  expect(rejected.output).toContain(placementMessage);
});
