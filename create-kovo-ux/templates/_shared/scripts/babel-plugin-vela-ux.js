/**
 * babel-plugin-vela-ux
 * ----------------------------------------------------------------------------
 * Transforms TSX files written in React-style JSX into Xiaomi Vela .ux files
 * (template + style + script blocks).
 *
 * Two input styles are supported:
 *
 * 1. React-style function components (recommended):
 *
 *   export default function Counter({ step = 1 }) {
 *     const [count, setCount] = useState(0);
 *     const doubled = count * 2;                 // -> computed
 *     useEffect(() => {                          // -> onInit / $watch / onDestroy
 *       const id = setInterval(tick, 1000);
 *       return () => clearInterval(id);
 *     }, []);
 *     function tick() { setCount((c) => c + step); }
 *     return <text>{count} / {doubled}</text>;
 *   }
 *
 * 2. Vela-style object components (export default { data, template, ... }).
 *
 * The compiler maps React concepts onto native Vela ViewModel features
 * (data / protected, computed, $watch, $emit, $element, lifecycles) so the
 * output runs with zero runtime overhead. References to component members are
 * rewritten with Babel scope analysis, never with text replacement.
 */

const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const generator = require('@babel/generator').default;
const t = require('@babel/types');

const EVENT_MAP = {
  onClick: 'click',
  onclick: 'click',
  onLongPress: 'longpress',
  onlongpress: 'longpress',
  onSwipe: 'swipe',
  onswipe: 'swipe',
  onTouchStart: 'touchstart',
  ontouchstart: 'touchstart',
  onTouchMove: 'touchmove',
  ontouchmove: 'touchmove',
  onTouchEnd: 'touchend',
  ontouchend: 'touchend',
  onTouchCancel: 'touchcancel',
  ontouchcancel: 'touchcancel',
  onChange: 'change',
  onchange: 'change',
  onFocus: 'focus',
  onfocus: 'focus',
  onBlur: 'blur',
  onblur: 'blur',
  onAppear: 'appear',
  onappear: 'appear',
  onDisappear: 'disappear',
  ondisappear: 'disappear',
  onScroll: 'scroll',
  onscroll: 'scroll',
  onKey: 'key',
  onkey: 'key',
};

const CONTAINER_LIKE = new Set([
  'div', 'stack', 'list', 'list-item', 'scroll', 'swiper',
  'image-animator', 'marquee', 'block',
]);

const TEXT_LIKE = new Set(['text', 'span']);

// Names Vela reserves in data / computed (see guide/framework/script/page-data).
const RESERVED_NAMES = new Set(['for', 'if', 'elif', 'else', 'show', 'tid']);

const KOVO_MODULES = new Set(['kovo-ux', 'kovo', 'vela-jsx', 'react']);

const KNOWN_HOOKS = new Set([
  'useState', 'useRef', 'useEffect', 'useLayoutEffect', 'useMemo', 'useCallback',
]);

// Identifiers a template binding may use without them living on the ViewModel.
const TEMPLATE_GLOBALS = new Set([
  'undefined', 'NaN', 'Infinity', 'Math', 'JSON', 'String', 'Number', 'Boolean',
  'Array', 'Object', 'Date', 'parseInt', 'parseFloat', 'isNaN',
]);

const KOVO_ARGS_HELPER =
  'function kovoArgs(evt) {\n' +
  '  var d = evt && evt.detail;\n' +
  '  return d && d.kovoArgs ? d.kovoArgs : [d];\n' +
  '}';

// -----------------------------------------------------------------------------
// Compilation context
// -----------------------------------------------------------------------------

function createContext(filename, options) {
  return {
    filename,
    options,
    warnings: [],
    warn(msg) {
      if (!this.warnings.includes(msg)) this.warnings.push(msg);
    },
    componentRegistry: new Map(),
    templateImports: [],
    usedComponents: new Set(),
    inlineCache: new Map(),
    moduleCache: new Map(),
    inlinedHookImports: new Set(),
    importedDeps: new Set(),
    extraBindings: new Map(),
    extraImports: [],
    extraHelpers: [],
    inlineStyles: [],
    inlinedComponents: new Set(),
    moduleBindings: new Map(),
    usesKovoArgs: false,
    usedClasses: new Set(),
    classesUnknown: false,
    isFunctionComponent: false,
    // Function component model while its template is being serialized.
    component: null,
    // Stack of active `.map()` loops: { item, index, names: Set }.
    loops: [],
  };
}

function loopVarNames(ctx) {
  const names = [];
  for (const loop of ctx.loops) {
    if (loop.index) names.push(loop.index);
    names.push(loop.item);
  }
  return names;
}

// -----------------------------------------------------------------------------
// Utility helpers
// -----------------------------------------------------------------------------

function exprSource(node) {
  if (!node) return '';
  return generator(node).code.trim();
}

/**
 * Template-expression quoting. The toolkit splits `{{ }}` with a tokenizer that
 * ignores backslash escapes (`\'` ends the string for it), and `"` would end the
 * XML attribute, so quotes inside literals become `\x27` / `\x22`.
 */
