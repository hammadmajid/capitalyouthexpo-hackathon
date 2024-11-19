// Counts lines containing code tokens, excluding blank/comment-only lines.
const fileSizeTarget = {
  meta: {
    type: 'suggestion',
    schema: [],
    messages: { large: 'Target 300 code lines; split by responsibility.' },
  },
  create(context) {
    return {
      'Program:exit'(node) {
        const lines = new Set();
        for (const token of context.sourceCode.getTokens(node)) {
          for (let line = token.loc.start.line; line <= token.loc.end.line; line++) lines.add(line);
        }
        if (lines.size > 300) context.report({ node, messageId: 'large' });
      },
    };
  },
};
const noAppHex = {
  meta: {
    type: 'problem',
    schema: [],
    messages: { color: 'Use shared design tokens instead of hex colors in apps.' },
  },
  create(context) {
    return {
      Hash(node) {
        context.report({ node, messageId: 'color' });
      },
      Literal(node) {
        if (
          typeof node.value === 'string' &&
          /#(?:[a-f\d]{8}|[a-f\d]{6}|[a-f\d]{3})\b/i.test(node.value)
        ) {
          context.report({ node, messageId: 'color' });
        }
      },
    };
  },
};
export default { rules: { 'file-size-target': fileSizeTarget, 'no-app-hex': noAppHex } };
