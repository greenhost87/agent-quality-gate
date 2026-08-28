import { defineRule, type Context, type ESTree } from '@oxlint/plugins';

import {
  attachAstParent,
  unwrapExpression,
  walkAstSkippingTypeAndJsxMarkup,
} from '../../../scripts/oxlint-walk/oxlint-walk.ts';
import {
  createEmptyBunFileBindings,
  isBunFileFactoryCall,
  isConstBunFileBinding,
  noteBunFileImport,
  noteConstBunFileBinding,
} from './bun-file-bindings.ts';
import type { BunFileBindings } from './bun-file-bindings.ts';
import { memberName } from './member-name.ts';
import { isUnderPathSegment, projectPath } from './project-path.ts';
import {
  createRawJsonValidationTracker,
  isDeferredRawJsonValidated,
  isValidationInput,
  noteTrackedRawJsonIdentifier,
  noteValibotBindingsFromImport,
  registerDeferredRawJsonValidation,
  trackedRawJsonEntries,
  type ValibotBindings,
} from './valibot-raw-validation.ts';

function memberCallCallee(node: ESTree.CallExpression): ESTree.MemberExpression | null {
  const callee = unwrapExpression(node.callee);
  return callee.type === 'MemberExpression' ? callee : null;
}

function isIdentifierNamed(node: ESTree.Expression, name: string): boolean {
  const unwrapped = unwrapExpression(node);
  return unwrapped.type === 'Identifier' && unwrapped.name === name;
}

function isMemberCallOn(node: ESTree.CallExpression, member: string, objectName: string): boolean {
  const callee = memberCallCallee(node);
  return (
    callee != null && memberName(callee) === member && isIdentifierNamed(callee.object, objectName)
  );
}

function isMemberMethodCall(node: ESTree.CallExpression, member: string): boolean {
  const callee = memberCallCallee(node);
  return callee != null && memberName(callee) === member;
}

function isJsonParseCall(node: ESTree.CallExpression): boolean {
  return isMemberCallOn(node, 'parse', 'JSON');
}

function isAllowedJsonReceiver(
  context: Context,
  node: ESTree.Expression,
  fileBindings: BunFileBindings,
): boolean {
  const receiver = unwrapExpression(node);
  if (receiver.type === 'CallExpression') {
    return isBunFileFactoryCall(context, receiver, fileBindings);
  }
  return receiver.type === 'Identifier' && isConstBunFileBinding(context, receiver, fileBindings);
}

function isBunFileJsonCall(
  context: Context,
  node: ESTree.CallExpression,
  fileBindings: BunFileBindings,
): boolean {
  const callee = memberCallCallee(node);
  if (callee == null || memberName(callee) !== 'json') {
    return false;
  }
  return isAllowedJsonReceiver(context, callee.object, fileBindings);
}

function isBunReadableStreamToJson(node: ESTree.CallExpression): boolean {
  return isMemberCallOn(node, 'readableStreamToJSON', 'Bun');
}

function rawJsonCallKind(
  context: Context,
  node: ESTree.CallExpression,
  fileBindings: BunFileBindings,
): 'jsonMethod' | 'jsonParse' | null {
  if (isJsonParseCall(node)) {
    return 'jsonParse';
  }
  if (isMemberMethodCall(node, 'json') && !isBunFileJsonCall(context, node, fileBindings)) {
    return 'jsonMethod';
  }
  return null;
}

function isBunJsonSource(
  context: Context,
  node: ESTree.CallExpression,
  fileBindings: BunFileBindings,
): boolean {
  return isBunFileJsonCall(context, node, fileBindings) || isBunReadableStreamToJson(node);
}

function reportRawJsonCall(
  context: Context,
  node: ESTree.CallExpression,
  fileBindings: BunFileBindings,
): void {
  const kind = rawJsonCallKind(context, node, fileBindings);
  if (kind != null) {
    context.report({ node, messageId: kind });
  }
}

function scanRawJsonCalls(context: Context, root: ESTree.Node): void {
  const valibotBindings: ValibotBindings = { named: new Set(), namespaces: new Set() };
  const fileBindings = createEmptyBunFileBindings();
  const rawJsonTracker = createRawJsonValidationTracker();

  walkAstSkippingTypeAndJsxMarkup(root, (node, parent) => {
    attachAstParent(node, parent);

    if (node.type === 'ImportDeclaration') {
      noteValibotBindingsFromImport(node, valibotBindings);
      if (node.source.value === 'bun') {
        for (const specifier of node.specifiers) {
          noteBunFileImport(context, specifier, fileBindings);
        }
      }
    }

    if (node.type === 'VariableDeclarator') {
      noteConstBunFileBinding(context, node, parent, fileBindings);
    }

    if (node.type === 'Identifier' && rawJsonTracker.byName.size > 0) {
      noteTrackedRawJsonIdentifier(node, valibotBindings, rawJsonTracker);
    }

    if (node.type !== 'CallExpression') {
      return;
    }

    if (rawJsonCallKind(context, node, fileBindings) != null) {
      reportRawJsonCall(context, node, fileBindings);
      return;
    }

    if (!isBunJsonSource(context, node, fileBindings)) {
      return;
    }
    if (isValidationInput(node, valibotBindings)) {
      return;
    }
    if (registerDeferredRawJsonValidation(rawJsonTracker, node)) {
      return;
    }
    context.report({ node, messageId: 'unvalidatedBunJson' });
  });

  for (const entry of trackedRawJsonEntries(rawJsonTracker)) {
    if (!isDeferredRawJsonValidated(entry)) {
      context.report({ node: entry.initCall, messageId: 'unvalidatedBunJson' });
    }
  }
}

export const noRawJsonParse = defineRule({
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      jsonParse: 'JSON.parse is banned outside tests.',
      jsonMethod: 'Non-Bun .json() is banned outside tests.',
      unvalidatedBunJson: 'Pass Bun JSON into v.parse(Schema, raw) before use.',
    },
  },
  createOnce(context) {
    return {
      before() {
        const relativePath = projectPath(context);
        if (
          isUnderPathSegment(relativePath, 'tests') ||
          !/\b(?:JSON|json|readableStreamToJSON)\b/u.test(context.sourceCode.text)
        ) {
          return false;
        }
        scanRawJsonCalls(context, context.sourceCode.ast);
        return false;
      },
      Program() {},
    };
  },
});
