const uiInternalImports = new Set([
  'class-variance-authority',
  'clsx',
  'lucide-react',
  'radix-ui',
  'shadcn',
  'tailwind-merge',
]);
const nativeUiElements = new Set(['button', 'input', 'label', 'option', 'select', 'textarea']);

function staticStringValue(node) {
  return node?.type === 'Literal' && typeof node.value === 'string' ? node.value : null;
}

const uiBoundary = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      dependency:
        'Import UI implementation dependencies only inside components/ui, components/layout, or lib/utils.ts.',
      native: 'Use a component from components/ui instead of the native <{{name}}> element.',
      styling: 'Use components from components/ui or components/layout instead of styling application code.',
    },
  },
  create(context) {
    const filename = context.filename.replaceAll('\\', '/');
    const isTestFile = filename.includes('/tests/') || filename.includes('/specs/');
    const isUiFile = filename.includes('/components/ui/');
    const isLayoutFile = filename.includes('/components/layout/');
    const isUiImplementationFile = isUiFile || isLayoutFile || filename.endsWith('/lib/utils.ts');
    const isApplicationFile =
      !isTestFile &&
      (filename.includes('/app/') ||
        filename.includes('/components/') ||
        filename.includes('/lib/') ||
        filename.endsWith('/instrumentation.ts'));
    const isApplicationView = !isTestFile && (filename.includes('/app/') || filename.includes('/components/'));

    return {
      ImportDeclaration(node) {
        if (!isApplicationFile || isUiImplementationFile) {
          return;
        }
        const source = staticStringValue(node.source);
        if (source && (uiInternalImports.has(source) || source.startsWith('@radix-ui/'))) {
          context.report({ node: node.source, messageId: 'dependency' });
        }
      },
      JSXAttribute(node) {
        if (
          isApplicationView &&
          !isUiFile &&
          !isLayoutFile &&
          node.name.type === 'JSXIdentifier' &&
          (node.name.name === 'className' || node.name.name === 'style')
        ) {
          context.report({ node, messageId: 'styling' });
        }
      },
      JSXOpeningElement(node) {
        if (
          isApplicationView &&
          !isUiFile &&
          node.name.type === 'JSXIdentifier' &&
          nativeUiElements.has(node.name.name)
        ) {
          context.report({ node, messageId: 'native', data: { name: node.name.name } });
        }
      },
    };
  },
};

const uiPlugin = {
  meta: {
    name: 'ui-quality',
  },
  rules: {
    boundary: uiBoundary,
  },
};

export default uiPlugin;
