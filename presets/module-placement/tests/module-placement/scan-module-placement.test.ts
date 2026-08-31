import { expect, test } from 'bun:test';

import { parsePresetConfig } from '../../gate-config.ts';
import {
  findDirectoryCapacityViolations,
  findRouteCompositionViolations,
  routeModuleReferences,
} from '../../scan-module-placement.ts';

const UI_ROOT = 'app/components/ui';

test('reports a directory that exceeds its TypeScript module limit', () => {
  const paths = Array.from(
    { length: 13 },
    (_, index) => `${UI_ROOT}/workflow/edit/module-${String(index)}.tsx`,
  );
  expect(findDirectoryCapacityViolations(paths, { [UI_ROOT]: 12 })).toEqual([
    {
      count: 13,
      directory: `${UI_ROOT}/workflow/edit`,
      limit: 12,
      root: UI_ROOT,
    },
  ]);
});

test('counts each directory independently', () => {
  const paths = [
    `${UI_ROOT}/button/button.tsx`,
    `${UI_ROOT}/button/button-appearance.ts`,
    `${UI_ROOT}/workflow/canvas/canvas.tsx`,
    `${UI_ROOT}/workflow/canvas/use-canvas.ts`,
  ];
  expect(findDirectoryCapacityViolations(paths, { [UI_ROOT]: 2 })).toEqual([]);
});

test('ignores files outside configured roots and non-TypeScript files', () => {
  const paths = [
    `${UI_ROOT}/button/button.tsx`,
    `${UI_ROOT}/button/styles.css`,
    'app/components/layout/one.tsx',
    'app/components/layout/two.tsx',
  ];
  expect(findDirectoryCapacityViolations(paths, { [UI_ROOT]: 1 })).toEqual([]);
});

test('parses depth and capacity limits only for watched roots', () => {
  expect(
    parsePresetConfig({
      directories: [UI_ROOT],
      maxDepth: { [UI_ROOT]: 2, 'app/components/layout': 3 },
      maxFilesPerDirectory: { [UI_ROOT]: 12, 'app/components/layout': 4 },
      routeCompositionRoots: {
        [UI_ROOT]: {
          manifest: 'app/routes.ts',
          presentationRoot: UI_ROOT,
        },
      },
    }),
  ).toEqual({
    directories: [UI_ROOT],
    forbidConcernPrefix: [],
    maxDepth: { [UI_ROOT]: 2 },
    maxFilesPerDirectory: { [UI_ROOT]: 12 },
    rootExceptions: {},
    routeCompositionRoots: {
      [UI_ROOT]: {
        manifest: 'app/routes.ts',
        presentationRoot: UI_ROOT,
      },
    },
  });
});

test('extracts nested route modules from a route manifest', () => {
  const source = `
    route('workflows', './app/workflow/list/list.tsx'),
    route('workflows/:id', './app/workflow/edit/edit.tsx'),
  `;
  expect([...routeModuleReferences(source, 'app/app', 'app/routes.ts')]).toEqual([
    'app/app/workflow/list/list.tsx',
    'app/app/workflow/edit/edit.tsx',
  ]);
});

test('directs unreferenced route-root views to the presentation tree', () => {
  const routeModules = new Set(['app/app/workflow/edit/edit.tsx']);
  expect(
    findRouteCompositionViolations(
      ['app/app/workflow/edit/edit.tsx', 'app/app/workflow/edit/view.tsx'],
      [
        {
          manifest: 'app/routes.ts',
          presentationRoot: UI_ROOT,
          root: 'app/app',
          routeModules,
        },
      ],
    ),
  ).toEqual([
    {
      manifest: 'app/routes.ts',
      path: 'app/app/workflow/edit/view.tsx',
      presentationRoot: UI_ROOT,
      root: 'app/app',
    },
  ]);
});
