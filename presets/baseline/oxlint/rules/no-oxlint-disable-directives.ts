import { defineRule } from '@oxlint/plugins';

/**
 * Forbid `oxlint-disable*` directives.
 *
 * Reports at Program.loc.end so blanket / same-line disable directives cannot
 * swallow the diagnostic. The real source line is encoded in the message.
 */
export default defineRule({
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      forbidden: 'Inline lint directives are forbidden ({{kind}} at line {{line}})',
    },
  },
  createOnce(context) {
    return {
      before() {
        const { directives } = context.sourceCode.getDisableDirectives();
        const end = context.sourceCode.ast.loc.end;
        for (const directive of directives) {
          if (directive.type === 'enable') {
            continue;
          }
          if (!/\boxlint-disable(?:-line|-next-line)?\b/u.test(directive.node.value)) {
            continue;
          }
          context.report({
            loc: {
              start: { line: end.line, column: end.column },
              end: { line: end.line, column: end.column },
            },
            messageId: 'forbidden',
            data: {
              kind: directive.type,
              line: String(directive.node.loc.start.line),
            },
          });
        }
        return false;
      },
      Program() {},
    };
  },
});
