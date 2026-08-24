import {
  definePlugin,
  defineRule,
  eslintCompatPlugin,
  type Context,
  type ESTree,
} from '@oxlint/plugins';

import { walkAst } from '../../../scripts/oxlint-walk/oxlint-walk.ts';

const e2eDirectoryPattern = /(?:^|\/)tests\/e2e\//u;
const playwrightConfigPattern = /(?:^|\/)playwright\.config\.[cm]?[jt]s$/u;
const bunTestApiNames = new Set(['test', 'it', 'describe']);
const browserLaunchNames = new Set(['chromium', 'firefox', 'webkit']);
const childProcessModules = new Set(['node:child_process', 'child_process']);
const daoImportPattern = /\.dao(?:\.[cm]?[jt]s)?$/u;
const databaseImportPattern = /(?:^|\/)system\/database(?:\/|$)/u;
const testDatabaseImportPattern = /(?:^|\/)testDatabase(?:\.[cm]?[jt]s)?$/u;
const allowedE2eSourcePattern =
  /(?:^|\/)tests\/e2e\/(?:.+\/)?(?:[^/]+\.pw\.[jt]sx?|[^/]+\.helpers\.[jt]sx?|[^/]+\.types\.ts)$/u;

function normalizedFilename(context: Context): string {
  return context.filename.replaceAll('\\', '/');
}

function projectPath(context: Context): string {
  const root = context.cwd.replaceAll('\\', '/');
  const filename = normalizedFilename(context);
  return filename.startsWith(`${root}/`) ? filename.slice(root.length + 1) : filename;
}

function importSource(node: ESTree.ImportDeclaration): string | null {
  return typeof node.source.value === 'string' ? node.source.value : null;
}

function importedName(specifier: ESTree.Node): string | null {
  return specifier.type === 'ImportSpecifier' && specifier.imported.type === 'Identifier'
    ? specifier.imported.name
    : null;
}

function identifierName(node: ESTree.Node): string | null {
  return node.type === 'Identifier' ? node.name : null;
}

function propertyName(node: ESTree.Node): string | null {
  if (node.type === 'Identifier') {
    return node.name;
  }
  if (node.type === 'Literal' && typeof node.value === 'string') {
    return node.value;
  }
  return null;
}

function objectProperty(object: ESTree.ObjectExpression, name: string): ESTree.Node | null {
  for (const property of object.properties) {
    if (property.type !== 'Property' || property.computed) {
      continue;
    }
    if (propertyName(property.key) === name) {
      return property;
    }
  }
  return null;
}

function isDefineConfigCallee(node: ESTree.Node): boolean {
  if (identifierName(node) === 'defineConfig') {
    return true;
  }
  return (
    node.type === 'MemberExpression' &&
    !node.computed &&
    propertyName(node.property) === 'defineConfig'
  );
}

function configObjectFromDefaultExport(
  node: ESTree.ExportDefaultDeclaration,
): ESTree.ObjectExpression | null {
  const declaration = node.declaration;
  if (declaration.type === 'ObjectExpression') {
    return declaration;
  }
  if (
    declaration.type === 'CallExpression' &&
    isDefineConfigCallee(declaration.callee) &&
    declaration.arguments[0]?.type === 'ObjectExpression'
  ) {
    return declaration.arguments[0];
  }
  return null;
}

function hasBaseUrl(useProperty: ESTree.Node): boolean {
  if (useProperty.type !== 'Property') {
    return false;
  }
  const value = useProperty.value;
  return value.type === 'ObjectExpression' && objectProperty(value, 'baseURL') !== null;
}

function isPlaywrightConfigComplete(config: ESTree.ObjectExpression): boolean {
  const useProperty = objectProperty(config, 'use');
  return (
    objectProperty(config, 'webServer') !== null && useProperty !== null && hasBaseUrl(useProperty)
  );
}

function createForE2eFilesOnce(context: Context, runScan: (relativePath: string) => void) {
  return {
    before() {
      const relativePath = projectPath(context);
      if (!e2eDirectoryPattern.test(relativePath)) {
        return false;
      }
      runScan(relativePath);
      return false;
    },
    Program() {},
  };
}

function reportE2eFilename(context: Context, node: ESTree.Program, relativePath: string): void {
  if (!allowedE2eSourcePattern.test(relativePath)) {
    context.report({ node, messageId: 'filename' });
  }
}

