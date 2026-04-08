/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      comment: 'Circular dependencies make runtime/type separation significantly harder to reason about.',
      severity: 'error',
      from: {},
      to: {
        circular: true,
      },
    },
    {
      name: 'types-files-must-not-import-runtime',
      comment:
        'Inside src/, files ending in .types.ts / .contracts.ts / .interfaces.ts / types.ts must only import type-only files.',
      severity: 'error',
      from: {
        path: '(\\.(types|contracts|interfaces)\\.ts$)|((^|/)types\\.ts$)',
      },
      to: {
        path: '^src/',
        pathNot: '(\\.(types|contracts|interfaces)\\.ts$)|((^|/)types\\.ts$)',
      },
    },
  ],
  options: {
    tsConfig: {
      fileName: 'tsconfig.json',
    },
    doNotFollow: {
      path: 'node_modules',
    },
    exclude: '(^node_modules|\\.d\\.ts$|\\.test\\.ts$|\\.spec\\.ts$)',
  },
};
