/**
 * eslint-plugin-kovo
 * ESLint rules for writing TSX that compiles to Xiaomi Vela .ux format.
 *
 * Install:
 *   npm install --save-dev eslint eslint-plugin-kovo
 *   # then add "kovo" to plugins in your .eslintrc
 *
 * Rules detect patterns that are valid React JSX but will NOT
 * compile correctly with the kovo compiler.
 */

'use strict';

module.exports = {
  rules: {
    /**
     * @rule unsupported-hooks
     * Supported hooks in Kovo: `useState`, `useEffect`.
     * Unsupported: `useContext`, `useReducer`, `useImperativeHandle`.
     */
    'unsupported-hooks': {
      meta: {
        type: 'suggestion',
        docs: { description: 'Only `useState` and `useEffect` are supported in Kovo.' },
        fixable: false,
      },
      create(context) {
        return {
          CallExpression(node) {
            if (
              node.callee.type === 'Identifier' &&
              (node.callee.name === 'useContext' ||
                node.callee.name === 'useReducer' ||
                node.callee.name === 'useImperativeHandle' ||
                node.callee.name === 'useLayoutEffect')
            ) {
              context.report({
                node,
                message: `Hook \`${node.callee.name}\` is not supported in Kovo. Use \`useState\` or \`useEffect\`.`,
              });
            }
          },
        };
      },
    },

    /**
     * @rule no-spread-attributes
     * Spread attributes `{...obj}` are not supported.
     * Bad:  <div {...props} />
     * Good: <div class={props.class} />
     */
    'no-spread-attributes': {
      meta: {
        type: 'error',
        docs: { description: 'Spread attributes are not supported in Kovo.' },
        fixable: false,
      },
      create(context) {
        return {
          JSXSpreadAttribute(node) {
            context.report({
              node,
              message: 'Spread `{...obj}` not supported in Kovo. Inline each attribute.',
            });
          },
        };
      },
    },

    /**
     * @rule no-fragments-with-children
     * Fragments with multiple children require a real container.
     * Bad:  <><text>A</text><text>B</text></>
     * Good: <div><text>A</text><text>B</text></div>
     */
    'no-fragments-with-children': {
      meta: {
        type: 'warning',
        docs: { description: 'Fragments with multiple children are auto-wrapped in <div>.' },
        fixable: false,
      },
      create(context) {
        return {
          JSXFragment(node) {
            if (node.children.length > 1 || node.children.some(c => c.type !== 'JSXText' || c.value.trim())) {
              context.report({
                node,
                message: 'Fragment with children will be auto-wrapped in <div> by the compiler. Use an explicit <div> for clarity.',
              });
            }
          },
        };
      },
    },

    /**
     * @rule prefer-className
     * Encourage using `className` instead of `class` for consistency with React.
     */
    'prefer-className': {
      meta: {
        type: 'suggestion',
        docs: { description: 'Use `className` instead of `class` for React-style consistency.' },
        fixable: false,
      },
      create(context) {
        return {
          JSXAttribute(node) {
            if (node.name && node.name.name === 'class') {
              context.report({
                node,
                message: 'Use `className` instead of `class` for consistency (both compile to `class=` in .ux).',
              });
            }
          },
        };
      },
    },

    /**
     * @rule no-key-prop
     * Vela doesn't use `key` for reconciliation.
     */
    'no-key-prop': {
      meta: {
        type: 'warning',
        docs: { description: 'Vela does not use `key`. Use `tid` on loop elements instead.' },
        fixable: false,
      },
      create(context) {
        return {
          JSXAttribute(node) {
            if (node.name && node.name.name === 'key') {
              context.report({
                node,
                message: '`key` prop is ignored in Vela. Use `tid` for loop element identity.',
              });
            }
          },
        };
      },
    },

    /**
     * @rule container-plain-text
     * Warn when plain text is inside a container (auto-wrapped in <text>).
     */
    'container-plain-text': {
      meta: {
        type: 'warning',
        docs: { description: 'Plain text inside containers is auto-wrapped in <text>.' },
        fixable: false,
      },
      create(context) {
        const CONTAINERS = new Set(['div', 'stack', 'list', 'list-item', 'scroll', 'swiper', 'image-animator', 'marquee']);
        return {
          JSXElement(node) {
            const tag = node.openingElement.name;
            const tagName = tag.type === 'JSXIdentifier' ? tag.name : '';
            if (!CONTAINERS.has(tagName)) return;
            for (const child of node.children) {
              if (child.type === 'JSXText' && child.value.trim()) {
                context.report({
                  node: child,
                  message: `Plain text inside <${tagName}> will be auto-wrapped in <text> by the compiler.`,
                });
              }
            }
          },
        };
      },
    },
  },
};
