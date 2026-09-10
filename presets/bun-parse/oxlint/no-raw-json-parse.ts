import { defineRule, type Context, type ESTree } from '@oxlint/plugins';

import {
  isAstNode,
  type AstParentOf,
  unwrapExpression,
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
import { collectParseValibotBindings, type ParseValibotBindings } from './valibot-bindings.ts';
import {
  createRawJsonValidationTracker,
  isDeferredRawJsonValidated,
  isValidationInput,
  noteTrackedRawJsonIdentifier,
  registerDeferredRawJsonValidation,
  trackedRawJsonEntries,
  type RawJsonValidationTracker,
} from './valibot-raw-validation.ts';
import { sourceImportsValibot, sourceUsesParseJson } from './source-fast-path.ts';
import { scanBareParseJsonViolations } from './valibot-bare-parse-json.ts';

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

function visitRawJsonCallExpression(
  context: Context,
  node: ESTree.CallExpression,
  fileBindings: BunFileBindings,
  valibotBindings: ParseValibotBindings,
  rawJsonTracker: RawJsonValidationTracker,
  parentOf: AstParentOf,
): void {
  if (rawJsonCallKind(context, node, fileBindings) != null) {
    reportRawJsonCall(context, node, fileBindings);
    return;
  }

  if (!isBunJsonSource(context, node, fileBindings)) {
    return;
  }
  if (isValidationInput(node, valibotBindings, parentOf)) {
    return;
  }
  if (registerDeferredRawJsonValidation(rawJsonTracker, node, parentOf)) {
    return;
  }
  context.report({ node, messageId: 'unvalidatedBunJson' });
}

const EMPTY_VALIBOT_BINDINGS: ParseValibotBindings = { named: new Set(), namespaces: new Set() };

export const noRawJsonParse = defineRule({
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      jsonParse: 'JSON.parse is banned outside tests.',
      jsonMethod: 'Non-Bun .json() is banned outside tests.',
      unvalidatedBunJson: 'Pass Bun JSON into v.parse(Schema, raw) before use.',
      unvalidatedParseJson:
        'Parse JSON text with v.pipe(v.string(), v.parseJson(), Schema); do not stop at unknown.',
    },
  },
  createOnce(context) {
    let trackValibot = false;
    let scanBareParseJson = false;
    let valibotBindings: ParseValibotBindings = EMPTY_VALIBOT_BINDINGS;
    let fileBindings = createEmptyBunFileBindings();
    let rawJsonTracker = createRawJsonValidationTracker();

    function parentOf(node: ESTree.Node): ESTree.Node | null {
      const ancestors = context.sourceCode.getAncestors(node);
      const parent: unknown = ancestors[ancestors.length - 1];
      return isAstNode(parent) ? parent : null;
    }

    return {
      before() {
        const relativePath = projectPath(context);
        const sourceText = context.sourceCode.text;
        if (
          isUnderPathSegment(relativePath, 'tests') ||
          !/\b(?:JSON|json|readableStreamToJSON|parseJson)\b/u.test(sourceText)
        ) {
          return false;
        }
        trackValibot = sourceImportsValibot(sourceText);
        valibotBindings = trackValibot
          ? collectParseValibotBindings(context.sourceCode.ast)
          : EMPTY_VALIBOT_BINDINGS;
        fileBindings = createEmptyBunFileBindings();
        rawJsonTracker = createRawJsonValidationTracker();
        scanBareParseJson = trackValibot && sourceUsesParseJson(sourceText);
        return undefined;
      },
      ImportDeclaration(node) {
        if (node.source.value === 'bun') {
          for (const specifier of node.specifiers) {
            noteBunFileImport(context, specifier, fileBindings);
          }
        }
      },
      VariableDeclarator(node) {
        noteConstBunFileBinding(context, node, parentOf(node), fileBindings);
      },
      CallExpression(node) {
        visitRawJsonCallExpression(
          context,
          node,
          fileBindings,
          valibotBindings,
          rawJsonTracker,
          parentOf,
        );
      },
      Identifier(node) {
        if (trackValibot && rawJsonTracker.byName.size > 0) {
          noteTrackedRawJsonIdentifier(node, valibotBindings, rawJsonTracker, parentOf);
        }
      },
      after() {
        for (const entry of trackedRawJsonEntries(rawJsonTracker)) {
          if (!isDeferredRawJsonValidated(entry)) {
            context.report({ node: entry.initCall, messageId: 'unvalidatedBunJson' });
          }
        }
        if (scanBareParseJson) {
          scanBareParseJsonViolations(context, context.sourceCode.ast, context.sourceCode.text);
        }
      },
    };
  },
});