function reportE2eImports(context: Context, node: ESTree.ImportDeclaration): void {
  const source = importSource(node);
  if (source === 'bun:test') {
    for (const specifier of node.specifiers) {
      if (bunTestApiNames.has(importedName(specifier) ?? '')) {
        context.report({ node: specifier, messageId: 'bunTest' });
      }
    }
  }
  if (source !== null && childProcessModules.has(source)) {
    context.report({ node: node.source, messageId: 'spawn' });
  }
  if (source !== null && testDatabaseImportPattern.test(source)) {
    context.report({ node: node.source, messageId: 'bunHook' });
  }
}

function reportBrowserLaunch(context: Context, node: ESTree.CallExpression): void {
  if (node.callee.type !== 'MemberExpression' || node.callee.computed) {
    return;
  }
  if (propertyName(node.callee.property) !== 'launch') {
    return;
  }
  if (browserLaunchNames.has(identifierName(node.callee.object) ?? '')) {
    context.report({ node, messageId: 'launch' });
  }
}

function reportBunSpawn(context: Context, node: ESTree.MemberExpression): void {
  if (node.computed) {
    return;
  }
  if (identifierName(node.object) !== 'Bun' || propertyName(node.property) !== 'spawn') {
    return;
  }
  context.report({ node, messageId: 'spawn' });
}

function inspectE2eRunnerNode(context: Context, node: ESTree.Node, relativePath: string): void {
  switch (node.type) {
    case 'Program':
      reportE2eFilename(context, node, relativePath);
      break;
    case 'ImportDeclaration':
      reportE2eImports(context, node);
      break;
    case 'CallExpression':
      reportBrowserLaunch(context, node);
      break;
    case 'MemberExpression':
      reportBunSpawn(context, node);
      break;
    default:
      break;
  }
}

function reportBlackBoxImport(context: Context, node: ESTree.ImportDeclaration): void {
  const source = importSource(node);
  if (source === null) {
    return;
  }
  if (daoImportPattern.test(source)) {
    context.report({ node: node.source, messageId: 'dao' });
    return;
  }
  if (databaseImportPattern.test(source)) {
    context.report({ node: node.source, messageId: 'database' });
  }
}

export const e2eRunner = defineRule({
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      bunTest: 'Playwright e2e must import test from @playwright/test, not bun:test.',
      launch:
        'Playwright e2e must use the page fixture; do not call chromium.launch, firefox.launch, or webkit.launch.',
      spawn:
        'Playwright e2e must not spawn the app server; declare webServer in playwright.config.ts.',
      filename: 'Playwright e2e specs must be named tests/e2e/**/*.pw.ts.',
      bunHook:
        'Playwright e2e must not import tests/setup/testDatabase.ts; start the app through playwright.config webServer.',
    },
  },
  createOnce(context) {
    return createForE2eFilesOnce(context, (relativePath) => {
      walkAst(context.sourceCode.ast, (node) => {
        inspectE2eRunnerNode(context, node, relativePath);
      });
    });
  },
});

export const e2eBlackBox = defineRule({
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      dao: 'Playwright e2e must not import DAO modules; drive the app through the UI.',
      database: 'Playwright e2e must not import system/database; drive the app through the UI.',
    },
  },
  createOnce(context) {
    return createForE2eFilesOnce(context, () => {
      walkAst(context.sourceCode.ast, (node) => {
        if (node.type === 'ImportDeclaration') {
          reportBlackBoxImport(context, node);
        }
      });
    });
  },
});

export const playwrightConfig = defineRule({
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      required: 'Playwright config must set use.baseURL and webServer.',
    },
  },
  createOnce(context) {
    return {
      before() {
        if (!playwrightConfigPattern.test(projectPath(context))) {
          return false;
        }
        walkAst(context.sourceCode.ast, (node) => {
          if (node.type !== 'ExportDefaultDeclaration') {
            return;
          }
          const config = configObjectFromDefaultExport(node);
          if (config === null || isPlaywrightConfigComplete(config)) {
            return;
          }
          context.report({ node, messageId: 'required' });
        });
        return false;
      },
      Program() {},
    };
  },
});

export const playwrightPlugin = {
  meta: {
    name: 'playwright',
  },
  rules: {
    'e2e-runner': e2eRunner,
    'e2e-black-box': e2eBlackBox,
    config: playwrightConfig,
  },
};

export default eslintCompatPlugin(definePlugin(playwrightPlugin));