function velaStringRaw(value) {
  const body = value.replace(/\\/g, '\\\\').replace(/'/g, '\\x27').replace(/"/g, '\\x22')
    .replace(/\n/g, '\\n').replace(/\r/g, '\\r');
  return `'${body}'`;
}

/**
 * Source of an expression for a `{{ }}` binding: `this.x` -> `x` (bindings are
 * evaluated against the ViewModel) and string literals re-quoted for the template.
 */
function velaExprSource(node) {
  const expr = rewriteTree(t.cloneNode(node, true), (n) => {
    if (t.isMemberExpression(n) && !n.computed && t.isThisExpression(n.object) && t.isIdentifier(n.property)) {
      return t.identifier(n.property.name);
    }
    if (t.isStringLiteral(n)) {
      const lit = t.stringLiteral(n.value);
      lit.extra = { rawValue: n.value, raw: velaStringRaw(n.value) };
      return lit;
    }
    return undefined;
  });
  return exprSource(expr);
}

function camelToKebab(s) {
  return s.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
}

function pascalToKebab(s) {
  return camelToKebab(s).replace(/^-/, '');
}

function lowerFirst(s) {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getElementName(node) {
  const n = node.openingElement.name;
  if (t.isJSXIdentifier(n)) return n.name;
  if (t.isJSXNamespacedName(n)) return `${n.namespace.name}:${n.name.name}`;
  if (t.isJSXMemberExpression(n)) {
    const obj = n.object;
    const objName = t.isJSXIdentifier(obj) ? obj.name : '<expr>';
    return `${objName}.${n.property.name}`;
  }
  return '?';
}

function isCustomComponent(name, ctx) {
  if (ctx.componentRegistry.has(name)) return true;
  return /^[A-Z]/.test(name) || name.includes('.') || name.includes(':');
}

function propKeyName(key) {
  if (t.isIdentifier(key)) return key.name;
  if (t.isStringLiteral(key) || t.isNumericLiteral(key)) return String(key.value);
  return null;
}

function unwrapParens(node) {
  while (node && (t.isParenthesizedExpression(node) || t.isTSAsExpression(node))) {
    node = node.expression;
  }
  return node;
}

function isFunctionNode(node) {
  return t.isArrowFunctionExpression(node) || t.isFunctionExpression(node);
}

function calleeName(call) {
  if (!t.isCallExpression(call)) return '';
  const c = call.callee;
  if (t.isIdentifier(c)) return c.name;
  if (t.isMemberExpression(c) && t.isIdentifier(c.property)) return c.property.name;
  return '';
}

function cssFromNode(node) {
  if (t.isStringLiteral(node)) return node.value;
  if (t.isTemplateLiteral(node)) return node.quasis.map((q) => q.value.cooked).join('');
  return null;
}

/**
 * Post-order rewrite of a detached AST. `visit(node, parent, key)` returns a
 * replacement node or undefined. Used for template-only substitutions where
 * Babel scope tracking is not needed (JSX bindings cannot declare variables).
 */
function rewriteTree(node, visit, parent = null, key = null) {
  if (!node || typeof node.type !== 'string') return node;
  for (const k of t.VISITOR_KEYS[node.type] || []) {
    const child = node[k];
    if (Array.isArray(child)) {
      for (let i = 0; i < child.length; i++) child[i] = rewriteTree(child[i], visit, node, k);
    } else if (child) {
      node[k] = rewriteTree(child, visit, node, k);
    }
  }
  const replacement = visit(node, parent, key);
  return replacement === undefined ? node : replacement;
}

/** Names of identifiers read by `node` (approximate: ignores shadowing). */
function referencedNames(node) {
  const names = new Set();
  (function walk(n, parent, grandparent) {
    if (!n || typeof n.type !== 'string') return;
    if (t.isIdentifier(n) && (!parent || t.isReferenced(n, parent, grandparent))) {
      names.add(n.name);
    }
    for (const k of t.VISITOR_KEYS[n.type] || []) {
      const child = n[k];
      if (Array.isArray(child)) child.forEach((c) => walk(c, n, parent));
      else walk(child, n, parent);
    }
  })(node, null, null);
  return names;
}

function containsFunction(node) {
  let found = false;
  t.traverseFast(node, (n) => {
    if (isFunctionNode(n)) found = true;
  });
  return found;
}

function substituteIdentifiers(node, map) {
  return rewriteTree(t.cloneNode(node, true), (n, parent) => {
    if (t.isIdentifier(n) && map.has(n.name) && parent && t.isReferenced(n, parent)) {
      return t.cloneNode(map.get(n.name), true);
    }
    if (t.isObjectProperty(n) && n.shorthand && t.isIdentifier(n.key) && map.has(n.key.name)) {
      n.shorthand = false;
    }
    return undefined;
  });
}

function templateLiteralToConcat(tl) {
  const parts = [];
  tl.quasis.forEach((q, i) => {
    if (q.value.cooked) parts.push(t.stringLiteral(q.value.cooked));
    if (tl.expressions[i]) parts.push(tl.expressions[i]);
  });
  if (parts.length === 0) return t.stringLiteral('');
  if (!t.isStringLiteral(parts[0])) parts.unshift(t.stringLiteral(''));
  return parts.reduce((acc, p) => t.binaryExpression('+', acc, p));
}

/** Folds `'a' + 'b'`, `('x')` and literal template strings into a single literal. */
function foldConstants(node) {
  return rewriteTree(t.cloneNode(node, true), (n) => {
    if (t.isParenthesizedExpression(n) && (t.isStringLiteral(n.expression) || t.isNumericLiteral(n.expression))) {
      return n.expression;
    }
    if (t.isBinaryExpression(n, { operator: '+' })) {
      const lit = (x) => t.isStringLiteral(x) || t.isNumericLiteral(x);
      if (lit(n.left) && lit(n.right)) {
        const v = n.left.value + n.right.value;
        return typeof v === 'string' ? t.stringLiteral(v) : t.numericLiteral(v);
      }
    }
    if (t.isTemplateLiteral(n) && n.expressions.length === 0) {
      return t.stringLiteral(n.quasis.map((q) => q.value.cooked).join(''));
    }
    return undefined;
  });
}

// -----------------------------------------------------------------------------
// TypeScript stripping (the .ux script block must be plain JS)
// -----------------------------------------------------------------------------

function stripTypes(ast) {
  traverse(ast, {
    'TSTypeAnnotation|TSTypeParameterDeclaration|TSTypeParameterInstantiation'(p) {
      p.remove();
    },
    'TSAsExpression|TSSatisfiesExpression|TSNonNullExpression|TSTypeAssertion'(p) {
      p.replaceWith(p.node.expression);
    },
    'TSInterfaceDeclaration|TSTypeAliasDeclaration|TSDeclareFunction|TSModuleDeclaration'(p) {
      if (p.parentPath.isExportNamedDeclaration()) p.parentPath.remove();
      else p.remove();
    },
    ImportDeclaration(p) {
      if (p.node.importKind === 'type') {
        p.remove();
        return;
      }
      p.node.specifiers = p.node.specifiers.filter((s) => s.importKind !== 'type');
    },
    ExportNamedDeclaration(p) {
      if (p.node.exportKind === 'type') p.remove();
    },
    Function(p) {
      for (const param of p.node.params) {
        if (param.optional) param.optional = false;
      }
    },
    ClassProperty(p) {
      p.node.accessibility = null;
    },
  });
}

/** Map a TS type annotation to a Vela prop `type` constructor name. */
function velaTypeFor(tsType) {
  if (!tsType) return null;
  switch (tsType.type) {
    case 'TSStringKeyword':
      return 'String';
    case 'TSNumberKeyword':
      return 'Number';
    case 'TSBooleanKeyword':
      return 'Boolean';
    case 'TSFunctionType':
      return 'Function';
    case 'TSArrayType':
    case 'TSTupleType':
      return 'Array';
    case 'TSTypeLiteral':
      return 'Object';
    case 'TSLiteralType':
      if (t.isStringLiteral(tsType.literal)) return 'String';
      if (t.isNumericLiteral(tsType.literal)) return 'Number';
      if (t.isBooleanLiteral(tsType.literal)) return 'Boolean';
      return null;
    case 'TSTypeReference': {
      const n = t.isIdentifier(tsType.typeName) ? tsType.typeName.name : '';
      if (n === 'Array' || n === 'ReadonlyArray') return 'Array';
      if (n === 'Record') return 'Object';
      return null;
    }
    case 'TSUnionType': {
      const kinds = new Set(
        tsType.types
          .filter((x) => x.type !== 'TSUndefinedKeyword' && x.type !== 'TSNullKeyword')
          .map(velaTypeFor),
      );
      return kinds.size === 1 ? [...kinds][0] : null;
    }
    default:
      return null;
  }
}

/** Collect `{ propName: 'String' | ... }` from the first param's type annotation. */
function collectPropTypes(ast, fnNode) {
  const result = new Map();
  const p0 = fnNode && fnNode.params && fnNode.params[0];
  const ann = p0 && p0.typeAnnotation && p0.typeAnnotation.typeAnnotation;
  if (!ann) return result;

  let members = null;
  if (t.isTSTypeLiteral(ann)) members = ann.members;
  else if (t.isTSTypeReference(ann) && t.isIdentifier(ann.typeName)) {
    const typeName = ann.typeName.name;
    for (let stmt of ast.program.body) {
      if (t.isExportNamedDeclaration(stmt) && stmt.declaration) stmt = stmt.declaration;
      if (t.isTSInterfaceDeclaration(stmt) && stmt.id.name === typeName) members = stmt.body.body;
      if (t.isTSTypeAliasDeclaration(stmt) && stmt.id.name === typeName && t.isTSTypeLiteral(stmt.typeAnnotation)) {
        members = stmt.typeAnnotation.members;
      }
    }
  }
  for (const m of members || []) {
    if (!t.isTSPropertySignature(m)) continue;
    const name = propKeyName(m.key);
    const type = velaTypeFor(m.typeAnnotation && m.typeAnnotation.typeAnnotation);
    if (name && type) result.set(name, type);
  }
  return result;
}

// -----------------------------------------------------------------------------
// Glyph check: the watch system font is a CJK font without emoji. Verified on
// the Vela emulator: emoji, Hangul and ↻ ♡ ♪ ♫ ✗ render as empty boxes, while
// arrows (← → ↑ ↓ ⇄), shapes (● ○ ■ □ ▲ ▼ ◆ ★ ☆), ✓ ✕ and Latin/CJK punctuation work.
// -----------------------------------------------------------------------------

const MISSING_GLYPH_RE = /[\p{Extended_Pictographic}\p{Script=Hangul}↻♡♪♫✗]/gu;
// Pictographic in Unicode but present in the font (verified).
const FONT_HAS_GLYPH = new Set(['★']);

// Replacements limited to glyphs verified on the emulator.
const GLYPH_SUGGESTIONS = {
  '✔': '✓', '✅': '✓', '☑': '✓',
  '✖': '✕', '❌': '✕', '❎': '✕', '✗': '✕',
  '⭐': '★', '🌟': '★',
  '🔴': '●', '🟢': '●', '🔵': '●', '⚫': '●', '⚪': '○',
  '➡': '→', '⬅': '←', '⬆': '↑', '⬇': '↓',
  '🔄': '⇄', '🔁': '⇄', '↻': '⇄',
};

function checkGlyphs(ast, ctx) {
  if (ctx.options.checkGlyphs === false) return;
  const found = new Set();
  const scan = (text) => {
    for (const ch of String(text).match(MISSING_GLYPH_RE) || []) if (!FONT_HAS_GLYPH.has(ch)) found.add(ch);
  };
  traverse(ast, {
    CallExpression(p) {
      // Log output never reaches the screen.
      const c = p.node.callee;
      if (t.isMemberExpression(c) && t.isIdentifier(c.object, { name: 'console' })) p.skip();
    },
    StringLiteral(p) {
      if (!p.parentPath.isImportDeclaration() && !p.parentPath.isExportDeclaration()) scan(p.node.value);
    },
    TemplateElement(p) {
      scan(p.node.value.cooked);
    },
    JSXText(p) {
      scan(p.node.value);
    },
  });
  if (!found.size) return;
  const chars = [...found];
  const tips = chars.filter((c) => GLYPH_SUGGESTIONS[c]).map((c) => `${c} → ${GLYPH_SUGGESTIONS[c]}`);
  ctx.warn(
    `Text uses characters the watch font cannot draw (they render as empty boxes): ${chars.join(' ')}. ` +
    (tips.length ? `Try ${tips.join(', ')}; ` : '') +
    'use a PNG <image> for icons.',
  );
}

// -----------------------------------------------------------------------------
// CSS lint (Vela supports a small CSS subset)
// -----------------------------------------------------------------------------

function lintCss(css, ctx) {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const stack = [];
  let buf = '';
  for (const ch of src) {
    if (ch === '{') {
      const selector = buf.trim();
      buf = '';
      const parent = stack[stack.length - 1];
      if (selector.startsWith('@')) {
        stack.push(/^@(-\w+-)?keyframes/.test(selector) ? 'keyframes' : 'at');
      } else if (parent === 'keyframes') {
        stack.push('frame');
      } else {
        checkSelector(selector, ctx);
        stack.push('rule');
      }
    } else if (ch === '}') {
      if (stack[stack.length - 1] === 'rule') checkDeclarations(buf, ctx);
      stack.pop();
      buf = '';
    } else {
      buf += ch;
    }
  }
}

/**
 * Vela memory guide: remove unused CSS. Drops selectors whose classes never
 * appear in the template (inlined components bring their whole stylesheet).
 * Tag and #id selectors are kept.
 */
function pruneUnusedCss(css, used) {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let out = '';
  let i = 0;
  while (i < src.length) {
    const open = src.indexOf('{', i);
    if (open === -1) {
      out += src.slice(i);
      break;
    }
    let depth = 1;
    let j = open + 1;
    while (j < src.length && depth) {
      if (src[j] === '{') depth++;
      else if (src[j] === '}') depth--;
      j++;
    }
    const prelude = src.slice(i, open);
    const body = src.slice(open + 1, j - 1);
    const lead = /^\s*/.exec(prelude)[0];
    const sel = prelude.trim();
    if (/^@(media|supports)\b/.test(sel)) {
      const inner = pruneUnusedCss(body, used);
      if (inner.trim()) out += `${prelude}{${inner}}`;
    } else if (sel.startsWith('@')) {
      out += `${prelude}{${body}}`;
    } else {
      const kept = sel.split(',').map((s) => s.trim()).filter((s) => {
        const classes = s.match(/\.[\w-]+/g);
        return !classes || classes.every((c) => used.has(c.slice(1)));
      });
      if (kept.length) out += `${lead}${kept.join(', ')} {${body}}`;
    }
    i = j;
  }
  return out;
}

function checkSelector(selector, ctx) {
  for (const raw of selector.split(',')) {
    const sel = raw.trim();
    if (!sel) continue;
    let problem = null;
    if (/[>+~]/.test(sel)) problem = 'combinators (>, +, ~)';
    else if (/\s/.test(sel)) problem = 'descendant selectors';
    else if (/::?[a-z-]+/i.test(sel)) problem = 'pseudo-classes / pseudo-elements';
    else if (/\[/.test(sel)) problem = 'attribute selectors';
    else if (/\*/.test(sel)) problem = 'the universal selector';
    else if (/\.[\w-]+\.[\w-]/.test(sel)) problem = 'multiple class intersections (.a.b)';
    if (problem) {
      ctx.warn(
        `CSS selector "${sel}" uses ${problem}, which Vela does not support. ` +
        'Use a single .class, #id or tag selector (comma lists are fine).',
      );
    }
  }
}

function checkDeclarations(body, ctx) {
  for (const decl of body.split(';')) {
    const m = /^\s*display\s*:\s*([^;]+?)\s*$/.exec(decl);
    if (m && m[1] !== 'flex' && m[1] !== 'none') {
      ctx.warn(`CSS "display: ${m[1]}" is not supported by Vela (only flex and none).`);
    }
  }
}

// -----------------------------------------------------------------------------
// Template bindings
// -----------------------------------------------------------------------------

function exprToVelaBinding(node, ctx) {
  let expr = t.cloneNode(node, true);
  expr = rewriteTree(expr, (n) => (t.isTemplateLiteral(n) ? templateLiteralToConcat(n) : undefined));
  if (containsFunction(expr)) expr = hoistBindingToComputed(node, expr, ctx);
  if (ctx.component) bridgeModuleBindings(expr, ctx);
  return velaExprSource(expr);
}

/**
 * Vela template expressions cannot contain functions (e.g. `items.filter(...)`).
 * Move such expressions to a computed property when they do not depend on
 * loop variables.
 */
function hoistBindingToComputed(original, expr, ctx) {
  const comp = ctx.component;
  const used = referencedNames(expr);
  const loopVars = loopVarNames(ctx).filter((v) => used.has(v));
  if (!comp || loopVars.length) {
    ctx.warn(
      `Template expression "${exprSource(original)}" contains a function, which Vela templates do not support. ` +
      'Move it to a computed value.',
    );
    return expr;
  }
  const name = `kovoComputed${comp.computedCount++}`;
  comp.computed.set(name, { expr: t.cloneNode(original, true) });
  return t.identifier(name);
}

/**
 * Module-level values read by the template must live on the ViewModel:
 * constants are added to data, helper functions become methods.
 */
function bridgeModuleBindings(expr, ctx) {
  const comp = ctx.component;
  const loopVars = new Set(loopVarNames(ctx));
  for (const name of referencedNames(expr)) {
    if (loopVars.has(name) || comp.memberNames.has(name) || TEMPLATE_GLOBALS.has(name)) continue;
    if (name.startsWith('$')) continue;
    const kind = ctx.moduleBindings.get(name);
    if (kind === 'function') comp.bridgedMethods.add(name);
    else if (kind === 'value') comp.bridgedValues.add(name);
  }
}

function serializeInterpolatedTemplate(tl, ctx) {
  let out = '';
  tl.quasis.forEach((q, i) => {
    out += escapeXml(q.value.cooked);
    const expr = tl.expressions[i] && unwrapParens(tl.expressions[i]);
    if (!expr) return;
    if (t.isStringLiteral(expr) || t.isNumericLiteral(expr)) out += escapeXml(String(expr.value));
    else out += `{{${exprToVelaBinding(expr, ctx)}}}`;
  });
  return out;
}

// -----------------------------------------------------------------------------
// Attribute serialization
// -----------------------------------------------------------------------------

function serializeStringValue(value, ctx) {
  if (value === null) return 'true';
  if (t.isStringLiteral(value)) return escapeXml(value.value);
  if (t.isJSXExpressionContainer(value)) {
    const expr = t.isJSXEmptyExpression(value.expression) ? value.expression : foldConstants(value.expression);
    if (t.isStringLiteral(expr)) return escapeXml(expr.value);
    if (t.isNumericLiteral(expr)) return String(expr.value);
    if (t.isBooleanLiteral(expr)) return String(expr.value);
    if (t.isNullLiteral(expr)) return '';
    if (t.isIdentifier(expr, { name: 'undefined' })) return '';
    if (t.isTemplateLiteral(expr)) return serializeInterpolatedTemplate(expr, ctx);
    return `{{${exprToVelaBinding(expr, ctx)}}}`;
  }
  return '';
}

function serializeStyleObject(objExpr, ctx) {
  const parts = [];
  for (const prop of objExpr.properties) {
    if (t.isSpreadElement(prop)) {
      throw new Error('Spread `{...obj}` in style is not supported.');
    }
    if (!t.isObjectProperty(prop)) continue;
    const key = propKeyName(prop.key);
    const valueNode = prop.value;
    let value;
    if (t.isStringLiteral(valueNode)) value = valueNode.value;
    else if (t.isNumericLiteral(valueNode)) value = String(valueNode.value);
    else if (t.isBooleanLiteral(valueNode)) value = String(valueNode.value);
    else if (t.isTemplateLiteral(valueNode)) value = serializeInterpolatedTemplate(valueNode, ctx);
    else if (
      t.isMemberExpression(valueNode) ||
      t.isIdentifier(valueNode) ||
      t.isCallExpression(valueNode) ||
      t.isBinaryExpression(valueNode) ||
      t.isConditionalExpression(valueNode) ||
      t.isLogicalExpression(valueNode)
    ) {
      value = `{{${exprToVelaBinding(valueNode, ctx)}}}`;
    } else {
      throw new Error(`Unsupported style value: ${exprSource(valueNode)}`);
    }
    parts.push(`${camelToKebab(key)}: ${value}`);
  }
  const joined = parts.join('; ');
  return joined ? joined + ';' : '';
}

/**
 * Returns the Vela handler string for an arrow handler that only calls a
 * method, or null when the handler must be hoisted into a generated method.
 */
function directHandlerCall(fn, ctx) {
  let body = fn.body;
  if (t.isBlockStatement(body)) {
    if (body.body.length !== 1 || !t.isExpressionStatement(body.body[0])) return null;
    body = body.body[0].expression;
  }
  if (!t.isCallExpression(body)) return null;

  const comp = ctx.component;
  let methodName = null;
  if (t.isMemberExpression(body.callee) && t.isThisExpression(body.callee.object) && t.isIdentifier(body.callee.property)) {
    methodName = body.callee.property.name;
  } else if (t.isIdentifier(body.callee)) {
    const n = body.callee.name;
    if (comp && !comp.methods.has(n)) return null;
    methodName = n;
  }
  if (!methodName) return null;

  const args = body.arguments;
  if (args.some((a) => t.isSpreadElement(a) || containsFunction(a))) return null;
  if (comp && args.some((a) => {
    const used = referencedNames(a);
    return [...used].some((n) => comp.setters.has(n) || comp.eventProps.has(n));
  })) return null;

  const paramNames = fn.params.filter((p) => t.isIdentifier(p)).map((p) => p.name);
  const usesParams = args.some((a) => [...referencedNames(a)].some((n) => paramNames.includes(n)));
  if (usesParams) {
    // Vela appends the event object as the last argument: `(e) => fn(e)` is just `fn`.
    const last = args[args.length - 1];
    if (comp && args.length === 1 && t.isIdentifier(last) && paramNames.length === 1 && last.name === paramNames[0]) {
      return methodName;
    }
    if (comp) return null;
  }
  if (args.length === 0) return methodName;
  return `${methodName}(${args.map((a) => exprToVelaBinding(a, ctx)).join(', ')})`;
}

/** Turn an inline handler into a generated method, passing loop vars along. */
function hoistHandler(params, body, ctx) {
  const comp = ctx.component;
  const name = `kovoHandler${comp.handlerCount++}`;
  const block = t.isBlockStatement(body) ? body : t.blockStatement([t.expressionStatement(body)]);
  const used = referencedNames(block);
  const loopParams = loopVarNames(ctx).filter((v) => used.has(v));
  const fn = t.functionExpression(
    null,
    [...loopParams.map((v) => t.identifier(v)), ...params.map((p) => t.cloneNode(p, true))],
    t.cloneNode(block, true),
  );
  comp.methods.set(name, fn);
  comp.memberNames.add(name);
  return loopParams.length ? `${name}(${loopParams.join(', ')})` : name;
}

function serializeEventHandler(name, value, ctx) {
  // Known names map explicitly; any other onFooBar becomes the lowercase Vela event @foobar
  // (e.g. onScrollBottom -> @scrollbottom on <list>, onSwipeEnd -> @swipeend on <swiper>).
  const velaAttr = `@${EVENT_MAP[name] || name.slice(2).toLowerCase()}`;
  if (!value) {
    throw new Error(`Event handler ${name} must have a value.`);
  }
  if (t.isStringLiteral(value)) {
    return `${velaAttr}="${escapeXml(value.value)}"`;
  }
  if (!t.isJSXExpressionContainer(value)) {
    throw new Error(`Event handler ${name} has invalid value.`);
  }
  const expr = unwrapParens(value.expression);
  const comp = ctx.component;

  if (t.isMemberExpression(expr) && t.isThisExpression(expr.object)) {
    return `${velaAttr}="${expr.property.name}"`;
  }
  if (t.isIdentifier(expr)) {
    // Setters, event props and module-level/imported functions are not ViewModel
    // methods: wrap them in a generated method so @event has something to call.
    const external = comp && !comp.memberNames.has(expr.name) && !loopVarNames(ctx).includes(expr.name);
    if (comp && (comp.setters.has(expr.name) || comp.eventProps.has(expr.name) || external)) {
      const evt = t.identifier('evt');
      return `${velaAttr}="${hoistHandler([evt], t.callExpression(t.identifier(expr.name), [evt]), ctx)}"`;
    }
    return `${velaAttr}="${expr.name}"`;
  }
  if (isFunctionNode(expr)) {
    const direct = directHandlerCall(expr, ctx);
    if (direct) return `${velaAttr}="${direct}"`;
    if (comp) return `${velaAttr}="${hoistHandler(expr.params, expr.body, ctx)}"`;
  }
  ctx.warn(
    `Event handler ${name} has complex expression. Vela's @event uses a method name. Falling back to: ${exprToVelaBinding(expr, ctx)}`,
  );
  return `${velaAttr}="${exprToVelaBinding(expr, ctx)}"`;
}

function serializeAttribute(attr, ctx, element) {
  if (t.isJSXSpreadAttribute(attr)) {
    throw new Error('Spread `{...obj}` is not supported in Kovo.');
  }
  if (!t.isJSXAttribute(attr)) return null;
  const name = t.isJSXNamespacedName(attr.name)
    ? `${attr.name.namespace.name}:${attr.name.name.name}`
    : attr.name.name;
  const value = attr.value;

  if (EVENT_MAP[name] || /^on[A-Z][a-zA-Z]*$/.test(name)) return serializeEventHandler(name, value, ctx);

  // `key` is consumed by the enclosing .map() (as `tid`).
  if (name === 'key') return null;

  if (name === 'ref') {
    if (element.hasIdAttr) return null;
    let refId = '';
    if (t.isJSXExpressionContainer(value)) {
      refId = exprToVelaBinding(value.expression, ctx);
    } else if (t.isStringLiteral(value)) {
      refId = value.value;
    }
    return refId ? `id="${refId}"` : null;
  }

  if (name === 'className' || name === 'class') {
    trackClassNames(value, ctx);
    return `class="${serializeStringValue(value, ctx)}"`;
  }

  if (name === 'is') {
    if (t.isJSXExpressionContainer(value)) {
      return `is="{{${exprToVelaBinding(value.expression, ctx)}}}"`;
    }
    if (t.isStringLiteral(value)) {
      return `is="${value.value}"`;
    }
  }

  if (name === 'style') {
    if (t.isJSXExpressionContainer(value) && t.isObjectExpression(value.expression)) {
      return `style="${serializeStyleObject(value.expression, ctx)}"`;
    }
    return `style="${serializeStringValue(value, ctx)}"`;
  }

  if (value === null) {
    return `${camelToKebab(name)}="true"`;
  }
  if (t.isStringLiteral(value)) {
    return `${camelToKebab(name)}="${escapeXml(value.value)}"`;
  }
  if (t.isJSXExpressionContainer(value)) {
    const expr = t.isJSXEmptyExpression(value.expression) ? value.expression : foldConstants(value.expression);
    if (t.isBooleanLiteral(expr)) {
      return expr.value ? `${camelToKebab(name)}="true"` : null;
    }
    if (t.isNullLiteral(expr) || t.isIdentifier(expr, { name: 'undefined' })) {
      return null;
    }
    if (t.isStringLiteral(expr)) {
      return `${camelToKebab(name)}="${escapeXml(expr.value)}"`;
    }
    // Vela docs: image src must be one binding, not "/common/{{type}}" (compiler warning).
    if (t.isTemplateLiteral(expr) && name !== 'src') {
      return `${camelToKebab(name)}="${serializeInterpolatedTemplate(expr, ctx)}"`;
    }
    return `${camelToKebab(name)}="{{${exprToVelaBinding(expr, ctx)}}}"`;
  }
  return null;
}

/**
 * Possible values of a class expression, or null when they cannot be known
 * statically (then unused-CSS pruning is skipped for the file).
 */
function classCandidates(expr) {
  expr = unwrapParens(expr);
  if (t.isStringLiteral(expr)) return [expr.value];
  if (t.isNullLiteral(expr) || t.isBooleanLiteral(expr) || t.isIdentifier(expr, { name: 'undefined' })) return [''];
  if (t.isConditionalExpression(expr)) {
    const a = classCandidates(expr.consequent);
    const b = classCandidates(expr.alternate);
    return a && b ? [...a, ...b] : null;
  }
  if (t.isLogicalExpression(expr)) {
    const r = classCandidates(expr.right);
    if (!r) return null;
    if (expr.operator === '&&') return r;
    const l = classCandidates(expr.left);
    return l ? [...l, ...r] : null;
  }
  const isWholeToken = (before, after) => (!before || /\s$/.test(before)) && (!after || /^\s/.test(after));
  if (t.isTemplateLiteral(expr)) {
    const out = expr.quasis.map((q) => q.value.cooked);
    for (let i = 0; i < expr.expressions.length; i++) {
      const c = classCandidates(expr.expressions[i]);
      if (!c || !isWholeToken(expr.quasis[i].value.cooked, expr.quasis[i + 1].value.cooked)) return null;
      out.push(...c);
    }
    return out;
  }
  if (t.isBinaryExpression(expr, { operator: '+' })) {
    const l = classCandidates(expr.left);
    const r = classCandidates(expr.right);
    if (!l || !r) return null;
    if (l.some((s) => s && !/\s$/.test(s)) && r.some((s) => s && !/^\s/.test(s))) return null;
    return [...l, ...r];
  }
  return null;
}

function trackClassNames(value, ctx) {
  const add = (s) => s.split(/\s+/).filter(Boolean).forEach((c) => ctx.usedClasses.add(c));
  if (value === null) return;
  if (t.isStringLiteral(value)) {
    add(value.value);
    return;
  }
  if (!t.isJSXExpressionContainer(value)) return;
  const values = classCandidates(foldConstants(value.expression));
  if (values) values.forEach(add);
  else ctx.classesUnknown = true;
}

/** True when an expression only reads values that never change after load. */
function isStaticExpr(expr, ctx) {
  let pure = true;
  t.traverseFast(expr, (n) => {
    if (t.isCallExpression(n) || t.isNewExpression(n) || isFunctionNode(n) || t.isJSXElement(n) ||
        t.isAssignmentExpression(n) || t.isUpdateExpression(n)) pure = false;
  });
  if (!pure) return false;
  const comp = ctx.component;
  const staticLoopVars = new Set();
  for (const loop of ctx.loops) {
    if (!loop.static) continue;
    staticLoopVars.add(loop.item);
    if (loop.index) staticLoopVars.add(loop.index);
  }
  for (const name of referencedNames(expr)) {
    if (TEMPLATE_GLOBALS.has(name) || staticLoopVars.has(name) || comp.constants.has(name)) continue;
    if (ctx.moduleBindings.get(name) === 'value' && !comp.memberNames.has(name)) continue;
    return false;
  }
  return true;
}

/**
 * Vela memory guide: nodes whose bindings never change can be marked `static`
 * so the framework does not keep them dynamic.
 */
function isStaticNode(node, ctx) {
  if (!ctx.component || ctx.options.autoStatic === false) return false;
  const exprs = [];
  for (const a of node.openingElement.attributes) {
    if (!t.isJSXAttribute(a)) return false;
    const n = t.isJSXIdentifier(a.name) ? a.name.name : '';
    if (n === 'static') return false;
    if (EVENT_MAP[n] || /^on[A-Z]/.test(n) || ['ref', 'key', 'tid', 'if', 'elif', 'else', 'for'].includes(n)) continue;
    if (t.isJSXExpressionContainer(a.value)) exprs.push(a.value.expression);
  }
  for (const c of node.children) {
    if (!t.isJSXExpressionContainer(c) || t.isJSXEmptyExpression(c.expression)) continue;
    const e = unwrapParens(c.expression);
    // Children that add or remove nodes keep the element dynamic.
    if (t.isJSXElement(e) || t.isJSXFragment(e) || t.isLogicalExpression(e) || t.isConditionalExpression(e) ||
        t.isCallExpression(e)) return false;
    exprs.push(e);
  }
  // Literal-only bindings are already constant; only mark nodes that read variables.
  return exprs.some((e) => referencedNames(e).size > 0) && exprs.every((e) => isStaticExpr(e, ctx));
}

function directiveAttrs(opts) {
  const attrs = [];
  if (opts.ifExpr) attrs.push(`if="{{${opts.ifExpr}}}"`);
  if (opts.elifExpr) attrs.push(`elif="{{${opts.elifExpr}}}"`);
  if (opts.elseExpr) attrs.push('else');
  if (opts.forExpr) attrs.push(`for="{{${opts.forExpr}}}"`);
  if (opts.tid) attrs.push(`tid="${opts.tid}"`);
  return attrs;
}

// -----------------------------------------------------------------------------
// JSX serialization
// -----------------------------------------------------------------------------

function wrapChildren(tag, attrStr, innerParts) {
  if (innerParts.length === 0) return `<${tag}${attrStr}/>`;
  const joined = innerParts.join('');
  if (!joined.includes('\n') || TEXT_LIKE.has(tag)) {
    return `<${tag}${attrStr}>${joined}</${tag}>`;
  }
  return `<${tag}${attrStr}>\n` + innerParts.map((p) => indent(p, 2)).join('\n') + `\n</${tag}>`;
}

function serializeChildren(node, ctx, parentTag) {
  const parts = [];
  for (const child of t.react.buildChildren(node)) {
    const s = serializeJSXChild(child, ctx, parentTag);
    if (s != null && s !== '') parts.push(s);
  }
  return parts;
}

function serializeJSXElement(node, ctx, opts = {}) {
  const name = getElementName(node);
  if (isCustomComponent(name, ctx)) {
    return serializeCustomComponent(node, name, ctx, opts);
  }
  if (name === 'component') ctx.usesDynamicComponent = true;

  const hasDirective = opts.ifExpr || opts.elifExpr || opts.elseExpr;
  const element = {
    hasIdAttr: node.openingElement.attributes.some(
      (a) => t.isJSXAttribute(a) && a.name.name === 'id',
    ),
  };
  const attrs = [];
  for (const attr of node.openingElement.attributes) {
    if (t.isJSXAttribute(attr)) {
      const aname = t.isJSXIdentifier(attr.name) ? attr.name.name : '';
      if (hasDirective && (aname === 'if' || aname === 'elif' || aname === 'else')) continue;
      if (opts.tid && aname === 'tid') continue;
    }
    const s = serializeAttribute(attr, ctx, element);
    if (s) attrs.push(s);
  }
  if (isStaticNode(node, ctx)) attrs.push('static');
  attrs.push(...directiveAttrs(opts));

  const attrStr = attrs.length ? ' ' + attrs.join(' ') : '';
  return wrapChildren(name, attrStr, serializeChildren(node, ctx, name));
}

function indent(s, spaces) {
  const pad = ' '.repeat(spaces);
  return s
    .split('\n')
    .map((l) => (l.trim() ? pad + l : l))
    .join('\n');
}

/** Root fragment: Vela requires a single real root node (not <block>). */
function serializeRootFragment(fragment, ctx) {
  ctx.warn(
    'Fragment <> detected — wrapping in <div>. Vela requires a single root in <template>.',
  );
  return wrapChildren('div', '', serializeChildren(fragment, ctx, 'div'));
}

/** Nested fragment: <block> renders its children without an extra node. */
function serializeFragmentAsBlock(fragment, ctx, opts = {}) {
  const attrs = directiveAttrs(opts);
  const attrStr = attrs.length ? ' ' + attrs.join(' ') : '';
  const inner = serializeChildren(fragment, ctx, 'block');
  if (inner.length === 0 && !attrStr) return null;
  return wrapChildren('block', attrStr, inner);
}

function serializeJSXChild(child, ctx, parentTag) {
  if (t.isStringLiteral(child)) {
    if (TEXT_LIKE.has(parentTag)) return escapeXml(child.value);
    if (!child.value.trim()) return null;
    const text = child.value.trim();
    if (CONTAINER_LIKE.has(parentTag)) {
      ctx.warn(
        `Plain text "${text}" inside <${parentTag}> is auto-wrapped in <text>. Vela requires <text> for textual content.`,
      );
    }
    return `<text>${escapeXml(text)}</text>`;
  }
  if (t.isJSXElement(child)) return serializeJSXElement(child, ctx);
  if (t.isJSXFragment(child)) return serializeFragmentAsBlock(child, ctx);
  if (t.isJSXSpreadChild(child)) throw new Error('Spread children `{...items}` are not supported.');
  return serializeJSXExpression(child, ctx, parentTag);
}

function serializeJSXExpression(expr, ctx, parentTag) {
  expr = unwrapParens(expr);
  if (t.isJSXEmptyExpression(expr)) return null;
  if (t.isBinaryExpression(expr) || t.isTemplateLiteral(expr)) expr = foldConstants(expr);
  if (t.isBooleanLiteral(expr)) return null;
  if (t.isNullLiteral(expr)) return null;
  if (t.isIdentifier(expr, { name: 'undefined' })) return null;
  if (t.isJSXElement(expr)) return serializeJSXElement(expr, ctx);
  if (t.isJSXFragment(expr)) return serializeFragmentAsBlock(expr, ctx);

  if (t.isLogicalExpression(expr) && expr.operator === '&&') {
    return serializeConditional(expr, ctx);
  }
  if (t.isConditionalExpression(expr)) {
    // Only branches that produce JSX make this a conditional render;
    // `a ? 'x' : b && b.title` is a plain text value.
    const isJSX = (n) => {
      n = unwrapParens(n);
      if (t.isJSXElement(n) || t.isJSXFragment(n)) return true;
      if (t.isConditionalExpression(n)) return isJSX(n.consequent) || isJSX(n.alternate);
      return t.isLogicalExpression(n) && n.operator === '&&' && isJSX(n.right);
    };
    if (!isJSX(expr.consequent) && !isJSX(expr.alternate)) {
      const binding = `{{${exprToVelaBinding(expr, ctx)}}}`;
      if (TEXT_LIKE.has(parentTag)) return binding;
      return `<text>${binding}</text>`;
    }
    return serializeTernary(expr, ctx);
  }
  if (t.isCallExpression(expr)) {
    const callee = expr.callee;
    if (t.isMemberExpression(callee) && t.isIdentifier(callee.property, { name: 'map' })) {
      return serializeMap(callee, expr.arguments, ctx);
    }
  }

  if (t.isTemplateLiteral(expr)) {
    const text = serializeInterpolatedTemplate(expr, ctx);
    if (TEXT_LIKE.has(parentTag)) return text;
    return `<text>${text}</text>`;
  }
  if (t.isStringLiteral(expr)) {
    if (TEXT_LIKE.has(parentTag)) return escapeXml(expr.value);
    return `<text>${escapeXml(expr.value)}</text>`;
  }
  if (t.isNumericLiteral(expr)) {
    if (TEXT_LIKE.has(parentTag)) return String(expr.value);
    return `<text>${String(expr.value)}</text>`;
  }

  if (
    t.isIdentifier(expr) ||
    t.isMemberExpression(expr) ||
    t.isOptionalMemberExpression(expr) ||
    t.isCallExpression(expr) ||
    t.isBinaryExpression(expr) ||
    t.isUnaryExpression(expr) ||
    t.isLogicalExpression(expr)
  ) {
    const binding = `{{${exprToVelaBinding(expr, ctx)}}}`;
    if (TEXT_LIKE.has(parentTag)) return binding;
    return `<text>${binding}</text>`;
  }

  throw new Error(`Unsupported JSX expression: ${exprSource(expr)}`);
}

function serializeConditional(logical, ctx) {
  const cond = exprToVelaBinding(logical.left, ctx);
  const right = unwrapParens(logical.right);
  if (t.isJSXElement(right)) {
    return serializeJSXElement(right, ctx, { ifExpr: cond });
  }
  if (t.isJSXFragment(right)) {
    return serializeFragmentAsBlock(right, ctx, { ifExpr: cond }) || `<block if="{{${cond}}}"/>`;
  }
  if (t.isConditionalExpression(right)) {
    return serializeTernaryWithPrefix(cond, right, ctx);
  }
  if (t.isLogicalExpression(right) && right.operator === '&&') {
    return serializeConditional(
      t.logicalExpression('&&', t.logicalExpression('&&', logical.left, right.left), right.right),
      ctx,
    );
  }
  if (t.isCallExpression(right) && t.isMemberExpression(right.callee) &&
      t.isIdentifier(right.callee.property, { name: 'map' })) {
    // `if` beats `for` on the same tag in Vela, so guard the loop with a block.
    const loop = serializeMap(right.callee, right.arguments, ctx);
    return `<block if="{{${cond}}}">\n${indent(loop, 2)}\n</block>`;
  }
  throw new Error(
    `Right side of \`&&\` must be a single JSX element. Got: ${exprSource(right)}`,
  );
}

function serializeTernaryElement(element, ctx, opts) {
  if (t.isJSXFragment(element)) {
    return serializeFragmentAsBlock(element, ctx, opts) || `<block${' ' + directiveAttrs(opts).join(' ')}/>`;
  }
  return serializeJSXElement(element, ctx, opts);
}

function flattenTernary(ternary) {
  const pairs = [];
  let current = ternary;
  while (t.isConditionalExpression(current)) {
    const elem = unwrapParens(current.consequent);
    if (t.isLogicalExpression(elem) && elem.operator === '&&' && t.isJSXElement(unwrapParens(elem.right))) {
      const combined = t.logicalExpression('&&', current.test, elem.left);
      pairs.push({ cond: combined, element: unwrapParens(elem.right) });
    } else if (t.isJSXElement(elem) || t.isJSXFragment(elem)) {
      pairs.push({ cond: current.test, element: elem });
    } else if (t.isNullLiteral(elem) || t.isIdentifier(elem, { name: 'undefined' })) {
      pairs.push({ cond: current.test, element: null });
    } else {
      throw new Error(`Ternary branch must be a JSX element. Got: ${exprSource(elem)}`);
    }
    current = unwrapParens(current.alternate);
  }
  if (t.isJSXElement(current) || t.isJSXFragment(current)) {
    pairs.push({ cond: null, element: current });
  } else if (t.isNullLiteral(current) || t.isIdentifier(current, { name: 'undefined' })) {
    pairs.push({ cond: null, element: null });
  } else {
    throw new Error('Last branch of ternary chain must be a JSX element.');
  }
  return pairs;
}

function serializeTernaryWithPrefix(prefix, ternary, ctx) {
  const pairs = flattenTernary(ternary);
  if (pairs.length < 2) {
    throw new Error('Ternary must have at least 2 branches.');
  }
  const results = [];
  const previous = [];
  for (const { cond, element } of pairs) {
    const condStr = cond ? exprToVelaBinding(cond, ctx) : null;
    if (element) {
      const guards = previous.map((c) => `!(${c})`);
      if (condStr) guards.push(condStr);
      const full = [prefix, ...guards].join(' && ');
      results.push(serializeTernaryElement(element, ctx, { ifExpr: full }));
    }
    if (condStr) previous.push(condStr);
  }
  return results.join('\n');
}

function serializeTernary(ternary, ctx) {
  const pairs = flattenTernary(ternary);
  if (pairs.length < 2) {
    throw new Error('Ternary must have at least 2 branches.');
  }
  const results = [];
  let chainStarted = false;
  for (let i = 0; i < pairs.length; i++) {
    const { cond, element } = pairs[i];
    const isLast = i === pairs.length - 1;
    if (!element) {
      // An empty branch in the middle breaks the if/elif chain: negate it into later branches.
      if (!isLast && cond) {
        const rest = pairs.slice(i + 1);
        const neg = `!(${exprToVelaBinding(cond, ctx)})`;
        const prev = pairs.slice(0, i).filter((p) => p.cond).map((p) => `!(${exprToVelaBinding(p.cond, ctx)})`);
        for (const p of rest) {
          if (!p.element) continue;
          const guards = [...prev, neg];
          if (p.cond) guards.push(exprToVelaBinding(p.cond, ctx));
          results.push(serializeTernaryElement(p.element, ctx, { ifExpr: guards.join(' && ') }));
          if (p.cond) prev.push(`!(${exprToVelaBinding(p.cond, ctx)})`);
        }
        break;
      }
      continue;
    }
    if (!chainStarted) {
      results.push(serializeTernaryElement(element, ctx, { ifExpr: exprToVelaBinding(cond, ctx) }));
      chainStarted = true;
    } else if (!isLast) {
      results.push(serializeTernaryElement(element, ctx, { elifExpr: exprToVelaBinding(cond, ctx) }));
    } else {
      results.push(serializeTernaryElement(element, ctx, { elseExpr: true }));
    }
  }
  return results.join('\n');
}

function checkLoopVarName(name) {
  if (/^[$_]/.test(name)) {
    throw new Error(`map() parameter "${name}" cannot start with $ or _ (Vela reserves those names in for loops).`);
  }
}

function keyAttrOf(node) {
  node = unwrapParens(node);
  if (t.isLogicalExpression(node)) node = unwrapParens(node.right);
  if (!t.isJSXElement(node)) return null;
  const attr = node.openingElement.attributes.find(
    (a) => t.isJSXAttribute(a) && a.name.name === 'key',
  );
  return attr || null;
}

/** React `key` -> Vela `tid` (which only accepts a property name of the item). */
function keyToTid(keyAttr, loop, ctx) {
  if (!keyAttr || !t.isJSXExpressionContainer(keyAttr.value)) return null;
  const expr = keyAttr.value.expression;
  if (t.isMemberExpression(expr) && !expr.computed && t.isIdentifier(expr.object, { name: loop.item }) &&
      t.isIdentifier(expr.property)) {
    return expr.property.name;
  }
  if (t.isIdentifier(expr) && loop.destructured.has(expr.name)) return expr.name;
  if (t.isIdentifier(expr) && (expr.name === loop.item || expr.name === loop.index)) return null;
  ctx.warn(
    `key={${exprSource(expr)}} cannot become a Vela tid (tid only takes a property name of the item). Using the index.`,
  );
  return null;
}

function serializeMap(memberExpr, args, ctx) {
  if (args.length === 0) {
    throw new Error('map() requires a callback.');
  }
  const cb = args[0];
  if (!isFunctionNode(cb)) {
    throw new Error('map() callback must be a function (arrow or expression).');
  }
  if (cb.params.length === 0) {
    throw new Error('map() callback must have at least one parameter (item).');
  }

  const depth = ctx.loops.length;
  const itemParam = cb.params[0];
  let itemName;
  const destructured = new Map();
  if (t.isIdentifier(itemParam)) {
    itemName = itemParam.name;
  } else if (t.isObjectPattern(itemParam)) {
    itemName = depth ? `kovoItem${depth}` : 'kovoItem';
    for (const prop of itemParam.properties) {
      if (!t.isObjectProperty(prop) || !t.isIdentifier(prop.value)) {
        throw new Error('map() callback parameter destructuring only supports `({ a, b }) =>`.');
      }
      destructured.set(prop.value.name, t.memberExpression(t.identifier(itemName), t.identifier(propKeyName(prop.key))));
    }
  } else {
    throw new Error('map() callback parameter must be a simple identifier.');
  }
  checkLoopVarName(itemName);
  let indexName = null;
  if (cb.params.length >= 2 && t.isIdentifier(cb.params[1])) {
    indexName = cb.params[1].name;
    checkLoopVarName(indexName);
  }

  let body = cb.body;
  if (t.isBlockStatement(body)) {
    const stmts = body.body;
    if (stmts.length === 1 && t.isReturnStatement(stmts[0]) && stmts[0].argument) {
      body = stmts[0].argument;
    } else {
      throw new Error('map() callback body must be a single JSX element (a block body may only contain `return <X/>`; move other logic to a computed value).');
    }
  }
  body = unwrapParens(body);
  if (destructured.size) body = substituteIdentifiers(body, destructured);

  const isJSXBody = t.isJSXElement(body);
  const isConditionalBody = t.isJSXFragment(body) || t.isConditionalExpression(body) ||
    (t.isLogicalExpression(body) && body.operator === '&&');
  if (!isJSXBody && !isConditionalBody) {
    throw new Error('map() callback body must be a single JSX element.');
  }

  // Evaluated outside the loop scope.
  const arraySrc = exprToVelaBinding(memberExpr.object, ctx);
  const forExpr = indexName ? `(${indexName}, ${itemName}) in ${arraySrc}` : `${itemName} in ${arraySrc}`;

  const loop = {
    item: itemName,
    index: indexName,
    destructured: new Set(destructured.keys()),
    static: !!ctx.component && isStaticExpr(memberExpr.object, ctx),
  };
  ctx.loops.push(loop);
  try {
    const tid = keyToTid(keyAttrOf(body), loop, ctx) || undefined;
    if (isJSXBody) {
      return serializeJSXElement(body, ctx, { forExpr, tid });
    }
    // Vela evaluates `if` before `for` on one tag, so per-item conditions need a <block>.
    const inner = t.isJSXFragment(body)
      ? serializeChildren(body, ctx, 'block').join('\n')
      : serializeJSXExpression(body, ctx, 'block');
    const attrs = directiveAttrs({ forExpr, tid });
    return `<block ${attrs.join(' ')}>\n${indent(inner, 2)}\n</block>`;
  } finally {
    ctx.loops.pop();
  }
}

// -----------------------------------------------------------------------------
// Custom components
// -----------------------------------------------------------------------------

// One resolution order for the compiler and the build/watch scripts, so the
// file that gets inlined is the file whose edits trigger a rebuild.
const SOURCE_EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js'];

/** Every path a relative import may point to, in resolution order. */
function sourceCandidates(spec, fromFile) {
  const base = path.resolve(path.dirname(fromFile), spec);
  return [base, ...SOURCE_EXTENSIONS.map((e) => base + e), ...SOURCE_EXTENSIONS.map((e) => path.join(base, `index${e}`))]
    .filter((c) => /\.(t|j)sx?$/.test(c));
}

/** Resolves a relative import to an existing .tsx/.ts/.jsx/.js file, or null. */
function resolveSourceFile(spec, fromFile) {
  if (!fromFile || !path.isAbsolute(fromFile) || !/^\.{1,2}\//.test(spec)) return null;
  return sourceCandidates(spec, fromFile).find((c) => fs.existsSync(c) && fs.statSync(c).isFile()) || null;
}

function resolveComponentFile(src, ctx) {
  if (/\.ux$/.test(src)) return null;
  const file = resolveSourceFile(src, ctx.filename);
  return file && /\.(t|j)sx$/.test(file) ? file : null;
}

/**
 * Stateless components (props + JSX only) are inlined into the parent at
 * compile time: Vela docs advise against custom components on watches because
 * each one gets its own ViewModel.
 */
function loadInlineComponent(name, ctx) {
  const info = ctx.componentRegistry.get(name);
  if (!info || !ctx.component || ctx.options.inline === false) return null;
  const file = resolveComponentFile(info.src, ctx);
  if (!file) return null;
  if (ctx.inlineCache.has(file)) return ctx.inlineCache.get(file);

  let model = null;
  try {
    const ast = parser.parse(fs.readFileSync(file, 'utf8'), {
      sourceType: 'module',
      plugins: ['jsx', 'typescript'],
    });
    model = analyzeInlineCandidate(ast);
  } catch (e) {
    model = null;
  }
  ctx.inlineCache.set(file, model);
  return model;
}

function analyzeInlineCandidate(ast) {
  let fn = null;
  let style = '';
  for (const stmt of ast.program.body) {
    if (t.isExportNamedDeclaration(stmt) && t.isVariableDeclaration(stmt.declaration)) {
      for (const d of stmt.declaration.declarations) {
        if (t.isIdentifier(d.id, { name: 'inline' }) && t.isBooleanLiteral(d.init, { value: false })) return null;
        if (t.isIdentifier(d.id, { name: 'style' })) style = cssFromNode(d.init) || '';
      }
    }
    if (t.isExportDefaultDeclaration(stmt)) fn = stmt.declaration;
  }
  if (!t.isFunctionDeclaration(fn) && !isFunctionNode(fn)) return null;

  const props = new Map();
  const p0 = fn.params[0];
  let propsObjectName = null;
  if (t.isObjectPattern(p0)) {
    for (const prop of p0.properties) {
      if (!t.isObjectProperty(prop)) return null;
      const key = propKeyName(prop.key);
      if (t.isAssignmentPattern(prop.value) && t.isIdentifier(prop.value.left, { name: key })) {
        props.set(key, prop.value.right);
      } else if (t.isIdentifier(prop.value, { name: key })) {
        props.set(key, null);
      } else {
        return null;
      }
    }
  } else if (t.isIdentifier(p0)) {
    propsObjectName = p0.name;
  } else if (p0) {
    return null;
  }

  const consts = new Map();
  let jsx = null;
  const stmts = t.isBlockStatement(fn.body) ? fn.body.body : [t.returnStatement(fn.body)];
  for (const stmt of stmts) {
    if (t.isVariableDeclaration(stmt)) {
      for (const d of stmt.declarations) {
        if (!t.isIdentifier(d.id) || !d.init) return null;
        if (d.id.name === 'style') {
          style = cssFromNode(d.init) || style;
          continue;
        }
        if (t.isCallExpression(d.init) && /^use[A-Z]/.test(calleeName(d.init))) return null;
        if (isFunctionNode(d.init)) return null;
        consts.set(d.id.name, d.init);
      }
    } else if (t.isReturnStatement(stmt)) {
      jsx = unwrapParens(stmt.argument);
    } else {
      return null;
    }
  }
  if (!t.isJSXElement(jsx) && !t.isJSXFragment(jsx)) return null;

  if (propsObjectName) {
    // `props.title` -> `title`
    const rewrite = (n) => rewriteTree(n, (node) => {
      if (t.isMemberExpression(node) && !node.computed && t.isIdentifier(node.object, { name: propsObjectName })) {
        const key = node.property.name;
        if (!props.has(key)) props.set(key, null);
        return t.identifier(key);
      }
      return undefined;
    });
    jsx = rewrite(jsx);
    for (const [k, v] of consts) consts.set(k, rewrite(v));
  }

  // Only inline when everything the template reads is a prop or derived const.
  let nested = false;
  t.traverseFast(jsx, (n) => {
    if (t.isJSXOpeningElement(n) && t.isJSXIdentifier(n.name) && /^[A-Z]/.test(n.name.name)) nested = true;
  });
  if (nested) return null;
  const allowed = new Set([...props.keys(), ...consts.keys(), ...TEMPLATE_GLOBALS]);
  const loopLocals = new Set();
  t.traverseFast(jsx, (n) => {
    if (isFunctionNode(n)) n.params.forEach((p) => referencedNames(p).forEach((x) => loopLocals.add(x)));
  });
  for (const used of [jsx, ...consts.values()].map(referencedNames)) {
    for (const n of used) {
      if (!allowed.has(n) && !loopLocals.has(n)) return null;
    }
  }
  return { props, consts, jsx, style };
}

function serializeInlinedComponent(node, name, model, ctx, opts) {
  const subst = new Map();
  const given = new Map();
  for (const attr of node.openingElement.attributes) {
    if (!t.isJSXAttribute(attr)) throw new Error('Spread `{...obj}` is not supported in Kovo.');
    const attrName = attr.name.name;
    if (attrName === 'key') continue;
    let value;
    if (attr.value === null) value = t.booleanLiteral(true);
    else if (t.isStringLiteral(attr.value)) value = t.stringLiteral(attr.value.value);
    else if (t.isJSXExpressionContainer(attr.value)) value = attr.value.expression;
    if (!model.props.has(attrName)) {
      ctx.warn(`<${name}> has no prop "${attrName}"; the attribute is ignored.`);
      continue;
    }
    given.set(attrName, value);
  }
  for (const [prop, def] of model.props) {
    subst.set(prop, given.get(prop) || def || t.identifier('undefined'));
  }
  for (const [cname, init] of model.consts) {
    subst.set(cname, t.parenthesizedExpression(substituteIdentifiers(init, subst)));
  }
  if (serializeChildren(node, ctx, 'block').length) {
    ctx.warn(`Children passed to <${name}> are ignored: Vela components have no <slot>.`);
  }
  if (!ctx.inlinedComponents.has(name)) {
    ctx.inlinedComponents.add(name);
    if (model.style.trim()) ctx.inlineStyles.push(model.style);
  }
  const root = substituteIdentifiers(model.jsx, subst);
  if (t.isJSXFragment(root)) {
    return serializeFragmentAsBlock(root, ctx, opts) || '';
  }
  return serializeJSXElement(root, ctx, opts);
}

function serializeCustomComponent(node, name, ctx, opts) {
  ctx.usedComponents.add(name);
  const inlineModel = loadInlineComponent(name, ctx);
  if (inlineModel) return serializeInlinedComponent(node, name, inlineModel, ctx, opts);

  const importInfo = ctx.componentRegistry.get(name);
  const kebabName = pascalToKebab(name);

  if (importInfo && !ctx.templateImports.some((imp) => imp.name === kebabName)) {
    ctx.templateImports.push({ name: kebabName, src: importInfo.src });
  }

  const COMPONENT_EVENT_RE = /^on[A-Z]/;
  const attrs = [];
  for (const attr of node.openingElement.attributes) {
    if (!t.isJSXAttribute(attr)) continue;
    const attrName = t.isJSXIdentifier(attr.name) ? attr.name.name : '';
    if (!attrName || attrName === 'key') continue;

    if (COMPONENT_EVENT_RE.test(attrName)) {
      const eventKebab = pascalToKebab(attrName.replace(/^on/, ''));
      const value = attr.value;
      let handler = '';
      if (t.isJSXExpressionContainer(value) && ctx.component) {
        // Kovo children emit `{ kovoArgs: [...] }`; unwrap it for the parent handler.
        const evt = t.identifier('evt');
        ctx.usesKovoArgs = true;
        const call = t.callExpression(t.cloneNode(value.expression, true), [
          t.spreadElement(t.callExpression(t.identifier('kovoArgs'), [evt])),
        ]);
        handler = hoistHandler([evt], call, ctx);
      } else if (t.isJSXExpressionContainer(value)) {
        handler = exprToVelaBinding(value.expression, ctx);
      } else if (t.isStringLiteral(value)) {
        handler = value.value;
      }
      if (handler) attrs.push(`@${eventKebab}="${handler}"`);
      continue;
    }

    if (attr.value === null) {
      attrs.push(`${camelToKebab(attrName)}="true"`);
      continue;
    }
    if (t.isStringLiteral(attr.value)) {
      attrs.push(`${camelToKebab(attrName)}="${escapeXml(attr.value.value)}"`);
      continue;
    }
    if (t.isJSXExpressionContainer(attr.value)) {
      attrs.push(`${camelToKebab(attrName)}="{{${exprToVelaBinding(attr.value.expression, ctx)}}}"`);
      continue;
    }
    ctx.warn(`Custom component attr ${attrName} dropped (unsupported value type).`);
  }

  attrs.push(...directiveAttrs(opts));

  const innerParts = serializeChildren(node, ctx, kebabName);
  if (innerParts.length) {
    ctx.warn(`Children passed to <${name}>: Vela documents no <slot>, so they may not render.`);
  }
  const attrStr = attrs.length ? ' ' + attrs.join(' ') : '';
  if (innerParts.length === 0) return `<${kebabName}${attrStr}/>`;
  return `<${kebabName}${attrStr}>${innerParts.join('')}</${kebabName}>`;
}

// -----------------------------------------------------------------------------
// Function components: analysis
// -----------------------------------------------------------------------------

function createComponentModel(kind) {
  return {
    kind,
    props: new Map(), // name -> { default: node|null, type: string|null }
    eventProps: new Map(), // onSelect -> 'select'
    state: new Map(), // name -> { init: node }
    setters: new Map(), // setName -> name
    refs: new Map(), // name -> { init, dom, elementId }
    computed: new Map(), // name -> { expr } | { fn }
    methods: new Map(), // name -> function node
    constants: new Map(), // template-bound constants -> init node
    derived: [], // [{ name, init, kind }]
    hoisted: [], // module-level declarations
    effects: [], // [{ fn, deps }]
    bridgedMethods: new Set(),
    bridgedValues: new Set(),
    memberNames: new Set(),
    reservedNames: new Set(),
    usedNames: new Set(),
    templateNode: null,
    styleCss: '',
    handlerCount: 0,
    computedCount: 0,
  };
}

function findHookInAst(ast, name) {
  for (let stmt of ast.program.body) {
    if (t.isExportNamedDeclaration(stmt) && stmt.declaration) stmt = stmt.declaration;
    if (t.isFunctionDeclaration(stmt) && stmt.id && stmt.id.name === name) return stmt;
    if (t.isVariableDeclaration(stmt)) {
      for (const d of stmt.declarations) {
        if (t.isIdentifier(d.id, { name }) && isFunctionNode(d.init)) return d.init;
      }
    }
  }
  return null;
}

function resolveModuleFile(src, fromFile) {
  return resolveSourceFile(src, fromFile);
}

function loadModule(file, ctx, root) {
  if (ctx.moduleCache.has(file)) return ctx.moduleCache.get(file);
  const ast = parser.parse(fs.readFileSync(file, 'utf8'), {
    sourceType: 'module',
    plugins: /\.ts$/.test(file) ? ['typescript'] : ['jsx', 'typescript'],
  });
  stripTypes(ast);
  const mod = { ast, file, root };
  ctx.moduleCache.set(file, mod);
  return mod;
}

/** Top-level binding of `name` in a module: an import specifier or a declaration. */
function topLevelBinding(ast, name) {
  for (let stmt of ast.program.body) {
    if (t.isImportDeclaration(stmt)) {
      const spec = stmt.specifiers.find((s) => s.local.name === name);
      if (spec) return { kind: 'import', decl: stmt, spec };
      continue;
    }
    if ((t.isExportNamedDeclaration(stmt) || t.isExportDefaultDeclaration(stmt)) && stmt.declaration) stmt = stmt.declaration;
    if ((t.isFunctionDeclaration(stmt) || t.isClassDeclaration(stmt)) && stmt.id && stmt.id.name === name) {
      return { kind: 'decl', node: stmt };
    }
    if (t.isVariableDeclaration(stmt)) {
      const d = stmt.declarations.find((x) => t.isIdentifier(x.id, { name }));
      if (d) return { kind: 'decl', node: t.variableDeclaration(stmt.kind, [d]) };
    }
  }
  return null;
}

/** Finds hook `name` in the module or, through a relative import, in another module. */
function resolveHook(name, mod, ctx) {
  const local = findHookInAst(mod.ast, name);
  if (local) return { fn: local, mod };
  const binding = topLevelBinding(mod.ast, name);
  if (!binding || binding.kind !== 'import') return null;
  const src = binding.decl.source.value;
  if (!/^\.\.?\//.test(src)) return { error: `it is imported from "${src}"; only relative imports can be inlined` };
  const file = resolveModuleFile(src, mod.file);
  if (!file) return { error: `"${src}" could not be resolved` };
  const hookMod = loadModule(file, ctx, mod.root);
  let exported = null;
  if (t.isImportDefaultSpecifier(binding.spec)) exported = 'default';
  else if (t.isImportSpecifier(binding.spec)) exported = propKeyName(binding.spec.imported);
  let localName = exported;
  for (const stmt of hookMod.ast.program.body) {
    if (exported === 'default' && t.isExportDefaultDeclaration(stmt)) {
      const d = stmt.declaration;
      if (t.isIdentifier(d)) localName = d.name;
      else if (isFunctionNode(d) || t.isFunctionDeclaration(d)) {
        if (mod === mod.root) ctx.inlinedHookImports.add(name);
        return { fn: d, mod: hookMod };
      }
    }
    if (t.isExportNamedDeclaration(stmt) && !stmt.declaration) {
      const spec = stmt.specifiers.find((x) => propKeyName(x.exported) === exported);
      if (spec) localName = spec.local.name;
    }
  }
  const fn = findHookInAst(hookMod.ast, localName);
  if (!fn) return { error: `"${src}" has no exported hook "${exported}"` };
  if (mod === mod.root) ctx.inlinedHookImports.add(name);
  return { fn, mod: hookMod };
}

/** Names read under `nodePath` that resolve to top-level bindings of `mod` (hooks excluded). */
function freeModuleNames(nodePath, mod) {
  const names = new Set();
  nodePath.traverse({
    Identifier(p) {
      if (!p.isReferencedIdentifier()) return;
      const n = p.node.name;
      if (p.scope.hasBinding(n, true) || /^use[A-Z]/.test(n)) return;
      if (topLevelBinding(mod.ast, n)) names.add(n);
    },
  });
  return names;
}

/** Copies an imported hook's module-level dependency into the compiled file. */
function importModuleDependency(name, mod, ctx) {
  const key = `${mod.file}#${name}`;
  if (ctx.importedDeps.has(key)) return;
  ctx.importedDeps.add(key);
  const binding = topLevelBinding(mod.ast, name);
  if (!binding) return;

  if (ctx.moduleBindings.has(name) || ctx.extraBindings.has(name)) {
    const mine = topLevelBinding(mod.root.ast, name);
    const same = mine && mine.kind === 'import' && binding.kind === 'import' &&
      mine.decl.source.value === binding.decl.source.value;
    if (!same) {
      ctx.warn(`"${name}" from ${path.basename(mod.file)} clashes with another "${name}" in ${path.basename(ctx.filename)}; rename one of them.`);
    }
    return;
  }
  ctx.extraBindings.set(name, key);

  if (binding.kind === 'import') {
    let src = binding.decl.source.value;
    if (KOVO_MODULES.has(src)) return;
    if (/^\.\.?\//.test(src) && ctx.filename && path.isAbsolute(ctx.filename)) {
      src = path.relative(path.dirname(ctx.filename), path.resolve(path.dirname(mod.file), src)).replace(/\\/g, '/');
      if (!src.startsWith('.')) src = `./${src}`;
    }
    ctx.extraImports.push(generator(t.importDeclaration([t.cloneNode(binding.spec)], t.stringLiteral(src)), { jsescOption: { quotes: 'single' } }).code);
    return;
  }
  const node = t.cloneNode(binding.node, true);
  traverse(t.file(t.program([node])), {
    Program(p) {
      for (const dep of freeModuleNames(p, mod)) if (dep !== name) importModuleDependency(dep, mod, ctx);
      p.stop();
    },
  });
  ctx.extraHelpers.push(generator(node).code);
}

/** Normalizes the props parameter: `({ a = 1 })` or `(props)` + `props.a`. */
function collectProps(fnPath, model, ctx, propTypes) {
  const p0Path = fnPath.get('params.0');
  if (!p0Path || !p0Path.node) return;
  const p0 = p0Path.node;

  const addProp = (name, def) => {
    if (/^on[A-Z]/.test(name)) {
      model.eventProps.set(name, lowerFirst(name.slice(2)));
      return;
    }
    if (!model.props.has(name)) model.props.set(name, { default: def, type: propTypes.get(name) || null });
  };

  if (t.isObjectPattern(p0)) {
    for (const propPath of p0Path.get('properties')) {
      const prop = propPath.node;
      if (t.isRestElement(prop)) {
        ctx.warn('Rest props (`...rest`) are not supported and are ignored.');
        continue;
      }
      const key = propKeyName(prop.key);
      let local = prop.value;
      let def = null;
      if (t.isAssignmentPattern(local)) {
        def = local.right;
        local = local.left;
      }
      if (!t.isIdentifier(local)) {
        ctx.warn(`Nested destructuring of prop "${key}" is not supported.`);
        continue;
      }
      if (local.name !== key) fnPath.scope.rename(local.name, key);
      addProp(key, def);
    }
  } else if (t.isIdentifier(p0)) {
    const binding = fnPath.scope.getBinding(p0.name);
    for (const ref of binding ? binding.referencePaths : []) {
      const parent = ref.parentPath;
      if (parent.isMemberExpression({ object: ref.node }) && !parent.node.computed) {
        const key = parent.node.property.name;
        addProp(key, null);
        parent.replaceWith(t.identifier(key));
      } else {
        ctx.warn(`"${p0.name}" is used as a whole object; only "${p0.name}.x" access is supported.`);
      }
    }
  }
}

/**
 * Inline a custom hook: clone it, substitute parameters with call arguments
 * and rename returned bindings to the names the caller destructures.
 */
function inlineHook(name, call, pattern, model, ctx, mod, depth) {
  const resolved = resolveHook(name, mod, ctx);
  if (!resolved || resolved.error) {
    ctx.warn(`Custom hook ${name}() could not be inlined: ${resolved ? resolved.error : 'it is not defined or imported in this file'}.`);
    return;
  }
  const hook = resolved.fn;
  const hookMod = resolved.mod;
  if (depth > 10) throw new Error(`Custom hook ${name}() recursion is too deep.`);

  const clone = t.cloneNode(hook, true);
  const fnExpr = t.isFunctionDeclaration(clone)
    ? t.functionExpression(null, clone.params, clone.body)
    : clone;
  const file = t.file(t.program([
    t.variableDeclaration('const', [t.variableDeclarator(t.identifier('kovoHook'), fnExpr)]),
  ]));
  let fnPath = null;
  traverse(file, {
    Function(p) {
      if (!fnPath) fnPath = p;
      p.stop();
    },
  });

  // Hooks from other modules bring their module-level dependencies along.
  // Collected before parameter substitution so caller expressions are not mistaken for them.
  if (hookMod !== mod.root) {
    for (const dep of freeModuleNames(fnPath, hookMod)) importModuleDependency(dep, hookMod, ctx);
  }

  const args = (call && call.arguments) || [];
  const renames = hookReturnRenames(name, fnPath, pattern, ctx);
  makeHookHygienic(fnPath, args, renames, model);

  fnPath.node.params.forEach((param, i) => {
    let pname = null;
    let def = null;
    if (t.isIdentifier(param)) pname = param.name;
    else if (t.isAssignmentPattern(param) && t.isIdentifier(param.left)) {
      pname = param.left.name;
      def = param.right;
    }
    if (!pname) {
      ctx.warn(`Hook ${name}(): destructured parameters are not supported.`);
      return;
    }
    const value = args[i] ? args[i] : def || t.identifier('undefined');
    const binding = fnPath.scope.getBinding(pname);
    if (binding && binding.constantViolations.length) {
      ctx.warn(`Hook ${name}(): parameter "${pname}" is reassigned; inlining may change behavior.`);
    }
    for (const ref of binding ? binding.referencePaths : []) ref.replaceWith(t.cloneNode(value, true));
  });

  // Rename through a temporary name so swaps (a<->b) do not collide.
  renames.forEach(([from], i) => fnPath.scope.rename(from, `kovoTmp${i}`));
  renames.forEach(([, to], i) => fnPath.scope.rename(`kovoTmp${i}`, to));

  for (const stmt of fnPath.node.body.body || []) {
    if (t.isReturnStatement(stmt)) continue;
    processComponentStatement(stmt, model, ctx, hookMod, depth + 1, false);
  }
}

/** [[hookName, callerName]] pairs for the values the caller destructures. */
function hookReturnRenames(name, fnPath, pattern, ctx) {
  let body = fnPath.node.body;
  if (!t.isBlockStatement(body)) {
    body = t.blockStatement([t.returnStatement(body)]);
    fnPath.node.body = body;
  }
  const ret = body.body.find((s) => t.isReturnStatement(s));
  const retArg = ret && unwrapParens(ret.argument);

  const renames = [];
  if (t.isObjectPattern(pattern) && t.isObjectExpression(retArg)) {
    for (const prop of pattern.properties) {
      if (!t.isObjectProperty(prop) || !t.isIdentifier(prop.value)) continue;
      const key = propKeyName(prop.key);
      const ret = retArg.properties.find((p) => t.isObjectProperty(p) && propKeyName(p.key) === key);
      if (!ret) {
        ctx.warn(`Hook ${name}() does not return "${key}".`);
        continue;
      }
      if (t.isIdentifier(ret.value)) renames.push([ret.value.name, prop.value.name]);
      else if (!t.isIdentifier(ret.value)) ctx.warn(`Hook ${name}(): returned "${key}" must be a plain identifier.`);
    }
  } else if (t.isArrayPattern(pattern) && t.isArrayExpression(retArg)) {
    pattern.elements.forEach((el, i) => {
      const ret = retArg.elements[i];
      if (t.isIdentifier(el) && t.isIdentifier(ret)) renames.push([ret.name, el.name]);
    });
  } else if (pattern && !t.isObjectPattern(pattern) && !t.isArrayPattern(pattern)) {
    ctx.warn(`Hook ${name}(): destructure its result (const { a } = ${name}()) so Kovo can inline it.`);
  }
  return renames;
}

/**
 * Hooks share one ViewModel with their caller, so the hook's own names must
 * not collide with the component's names, with names from earlier hook calls
 * (two useCounter() calls get separate state) or with names read by the call
 * arguments (substituted arguments must not be captured by hook locals).
 */
function makeHookHygienic(fnPath, args, renames, model) {
  const exported = new Set(renames.map(([from]) => from));
  const targets = new Set(renames.map(([, to]) => to));
  const argNames = new Set();
  for (const a of args) for (const n of referencedNames(a)) argNames.add(n);
  const taken = new Set([...model.reservedNames, ...model.usedNames, ...argNames]);
  for (const n of targets) taken.delete(n);

  const fresh = (scope, base) => {
    let i = 2;
    while (taken.has(`${base}${i}`) || scope.hasBinding(`${base}${i}`)) i++;
    return `${base}${i}`;
  };
  const params = new Set(fnPath.node.params.map((p) => (t.isAssignmentPattern(p) ? p.left : p)).filter((p) => t.isIdentifier(p)).map((p) => p.name));

  // Returned names are renamed to the caller's names later; move them out of
  // the way first when an argument reads the same name.
  for (const pair of renames) {
    if (!argNames.has(pair[0])) continue;
    const to = fresh(fnPath.scope, pair[0]);
    fnPath.scope.rename(pair[0], to);
    pair[0] = to;
  }

  // Top-level hook bindings become ViewModel members.
  for (const bname of Object.keys(fnPath.scope.bindings)) {
    if (params.has(bname) || exported.has(bname)) continue;
    if (taken.has(bname)) {
      const to = fresh(fnPath.scope, bname);
      fnPath.scope.rename(bname, to);
      model.usedNames.add(to);
    } else {
      model.usedNames.add(bname);
    }
  }
  for (const n of targets) model.usedNames.add(n);
  // Nested locals only need to avoid capturing the substituted arguments.
  if (!argNames.size) return;
  fnPath.traverse({
    Scopable(p) {
      if (p.scope === fnPath.scope) return;
      for (const bname of Object.keys(p.scope.bindings)) {
        if (argNames.has(bname)) p.scope.rename(bname, fresh(p.scope, bname));
      }
    },
  });
}

function processComponentStatement(stmt, model, ctx, mod, depth, isRoot) {
  if (t.isVariableDeclaration(stmt)) {
    for (const decl of stmt.declarations) {
      processDeclarator(decl, stmt.kind, model, ctx, mod, depth);
    }
    return;
  }
  if (t.isFunctionDeclaration(stmt)) {
    model.methods.set(stmt.id.name, stmt);
    return;
  }
  if (t.isExpressionStatement(stmt) && t.isCallExpression(stmt.expression)) {
    const call = stmt.expression;
    const name = calleeName(call);
    if (name === 'useEffect' || name === 'useLayoutEffect') {
      model.effects.push({ fn: call.arguments[0], deps: call.arguments[1] || null });
      return;
    }
    if (/^use[A-Z]/.test(name) && !KNOWN_HOOKS.has(name)) {
      inlineHook(name, call, null, model, ctx, mod, depth);
      return;
    }
  }
  if (t.isReturnStatement(stmt) && isRoot) {
    model.templateNode = unwrapParens(stmt.argument);
    return;
  }
  if (t.isIfStatement(stmt)) {
    let hasReturn = false;
    t.traverseFast(stmt, (n) => {
      if (t.isReturnStatement(n)) hasReturn = true;
    });
    if (hasReturn) {
      throw new Error('Early returns are not supported in components. Use a ternary or `cond && <X/>` inside the returned JSX.');
    }
  }
  if (t.isEmptyStatement(stmt)) return;
  ctx.warn(`Statement ignored in component body (move it into a function or useEffect): ${exprSource(stmt).slice(0, 60)}`);
}

function processDeclarator(decl, declKind, model, ctx, mod, depth) {
  const init = decl.init;
  const id = decl.id;
  const hook = t.isCallExpression(init) ? calleeName(init) : '';

  if (hook === 'useState') {
    if (!t.isArrayPattern(id)) {
      ctx.warn('useState() result must be destructured: const [value, setValue] = useState(...).');
      return;
    }
    const [stateId, setterId] = id.elements;
    if (!t.isIdentifier(stateId)) return;
    let initVal = init.arguments[0] || t.nullLiteral();
    if (isFunctionNode(initVal) && initVal.params.length === 0) {
      initVal = t.isBlockStatement(initVal.body) ? t.callExpression(initVal, []) : initVal.body;
    }
    model.state.set(stateId.name, { init: initVal });
    if (t.isIdentifier(setterId)) model.setters.set(setterId.name, stateId.name);
    return;
  }
  if (hook === 'useRef') {
    if (t.isIdentifier(id)) model.refs.set(id.name, { init: init.arguments[0] || t.nullLiteral(), dom: false, elementId: id.name });
    return;
  }
  if (hook === 'useMemo') {
    if (t.isIdentifier(id) && isFunctionNode(init.arguments[0])) model.computed.set(id.name, { fn: init.arguments[0] });
    return;
  }
  if (hook === 'useCallback') {
    if (t.isIdentifier(id) && isFunctionNode(init.arguments[0])) model.methods.set(id.name, init.arguments[0]);
    return;
  }
  if (/^use[A-Z]/.test(hook)) {
    if (KNOWN_HOOKS.has(hook)) return;
    if (['useContext', 'useReducer', 'useId', 'useTransition', 'useDeferredValue'].includes(hook)) {
      ctx.warn(`${hook}() is not supported by Kovo.`);
      return;
    }
    inlineHook(hook, init, id, model, ctx, mod, depth);
    return;
  }
  if (t.isIdentifier(id) && isFunctionNode(init)) {
    model.methods.set(id.name, init);
    return;
  }
  if (t.isIdentifier(id, { name: 'style' })) {
    const css = cssFromNode(init);
    if (css !== null) model.styleCss = css;
    return;
  }
  if (t.isIdentifier(id) && init) {
    model.derived.push({ name: id.name, init, kind: declKind });
    return;
  }
  if (init) {
    model.hoisted.push(t.variableDeclaration(declKind, [decl]));
  }
}

function classifyDerived(model, ctx) {
  const reactive = new Set([
    ...model.state.keys(), ...model.props.keys(), ...model.computed.keys(),
    ...model.eventProps.keys(), ...model.setters.keys(), ...model.methods.keys(),
  ]);
  for (const name of model.refs.keys()) reactive.add(name);
  const templateNames = model.templateNode ? referencedNames(model.templateNode) : new Set();
  for (const { name, init, kind } of model.derived) {
    const used = referencedNames(init);
    if ([...used].some((n) => reactive.has(n))) {
      model.computed.set(name, { expr: init });
      reactive.add(name);
    } else if (templateNames.has(name)) {
      model.constants.set(name, init);
      reactive.add(name);
    } else {
      model.hoisted.push(t.variableDeclaration(kind, [t.variableDeclarator(t.identifier(name), init)]));
    }
  }
}

function markDomRefs(model) {
  if (!model.templateNode) return;
  t.traverseFast(model.templateNode, (n) => {
    if (!t.isJSXOpeningElement(n)) return;
    const refAttr = n.attributes.find((a) => t.isJSXAttribute(a) && a.name.name === 'ref');
    if (!refAttr || !t.isJSXExpressionContainer(refAttr.value) || !t.isIdentifier(refAttr.value.expression)) return;
    const ref = model.refs.get(refAttr.value.expression.name);
    if (!ref) return;
    ref.dom = true;
    const idAttr = n.attributes.find((a) => t.isJSXAttribute(a) && a.name.name === 'id');
    if (idAttr && t.isStringLiteral(idAttr.value)) ref.elementId = idAttr.value.value;
  });
}

function validateMemberNames(model) {
  const check = (name, what) => {
    if (/^[$_]/.test(name)) {
      throw new Error(`${what} "${name}" cannot start with $ or _ (reserved by Vela).`);
    }
    if (RESERVED_NAMES.has(name)) {
      throw new Error(`${what} "${name}" is a reserved Vela name (for, if, elif, else, show, tid).`);
    }
  };
  for (const n of model.state.keys()) check(n, 'State');
  for (const n of model.props.keys()) check(n, 'Prop');
  for (const n of model.computed.keys()) check(n, 'Computed value');
  for (const n of model.constants.keys()) check(n, 'Value');
}

function detectKind(fnNode, filename, options) {
  if (options.kind === 'page' || options.kind === 'component') return options.kind;
  const normalized = String(filename || '').replace(/\\/g, '/');
  if (/\/components\//.test(normalized)) return 'component';
  if (/\/pages\//.test(normalized)) return 'page';
  return fnNode.params && fnNode.params.length > 0 ? 'component' : 'page';
}

function analyzeFunctionComponent(fnPath, ast, ctx, propTypes) {
  const fnNode = fnPath.node;
  const model = createComponentModel(detectKind(fnNode, ctx.filename, ctx.options));
  collectProps(fnPath, model, ctx, propTypes);

  const body = fnPath.node.body;
  const stmts = t.isBlockStatement(body) ? body.body : [t.returnStatement(body)];
  const mod = { ast, file: ctx.filename };
  mod.root = mod;
  // Names declared by the component itself; inlined hooks must not reuse them.
  model.reservedNames = new Set([...Object.keys(fnPath.scope.bindings), ...model.props.keys(), ...model.eventProps.keys()]);
  for (const stmt of stmts) processComponentStatement(stmt, model, ctx, mod, 0, true);

  classifyDerived(model, ctx);
  markDomRefs(model);
  validateMemberNames(model);

  for (const map of [model.state, model.props, model.eventProps, model.refs, model.computed,
    model.methods, model.constants, model.setters]) {
    for (const k of map.keys()) model.memberNames.add(k);
  }
  return model;
}

// -----------------------------------------------------------------------------
// Function components: script rewriting (scope-aware)
// -----------------------------------------------------------------------------

/**
 * Rewrites a function body so component members point at the ViewModel:
 *   count            -> this.count          (state, props, computed, values)
 *   setCount(x)      -> this.count = x
 *   setCount(c => c + 1) -> this.count = this.count + 1
 *   inputRef.current -> this.$element('inputRef')
 *   onSelect(v)      -> this.$emit('select', { kovoArgs: [v] })
 * Only identifiers that are NOT bound inside the function are rewritten, so
 * local variables, parameters and strings are never touched.
 */
function rewriteFunction(fnNode, model, ctx) {
  const fn = t.cloneNode(fnNode, true);
  let body = fn.body;
  if (!t.isBlockStatement(body)) body = t.blockStatement([t.returnStatement(body)]);
  const root = t.functionExpression(null, fn.params, body, !!fn.generator, !!fn.async);
  const file = t.file(t.program([t.expressionStatement(root)]));
  let needsSelf = false;

  const self = (p) => {
    const owner = p.findParent((x) => x.isFunction() && !x.isArrowFunctionExpression());
    if (!owner || owner.node === root) return t.thisExpression();
    needsSelf = true;
    return t.identifier('kovoSelf');
  };
  const member = (p, name) => t.memberExpression(self(p), t.identifier(name));
  const isFree = (p, name) => !p.scope.hasBinding(name, true);

  traverse(file, {
    MemberExpression(p) {
      const { node } = p;
      if (node.computed || !t.isIdentifier(node.object) || !t.isIdentifier(node.property, { name: 'current' })) return;
      const name = node.object.name;
      const ref = model.refs.get(name);
      if (!ref || !ref.dom || !isFree(p, name)) return;
      p.replaceWith(t.callExpression(member(p, '$element'), [t.stringLiteral(ref.elementId)]));
      p.skip();
    },
    CallExpression: {
      exit(p) {
        const callee = p.node.callee;
        if (!t.isIdentifier(callee) || !isFree(p.get('callee'), callee.name)) return;
        const name = callee.name;
        if (model.setters.has(name)) {
          const stateName = model.setters.get(name);
          const target = () => member(p, stateName);
          const argPath = p.get('arguments.0');
          let rhs;
          if (!argPath || !argPath.node) {
            rhs = t.identifier('undefined');
          } else if (argPath.isFunction() && argPath.node.params.length <= 1) {
            const param = argPath.node.params[0];
            if (!t.isBlockStatement(argPath.node.body) && (!param || t.isIdentifier(param))) {
              if (param) {
                const binding = argPath.scope.getBinding(param.name);
                for (const ref of binding ? binding.referencePaths : []) ref.replaceWith(target());
              }
              rhs = argPath.node.body;
            } else {
              rhs = t.callExpression(argPath.node, [target()]);
            }
          } else {
            rhs = argPath.node;
          }
          // Vela memory guide: update arrays in place instead of reallocating them.
          // setList([...list, a]) -> list.push(a); setList([a, ...list]) -> list.unshift(a)
          const isSelf = (n) => t.isMemberExpression(n) && !n.computed && t.isIdentifier(n.property, { name: stateName }) &&
            (t.isThisExpression(n.object) || t.isIdentifier(n.object, { name: 'kovoSelf' }));
          if (t.isArrayExpression(rhs) && rhs.elements.length > 1 && ctx.options.inPlaceUpdates !== false) {
            const els = rhs.elements;
            const spreads = els.filter((e) => t.isSpreadElement(e));
            if (spreads.length === 1 && isSelf(spreads[0].argument) && els.every((e) => e)) {
              if (els[0] === spreads[0]) {
                p.replaceWith(t.callExpression(t.memberExpression(target(), t.identifier('push')), els.slice(1)));
                return;
              }
              if (els[els.length - 1] === spreads[0]) {
                p.replaceWith(t.callExpression(t.memberExpression(target(), t.identifier('unshift')), els.slice(0, -1)));
                return;
              }
            }
          }
          p.replaceWith(t.assignmentExpression('=', target(), rhs));
        } else if (model.eventProps.has(name)) {
          p.replaceWith(t.callExpression(member(p, '$emit'), [
            t.stringLiteral(model.eventProps.get(name)),
            t.objectExpression([t.objectProperty(t.identifier('kovoArgs'), t.arrayExpression(p.node.arguments))]),
          ]));
        }
      },
    },
    Identifier(p) {
      if (!p.isReferencedIdentifier()) return;
      const name = p.node.name;
      if (!model.memberNames.has(name) || !isFree(p, name)) return;
      const parent = p.parent;
      const isCallee = t.isCallExpression(parent) && parent.callee === p.node;

      if (model.setters.has(name)) {
        if (isCallee) return;
        // Setter used as a value: a function that behaves like React's setter.
        const stateName = model.setters.get(name);
        const v = t.identifier('v');
        const target = member(p, stateName);
        p.replaceWith(t.arrowFunctionExpression([v], t.assignmentExpression('=', target,
          t.conditionalExpression(
            t.binaryExpression('===', t.unaryExpression('typeof', v), t.stringLiteral('function')),
            t.callExpression(v, [t.cloneNode(target)]),
            v,
          ))));
        p.skip();
        return;
      }
      if (model.eventProps.has(name)) {
        if (isCallee) return;
        // `if (onSelect)` / `onSelect && ...`: parents may always listen, so it is truthy.
        const isTest = (t.isIfStatement(parent) || t.isConditionalExpression(parent)) && parent.test === p.node ||
          t.isLogicalExpression(parent) && parent.left === p.node ||
          t.isUnaryExpression(parent, { operator: '!' });
        if (isTest) {
          p.replaceWith(t.booleanLiteral(true));
          return;
        }
        const a = t.identifier('args');
        p.replaceWith(t.arrowFunctionExpression([t.restElement(a)], t.callExpression(
          member(p, '$emit'),
          [t.stringLiteral(model.eventProps.get(name)),
            t.objectExpression([t.objectProperty(t.identifier('kovoArgs'), a)])],
        )));
        p.skip();
        return;
      }
      if (model.methods.has(name) && !isCallee) {
        p.replaceWith(t.callExpression(t.memberExpression(member(p, name), t.identifier('bind')), [self(p)]));
        p.skip();
        return;
      }
      const ref = model.refs.get(name);
      if (ref && ref.dom) {
        ctx.warn(`DOM ref "${name}" is only supported as ${name}.current.`);
        p.replaceWith(t.callExpression(member(p, '$element'), [t.stringLiteral(ref.elementId)]));
        p.skip();
        return;
      }
      p.replaceWith(member(p, name));
      p.skip();
    },
  });

  if (needsSelf) {
    root.body.body.unshift(t.variableDeclaration('const', [
      t.variableDeclarator(t.identifier('kovoSelf'), t.thisExpression()),
    ]));
  }
  return root;
}

function objectMethod(name, fn) {
  return t.objectMethod('method', t.identifier(name), fn.params, fn.body, false, fn.generator, fn.async);
}

function isStaticInit(node, model) {
  const used = referencedNames(node);
  return ![...used].some((n) => model.memberNames.has(n));
}

/**
 * `[a, obj.b]` deps -> ['a', 'obj.b'] watch paths. Expression deps such as
 * `${API}/${id}` (common after inlining `useFetch(url)`) watch every
 * reactive value they read.
 */
function depPaths(deps, model, ctx) {
  const paths = [];
  const watchable = (name) => model.memberNames.has(name) && !model.methods.has(name) &&
    !model.setters.has(name) && !model.refs.has(name) && !model.eventProps.has(name);
  for (const el of deps.elements) {
    let n = el;
    const parts = [];
    while (t.isMemberExpression(n) && !n.computed && t.isIdentifier(n.property)) {
      parts.unshift(n.property.name);
      n = n.object;
    }
    if (t.isIdentifier(n) && model.memberNames.has(n.name) && !model.methods.has(n.name) &&
        !model.setters.has(n.name)) {
      if (model.refs.has(n.name)) continue;
      paths.push([n.name, ...parts].join('.'));
    } else if (t.isIdentifier(n) && (model.methods.has(n.name) || model.setters.has(n.name))) {
      continue;
    } else {
      const reads = [...referencedNames(el)].filter(watchable);
      if (reads.length) paths.push(...reads);
      else if (!isStaticInit(el, model)) {
        ctx.warn(`useEffect dependency "${exprSource(el)}" cannot be watched; only state, props and computed values can.`);
      }
    }
  }
  return [...new Set(paths)];
}

/** `return x` outside nested functions; with `bare`, also a plain `return;`. */
function hasTopLevelReturn(block, bare = false) {
  let found = false;
  (function walk(n) {
    if (!n || typeof n.type !== 'string' || found) return;
    if (t.isReturnStatement(n) && (n.argument || bare)) {
      found = true;
      return;
    }
    if (t.isFunction(n)) return;
    for (const k of t.VISITOR_KEYS[n.type] || []) {
      const c = n[k];
      if (Array.isArray(c)) c.forEach(walk);
      else walk(c);
    }
  })(block);
  return found;
}

const thisMember = (name) => t.memberExpression(t.thisExpression(), t.identifier(name));
const callThis = (name, args = []) => t.expressionStatement(t.callExpression(thisMember(name), args));

function buildFunctionScript(model, ctx) {
  const props = [];
  const lifecycle = { onInit: [], onReady: [], onDestroy: [] };
  const extraMethods = [];

  // props
  if (model.kind === 'component' && model.props.size) {
    props.push(t.objectProperty(t.identifier('props'), t.objectExpression(
      [...model.props].map(([name, info]) => {
        const fields = [];
        if (info.default) fields.push(t.objectProperty(t.identifier('default'), t.cloneNode(info.default, true)));
        if (info.type) fields.push(t.objectProperty(t.identifier('type'), t.identifier(info.type)));
        return t.objectProperty(t.identifier(name), t.objectExpression(fields));
      }),
    )));
  } else if (model.kind === 'page' && model.props.size) {
    ctx.warn('Pages do not receive props; router params arrive as state. Declare them with useState().');
  }

  // Vela memory guide: data the UI never reads should not live in the ViewModel
  // (every data field gets observers). "UI" = template, computed values and watched deps.
  const uiNames = new Set();
  (function collect(n, parent) {
    if (!n || typeof n.type !== 'string') return;
    // Event handlers run code; they do not display values.
    if (t.isJSXAttribute(n)) {
      const an = t.isJSXIdentifier(n.name) ? n.name.name : '';
      if (EVENT_MAP[an] || /^on[A-Z]/.test(an) || an === 'ref' || an === 'key') return;
    }
    if (t.isIdentifier(n) && (!parent || t.isReferenced(n, parent))) uiNames.add(n.name);
    for (const k of t.VISITOR_KEYS[n.type] || []) {
      const c = n[k];
      if (Array.isArray(c)) c.forEach((x) => collect(x, n));
      else collect(c, n);
    }
  })(model.templateNode, null);
  for (const c of model.computed.values()) referencedNames(c.fn || c.expr).forEach((n) => uiNames.add(n));
  for (const eff of model.effects) {
    if (eff.deps && t.isArrayExpression(eff.deps)) {
      depPaths(eff.deps, model, ctx).forEach((p) => uiNames.add(p.split('.')[0]));
    }
  }

  // data: pages use `protected` so in-app router params can override values.
  const data = [];
  for (const [name, { init }] of model.state) {
    if (!uiNames.has(name)) {
      if (model.kind === 'component' && ctx.options.trimData !== false) {
        lifecycle.onInit.push(t.expressionStatement(t.assignmentExpression('=', thisMember(name), t.cloneNode(init, true))));
        continue;
      }
      if (model.kind === 'page') {
        ctx.warn(
          `State "${name}" is never shown. Unless it receives a router param, use useRef() to keep it ` +
          'out of the ViewModel (Vela memory guide: non-UI data adds observers).',
        );
      }
    }
    if (isStaticInit(init, model)) {
      data.push(t.objectProperty(t.identifier(name), t.cloneNode(init, true)));
    } else {
      data.push(t.objectProperty(t.identifier(name), t.nullLiteral()));
      lifecycle.onInit.push(t.expressionStatement(t.assignmentExpression('=', thisMember(name), t.cloneNode(init, true))));
    }
  }
  for (const [name, init] of model.constants) {
    data.push(t.objectProperty(t.identifier(name), t.cloneNode(init, true)));
  }
  for (const name of model.bridgedValues) {
    data.push(t.objectProperty(t.identifier(name), t.identifier(name)));
  }
  if (data.length || model.kind === 'page') {
    const key = model.kind === 'page' ? 'protected' : 'data';
    props.push(t.objectProperty(t.identifier(key), t.objectExpression(data)));
  }

  // Non-DOM refs are plain (non-reactive) ViewModel fields.
  for (const [name, ref] of model.refs) {
    if (ref.dom) continue;
    lifecycle.onInit.push(t.expressionStatement(t.assignmentExpression('=', thisMember(name),
      t.objectExpression([t.objectProperty(t.identifier('current'), t.cloneNode(ref.init, true))]))));
  }

  // effects
  let warnedNoDeps = false;
  model.effects.forEach((eff, i) => {
    if (!isFunctionNode(eff.fn)) {
      ctx.warn('useEffect() expects a function.');
      return;
    }
    let block = eff.fn.body;
    if (!t.isBlockStatement(block)) block = t.blockStatement([t.expressionStatement(block)]);
    const hasCleanup = hasTopLevelReturn(block);
    if (!hasCleanup) {
      let interval = false;
      t.traverseFast(block, (n) => {
        if (t.isCallExpression(n) && t.isIdentifier(n.callee, { name: 'setInterval' })) interval = true;
      });
      if (interval) {
        ctx.warn('useEffect() starts a setInterval without a cleanup. Return () => clearInterval(id) so the timer stops on onDestroy (Vela memory guide).');
      }
    }
    let paths = [];
    if (!eff.deps) {
      if (!warnedNoDeps) {
        ctx.warn('useEffect() without a dependency array runs once: Vela has no re-render cycle. Pass [deps] to re-run on changes.');
        warnedNoDeps = true;
      }
    } else if (t.isArrayExpression(eff.deps)) {
      paths = depPaths(eff.deps, model, ctx);
    }
    const used = referencedNames(block);
    const usesDom = [...model.refs].some(([name, ref]) => ref.dom && used.has(name));
    const hook = usesDom ? 'onReady' : 'onInit';

    // A guard `return;` must stay inside its own method, or it would leave onInit.
    if (!hasCleanup && paths.length === 0 && !hasTopLevelReturn(block, true)) {
      const scoped = block.body.some((st) => t.isVariableDeclaration(st) && st.kind !== 'var' ||
        t.isFunctionDeclaration(st) || t.isClassDeclaration(st));
      const cloned = t.cloneNode(block, true);
      if (scoped) lifecycle[hook].push(cloned);
      else lifecycle[hook].push(...cloned.body);
      return;
    }
    const methodName = `kovoEffect${i}`;
    const cleanupName = `kovoCleanup${i}`;
    const stmts = hasCleanup
      ? [
        t.ifStatement(
          t.binaryExpression('===', t.unaryExpression('typeof', thisMember(cleanupName)), t.stringLiteral('function')),
          callThis(cleanupName),
        ),
        t.expressionStatement(t.assignmentExpression('=', thisMember(cleanupName),
          t.callExpression(t.arrowFunctionExpression([], t.cloneNode(block, true)), []))),
      ]
      : t.cloneNode(block, true).body;
    extraMethods.push([methodName, t.functionExpression(null, [], t.blockStatement(stmts))]);
    lifecycle[hook].push(callThis(methodName));
    for (const p of paths) {
      lifecycle[hook].push(callThis('$watch', [t.stringLiteral(p), t.stringLiteral(methodName)]));
    }
    if (hasCleanup) {
      lifecycle.onDestroy.push(t.ifStatement(
        t.binaryExpression('===', t.unaryExpression('typeof', thisMember(cleanupName)), t.stringLiteral('function')),
        callThis(cleanupName),
      ));
    }
  });

  // computed
  if (model.computed.size) {
    props.push(t.objectProperty(t.identifier('computed'), t.objectExpression(
      [...model.computed].map(([name, c]) => {
        const fn = c.fn || t.functionExpression(null, [], t.blockStatement([t.returnStatement(t.cloneNode(c.expr, true))]));
        return objectMethod(name, rewriteFunction(fn, model, ctx));
      }),
    )));
  }

  // methods
  for (const [name, fn] of model.methods) {
    props.push(objectMethod(name, rewriteFunction(fn, model, ctx)));
  }
  for (const [name, fn] of extraMethods) {
    props.push(objectMethod(name, rewriteFunction(fn, model, ctx)));
  }
  for (const name of model.bridgedMethods) {
    if (!model.methods.has(name)) props.push(t.objectProperty(t.identifier(name), t.identifier(name), false, true));
  }

  // lifecycles
  for (const [hook, stmts] of Object.entries(lifecycle)) {
    if (!stmts.length) continue;
    const fn = t.functionExpression(null, [], t.blockStatement(stmts));
    props.push(objectMethod(hook, rewriteFunction(fn, model, ctx)));
  }

  return generator(t.exportDefaultDeclaration(t.objectExpression(props))).code;
}

function processFunctionalComponent(fnPath, ctx, ast, propTypes) {
  const model = analyzeFunctionComponent(fnPath, ast, ctx, propTypes);
  ctx.component = model;
  let templateXml = null;
  try {
    const node = model.templateNode;
    if (t.isJSXElement(node)) templateXml = serializeJSXElement(node, ctx);
    else if (t.isJSXFragment(node)) templateXml = serializeRootFragment(node, ctx);
    else if (node && !t.isNullLiteral(node)) {
      ctx.warn('Component root is not a single JSX element — wrapping it in <div>.');
      templateXml = wrapChildren('div', '', [serializeJSXExpression(node, ctx, 'div')].filter(Boolean));
    }
  } finally {
    ctx.component = null;
  }
  if (!model.templateNode) {
    ctx.warn('Component returns no JSX. If the JSX starts on the line after `return`, wrap it in parentheses: return ( <div/> ).');
  }
  const scriptPropLines = buildFunctionScript(model, ctx);
  return {
    templateXml,
    styleCss: model.styleCss,
    scriptPropLines,
    hoisted: model.hoisted.map((d) => generator(d).code),
  };
}

// -----------------------------------------------------------------------------
// Top-level: parse a file, build the .ux content
// -----------------------------------------------------------------------------

function getLineNumber(node) {
  return (node && node.loc && node.loc.start && node.loc.start.line) || 0;
}

function collectModuleBindings(ast) {
  const map = new Map();
  for (let stmt of ast.program.body) {
    if (t.isExportNamedDeclaration(stmt) && stmt.declaration) stmt = stmt.declaration;
    if (t.isFunctionDeclaration(stmt) && stmt.id) map.set(stmt.id.name, 'function');
    if (t.isVariableDeclaration(stmt)) {
      for (const d of stmt.declarations) {
        if (t.isIdentifier(d.id)) map.set(d.id.name, isFunctionNode(d.init) ? 'function' : 'value');
      }
    }
    if (t.isImportDeclaration(stmt)) {
      for (const s of stmt.specifiers) map.set(s.local.name, 'value');
    }
  }
  return map;
}

function resolveExportedFunction(programPath, decl) {
  if (!t.isIdentifier(decl)) return null;
  const binding = programPath.scope.getBinding(decl.name);
  if (!binding) return null;
  if (binding.path.isFunctionDeclaration()) return binding.path;
  if (binding.path.isVariableDeclarator()) {
    const init = binding.path.get('init');
    if (init.isFunction()) return init;
  }
  return null;
}

function buildUxContent(source, filename, options = {}) {
  let ast;
  try {
    ast = parser.parse(source, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript', 'classProperties'],
    });
  } catch (e) {
    if (e instanceof SyntaxError) {
      const loc = e.loc || { line: 0, column: 0 };
      const lines = source.split('\n');
      const ctxLine = lines[loc.line - 1] || '';
      throw new Error(
        `[vela-ux] Syntax error in ${filename}:${loc.line}:${loc.column}\n` +
        `  ${ctxLine}\n` +
        `  ${'~'.repeat(Math.max(1, loc.column - 1))}^\n` +
        `  ${e.message}`
      );
    }
    throw new Error(`[vela-ux] Failed to parse ${filename}: ${e.message}`);
  }

  const ctx = createContext(filename, options);

  // Prop types come from TS annotations, so read them before stripping types.
  let propTypes = new Map();
  for (const stmt of ast.program.body) {
    if (!t.isExportDefaultDeclaration(stmt)) continue;
    let fn = stmt.declaration;
    if (t.isIdentifier(fn)) fn = findHookInAst(ast, fn.name);
    if (fn && (t.isFunctionDeclaration(fn) || isFunctionNode(fn))) propTypes = collectPropTypes(ast, fn);
  }
  stripTypes(ast);
  checkGlyphs(ast, ctx);
  ctx.moduleBindings = collectModuleBindings(ast);

  const importNodes = [];
  for (const stmt of ast.program.body) {
    if (!t.isImportDeclaration(stmt)) continue;
    const src = stmt.source.value;
    if (KOVO_MODULES.has(src)) continue;
    const isRelativeOrComp = /^\.\.?\//.test(src) || /\.(ux|tsx?)$/.test(src);
    if (isRelativeOrComp) {
      for (const spec of stmt.specifiers) {
        if (t.isImportDefaultSpecifier(spec) && /^[A-Z]/.test(spec.local.name)) {
          ctx.componentRegistry.set(spec.local.name, { localName: spec.local.name, src });
        }
      }
    }
    importNodes.push(stmt);
  }

  const warnings = ctx.warnings;
  const helperLines = [];
  let hoistedLines = [];
  let templateXml = null;
  let styleCss = '';
  let styleLang = null;
  let scriptPropLines = null;
  let templateSourceLine = 0;
  let styleSourceLine = 0;
  let exportDefaultLine = 0;
  let componentPathNode = null;

  traverse(ast, {
    ExportNamedDeclaration(p) {
      const decl = p.node.declaration;
      if (t.isVariableDeclaration(decl)) {
        for (const vdecl of decl.declarations) {
          if (t.isIdentifier(vdecl.id, { name: 'style' })) {
            const css = cssFromNode(vdecl.init);
            if (css !== null) {
              styleCss = css;
              styleSourceLine = getLineNumber(vdecl.init);
            }
          }
          if (t.isIdentifier(vdecl.id, { name: 'styleLang' }) && t.isStringLiteral(vdecl.init)) {
            styleLang = vdecl.init.value;
          }
        }
      }
    },
    VariableDeclaration(p) {
      if (p.parentPath && p.parentPath.isProgram()) {
        for (const vdecl of p.node.declarations) {
          if (t.isIdentifier(vdecl.id, { name: 'style' })) {
            const css = cssFromNode(vdecl.init);
            if (css !== null) styleCss = css;
          }
        }
      }
    },
    ExportDefaultDeclaration(p) {
      exportDefaultLine = getLineNumber(p.node);
      const declPath = p.get('declaration');
      const decl = declPath.node;

      let fnPath = null;
      if (declPath.isFunction()) fnPath = declPath;
      else if (t.isIdentifier(decl)) fnPath = resolveExportedFunction(p.parentPath, decl);
      if (fnPath) {
        componentPathNode = fnPath.parentPath.isVariableDeclarator() ? fnPath.parent : null;
        ctx.isFunctionComponent = true;
        const res = processFunctionalComponent(fnPath, ctx, ast, propTypes);
        if (res.templateXml) templateXml = res.templateXml;
        if (res.styleCss) styleCss = res.styleCss;
        templateSourceLine = getLineNumber(fnPath.node);
        scriptPropLines = res.scriptPropLines;
        hoistedLines = res.hoisted;
        p.skip();
        return;
      }

      if (!t.isObjectExpression(decl)) {
        const got = exprSource(decl).substring(0, 60);
        throw new Error(
          `[vela-ux] export default must be an object expression or function expression at ${filename}, got: ${got}`
        );
      }
      const propByName = {};
      for (const prop of decl.properties) {
        if (t.isSpreadElement(prop)) continue;
        if (!t.isObjectProperty(prop) && !t.isObjectMethod(prop)) continue;
        const key = propKeyName(prop.key);
        propByName[key] = prop;
      }

      if (propByName.template) {
        const tv = propByName.template.value;
        templateSourceLine = getLineNumber(tv);
        if (t.isJSXElement(tv)) templateXml = serializeJSXElement(tv, ctx);
        else if (t.isJSXFragment(tv)) templateXml = serializeRootFragment(tv, ctx);
        else {
          const got = exprSource(tv).substring(0, 40);
          throw new Error(
            `[vela-ux] template must be a JSX element or fragment at ${filename}, got: ${got}`
          );
        }
      }

      if (propByName.style) {
        const sv = propByName.style.value;
        styleSourceLine = getLineNumber(sv);
        const css = cssFromNode(sv);
        if (css === null) {
          const got = exprSource(sv).substring(0, 40);
          throw new Error(
            `[vela-ux] style must be a string or template literal at ${filename}, got: ${got}`
          );
        }
        styleCss = css;
      }

      if (propByName.computed) {
        const cv = propByName.computed;
        if (t.isObjectProperty(cv) && t.isObjectExpression(cv.value)) {
          for (const prop of cv.value.properties) {
            if (t.isObjectMethod(prop) || t.isObjectProperty(prop)) {
              const k = propKeyName(prop.key);
              if (!t.isObjectMethod(prop) && !isFunctionNode(prop.value) && !t.isObjectExpression(prop.value)) {
                warnings.push(`Computed property "${k}" should be a function (${filename})`);
              }
            }
          }
        }
      }

      const otherProps = decl.properties.filter(
        (p) =>
          (t.isObjectProperty(p) || t.isObjectMethod(p)) &&
          t.isIdentifier(p.key) &&
          p.key.name !== 'template' &&
          p.key.name !== 'style',
      );
      const propStrs = otherProps.map((p) => {
        if (t.isObjectMethod(p)) {
          const code = generator(p, { compact: false }).code.replace(/\n\s*/g, ' ');
          return `  ${code},`;
        }
        const key = p.key.name;
        const value = generator(p.value, { compact: false }).code.replace(/\n\s*/g, ' ');
        return `  ${key}: ${value},`;
      });
      scriptPropLines = `export default {\n${propStrs.join('\n')}\n}`;
    },
  });

  for (const stmt of ast.program.body) {
    if (t.isFunctionDeclaration(stmt)) {
      const fnName = stmt.id ? stmt.id.name : '';
      if (/^use[A-Z]/.test(fnName) || /^[A-Z]/.test(fnName)) continue;
      helperLines.push(generator(stmt).code);
    } else if (t.isVariableDeclaration(stmt)) {
      const skip = stmt.declarations.some((d) =>
        t.isIdentifier(d.id) && (
          d.id.name === 'style' ||
          d === componentPathNode ||
          (isFunctionNode(d.init) && (/^use[A-Z]/.test(d.id.name) || /^[A-Z]/.test(d.id.name)))
        ));
      if (!skip) helperLines.push(generator(stmt).code);
    }
  }
  helperLines.unshift(...ctx.extraHelpers);
  if (ctx.usesKovoArgs) helperLines.push(KOVO_ARGS_HELPER);

  if (!templateXml && !scriptPropLines) {
    throw new Error(`[vela-ux] No \`template\` property found in export default of ${filename}.`);
  }

  // Component imports are template-level (<import>), not script imports.
  const isComponentImport = (imp) => imp.specifiers.length > 0 && imp.specifiers.every((s) =>
    ctx.componentRegistry.has(s.local.name) && (
      ctx.usesDynamicComponent ||
      ctx.usedComponents.has(s.local.name) ||
      /\.(ux|tsx)$/.test(imp.source.value) ||
      resolveComponentFile(imp.source.value, ctx)));
  // Inlined hooks are compiled away: drop their import specifiers.
  const remainingImports = importNodes
    .map((imp) => {
      if (!imp.specifiers.some((s) => ctx.inlinedHookImports.has(s.local.name))) return imp;
      const specifiers = imp.specifiers.filter((s) => !ctx.inlinedHookImports.has(s.local.name));
      return specifiers.length ? { ...imp, specifiers } : null;
    })
    .filter(Boolean);
  const jsImportLines = remainingImports
    .filter((imp) => !isComponentImport(imp))
    .map((imp) => generator(imp).code)
    .concat(ctx.extraImports);

  if (ctx.inlineStyles.length) {
    styleCss = [styleCss, ...ctx.inlineStyles].filter((s) => s.trim()).join('\n');
  }
  if (styleCss.trim() && !styleLang) lintCss(styleCss, ctx);
  if (styleCss.trim() && !styleLang && ctx.isFunctionComponent && templateXml && !ctx.classesUnknown &&
      ctx.options.pruneCss !== false) {
    styleCss = pruneUnusedCss(styleCss, ctx.usedClasses);
  }

  // <component is="..."> resolves names at runtime: every imported component needs an <import>.
  if (ctx.usesDynamicComponent) {
    for (const [local, info] of ctx.componentRegistry) {
      const kebab = pascalToKebab(local);
      ctx.usedComponents.add(local);
      if (!ctx.templateImports.some((imp) => imp.name === kebab)) ctx.templateImports.push({ name: kebab, src: info.src });
    }
  }

  const parts = [];
  if (templateXml) {
    for (const imp of ctx.templateImports) {
      let srcAttr = imp.src;
      if (!/\.ux$/.test(srcAttr)) {
        srcAttr = srcAttr.replace(/\.tsx?$/, '') + '.ux';
      }
      parts.push(`<import name="${imp.name}" src="${srcAttr}"></import>`);
    }
    parts.push('<template>');
    parts.push(templateXml);
    parts.push('</template>');
  }
  if (styleCss.trim()) {
    parts.push('');
    parts.push(styleLang ? `<style lang="${styleLang}">` : '<style>');
    parts.push(styleCss);
    parts.push('</style>');
  }
  parts.push('');
  parts.push('<script>');
  if (jsImportLines.length) parts.push(jsImportLines.join('\n'));
  const moduleCode = [...helperLines, ...hoistedLines];
  if (moduleCode.length) {
    if (jsImportLines.length) parts.push('');
    parts.push(moduleCode.join('\n\n'));
  }
  if (jsImportLines.length || moduleCode.length) parts.push('');
  if (scriptPropLines) parts.push(scriptPropLines);
  parts.push('</script>');

  const content = parts.join('\n');
  const sectionRanges = [];
  let uxLineCursor = 1;
  const sectionHeaders = {
    template: { startTag: '<template>', endTag: '</template>', tsxSrc: templateSourceLine },
    style: { startTag: '<style>', endTag: '</style>', tsxSrc: styleSourceLine },
    script: { startTag: '<script>', endTag: '</script>', tsxSrc: exportDefaultLine || templateSourceLine },
  };
  let currentSection = null;
  for (let i = 0; i < parts.length; i++) {
    const pLines = parts[i].split('\n');
    for (const [type, h] of Object.entries(sectionHeaders)) {
      const isStart = parts[i] === h.startTag || (type === 'style' && /^<style( lang="[^"]+")?>$/.test(parts[i]));
      if (isStart) {
        currentSection = { type, tsxSrc: h.tsxSrc, startLine: uxLineCursor };
      }
      if (parts[i] === h.endTag && currentSection) {
        currentSection.endLine = uxLineCursor + pLines.length - 1;
        sectionRanges.push({
          type: currentSection.type,
          uxStart: currentSection.startLine,
          uxEnd: currentSection.endLine,
          tsxLine: currentSection.tsxSrc,
        });
        currentSection = null;
      }
    }
    uxLineCursor += pLines.length;
  }
  const lineMap = [];
  for (const sr of sectionRanges) {
    for (let u = sr.uxStart; u <= sr.uxEnd; u++) {
      lineMap[u] = sr.tsxLine;
    }
  }

  return { content, warnings, lineMap, sectionRanges };
}

// -----------------------------------------------------------------------------
// Babel plugin wrapper (used by .babelrc)
// -----------------------------------------------------------------------------

module.exports = function () {
  return {
    name: 'vela-ux',
    visitor: {
      Program: {
        exit(programPath, state) {
          const filename = state.filename || '<unknown>';
          const normalized = filename.replace(/\\/g, '/');
          if (/\.ux$/i.test(filename) || normalized.includes('/node_modules/') || !/\.(t|j)sx$/i.test(filename)) {
            return;
          }
          const source = state.file.code;
          const { content, warnings } = buildUxContent(source, filename, state.opts || {});
          for (const w of warnings) {
            // eslint-disable-next-line no-console
            console.warn(`[vela-ux] ${filename}: ${w}`);
          }
          // Replace the program with a single string literal export so the
          // build script can read it and write the .ux file.
          programPath.replaceWith(
            t.program([
              t.expressionStatement(
                t.callExpression(t.identifier('__vela_write_ux__'), [
                  t.stringLiteral(filename),
                  t.stringLiteral(content),
                ]),
              ),
            ]),
          );
        },
      },
    },
  };
};

/**
 * Compiles a plain .ts/.js module from src-tsx/ (helpers, constants) to the
 * JavaScript the .ux scripts import. Kovo hook imports are dropped: hooks are
 * inlined into the components that call them.
 */
function compileScriptModule(source, filename) {
  const ast = parser.parse(source, {
    sourceType: 'module',
    plugins: /\.(ts|mts)$/.test(filename) ? ['typescript'] : ['jsx', 'typescript'],
  });
  stripTypes(ast);
  ast.program.body = ast.program.body.filter(
    (s) => !(t.isImportDeclaration(s) && KOVO_MODULES.has(s.source.value)),
  );
  return generator(ast).code;
}

module.exports.buildUxContent = buildUxContent;
module.exports.compileScriptModule = compileScriptModule;
module.exports.resolveSourceFile = resolveSourceFile;
module.exports.sourceCandidates = sourceCandidates;
