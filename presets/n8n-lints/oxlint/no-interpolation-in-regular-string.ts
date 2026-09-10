import { defineRule } from '@oxlint/plugins';

// Split so this source file does not itself contain a quoted interpolation marker.
const INTERPOLATION_MARKER = '$' + '{';

export const noInterpolationInRegularString = defineRule({
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      useBackticks: 'Use backticks to interpolate; quoted strings cannot embed expressions.',
    },
  },
  createOnce(context) {
    return {
      Literal(node) {
        if (typeof node.value === 'string' && node.value.includes(INTERPOLATION_MARKER)) {
          context.report({ node, messageId: 'useBackticks' });
        }
      },
    };
  },
});
