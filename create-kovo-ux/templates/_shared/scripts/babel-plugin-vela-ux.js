/**
 * babel-plugin-vela-ux
 * ----------------------------------------------------------------------------
 * Transforms TSX files written in React-style JSX into Xiaomi Vela .ux files
 * (template + style + script blocks).
 *
 *   export default {
 *     data: { ... },
 *     methods: { ... },
 *     style: `.foo { color: red }`,
 *     template: (
 *       <div className="x" onClick={this.fn} if={this.visible}>
 *         <text>{this.title}</text>
 *         {this.items.map(item => <image src={item.src} />)}
 *       </div>
 *     ),
 *   }
 *
 *   =>
 *
 *   <template>
 *     <div class="x" @click="fn" if="{{visible}}">
 *       <text>{{title}}</text>
 *       <image for="{{item in items}}" src="{{item.src}}" />
 *     </div>
 *   </template>
 *   <style>
 *     .foo { color: red }
 *   </style>
 *   <script>
 *     export default {
 *       data: { ... },
 *       methods: { ... },
 *     }
 *   </script>
 */

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

// Component registry: populated by buildUxContent during import-collection pass
let _componentRegistry = null;

const CONTAINER_LIKE = new Set([
  'div', 'stack', 'list', 'list-item', 'scroll', 'swiper',
  'image-animator', 'marquee',
]);

const TEXT_LIKE = new Set(['text', 'span']);

// -----------------------------------------------------------------------------
// Utility helpers
// -----------------------------------------------------------------------------

function exprSource(node) {
  if (!node) return '';
  return generator(node).code.trim();
}

function dropThis(src) {
  return src.replace(/\bthis\./g, '');
}

function exprToVelaBinding(node) {
  return dropThis(exprSource(node));
}

function camelToKebab(s) {
  return s.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
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

function isCustomComponent(name) {
  if (_componentRegistry && _componentRegistry.has(name)) return true;
  return /^[A-Z]/.test(name) || name.includes('.') || name.includes(':');
}

// -----------------------------------------------------------------------------
// Attribute serialization
// -----------------------------------------------------------------------------

function serializeStringValue(value) {
  if (value === null) return 'true';
  if (t.isStringLiteral(value)) return value.value;
  if (t.isJSXExpressionContainer(value)) {
    const expr = value.expression;
    if (t.isStringLiteral(expr)) return expr.value;
    if (t.isNumericLiteral(expr)) return String(expr.value);
    if (t.isBooleanLiteral(expr)) return String(expr.value);
    if (t.isNullLiteral(expr)) return '';
    if (t.isIdentifier(expr, { name: 'undefined' })) return '';
    return `{{${exprToVelaBinding(expr)}}}`;
  }
  return '';
}

function serializeStyleObject(objExpr) {
  const parts = [];
  for (const prop of objExpr.properties) {
    if (t.isSpreadElement(prop)) {
      throw new Error('Spread `{...obj}` in style is not supported.');
    }
    if (!t.isObjectProperty(prop)) continue;
    const key = t.isIdentifier(prop.key) ? prop.key.name : prop.key.value;
    const valueNode = prop.value;
    let value;
    if (t.isStringLiteral(valueNode)) value = valueNode.value;
    else if (t.isNumericLiteral(valueNode)) value = String(valueNode.value);
    else if (t.isBooleanLiteral(valueNode)) value = String(valueNode.value);
    else if (
      t.isMemberExpression(valueNode) ||
      t.isIdentifier(valueNode) ||
      t.isCallExpression(valueNode)
    ) {
      value = `{{${exprToVelaBinding(valueNode)}}}`;
    } else {
      throw new Error(`Unsupported style value: ${exprSource(valueNode)}`);
    }
    parts.push(`${camelToKebab(key)}: ${value}`);
  }
  const joined = parts.join('; ');
  return joined ? joined + ';' : '';
}

function serializeEventHandler(name, value, warnings) {
  const velaAttr = `@${EVENT_MAP[name]}`;
  if (!value) {
    throw new Error(`Event handler ${name} must have a value.`);
  }
  if (t.isStringLiteral(value)) {
    return `${velaAttr}="${escapeXml(value.value)}"`;
  }
  if (!t.isJSXExpressionContainer(value)) {
    throw new Error(`Event handler ${name} has invalid value.`);
  }
  const expr = value.expression;
  if (t.isMemberExpression(expr) && t.isThisExpression(expr.object)) {
    return `${velaAttr}="${expr.property.name}"`;
  }
  if (t.isIdentifier(expr)) {
    return `${velaAttr}="${expr.name}"`;
  }
  if (t.isArrowFunctionExpression(expr) || t.isFunctionExpression(expr)) {
    const body = expr.body;
    if (t.isCallExpression(body) && t.isMemberExpression(body.callee) && t.isThisExpression(body.callee.object)) {
      const methodName = body.callee.property.name;
      const args = body.arguments.map((a) => exprToVelaBinding(a)).join(', ');
      return `${velaAttr}="${methodName}(${args})"`;
    }
    if (t.isCallExpression(body) && t.isIdentifier(body.callee)) {
      const methodName = body.callee.name;
      const args = body.arguments.map((a) => exprToVelaBinding(a)).join(', ');
      return `${velaAttr}="${methodName}(${args})"`;
    }
  }
  warnings.push(
    `Event handler ${name} has complex expression. Vela's @event uses a method name. Falling back to: ${exprToVelaBinding(expr)}`,
  );
  return `${velaAttr}="${exprToVelaBinding(expr)}"`;
}

function serializeAttribute(attr, warnings, hasIdAttr = false) {
  if (t.isJSXSpreadAttribute(attr)) {
    throw new Error('Spread `{...obj}` is not supported in Kovo.');
  }
  if (!t.isJSXAttribute(attr)) return null;
  const name = attr.name.name;
  const value = attr.value;

  if (EVENT_MAP[name]) return serializeEventHandler(name, value, warnings);

  if (name === 'ref') {
    if (hasIdAttr) return null;
    let refId = '';
    if (t.isJSXExpressionContainer(value)) {
      refId = exprToVelaBinding(value.expression);
    } else if (t.isStringLiteral(value)) {
      refId = value.value;
    }
    if (refId) {
      return `id="${refId}"`;
    }
    return null;
  }

  if (name === 'className') {
    return `class="${serializeStringValue(value)}"`;
  }

  if (name === 'is') {
    if (t.isJSXExpressionContainer(value)) {
      return `is="{{${exprToVelaBinding(value.expression)}}}"`;
    }
    if (t.isStringLiteral(value)) {
      return `is="${value.value}"`;
    }
  }

  if (name === 'style') {
    if (
      t.isJSXExpressionContainer(value) &&
      t.isObjectExpression(value.expression)
    ) {
      return `style="${serializeStyleObject(value.expression)}"`;
    }
    return `style="${serializeStringValue(value)}"`;
  }

  if (value === null) {
    return `${camelToKebab(name)}="true"`;
  }
  if (t.isStringLiteral(value)) {
    return `${camelToKebab(name)}="${escapeXml(value.value)}"`;
  }
  if (t.isJSXExpressionContainer(value)) {
    const expr = value.expression;
    if (t.isBooleanLiteral(expr)) {
      return expr.value ? `${camelToKebab(name)}="true"` : null;
    }
    if (t.isNullLiteral(expr) || t.isIdentifier(expr, { name: 'undefined' })) {
      return null;
    }
    const velaVal = exprToVelaBinding(expr);
    const safeVal = velaVal.replace(/"/g, "'");
    return `${camelToKebab(name)}="{{${safeVal}}}"`;
  }
  return null;
}

// -----------------------------------------------------------------------------
// JSX serialization
// -----------------------------------------------------------------------------

function serializeJSXElement(node, warnings, opts = {}) {
  const name = getElementName(node);
  if (isCustomComponent(name)) {
    return serializeCustomComponent(node, name, warnings, opts);
  }

  const hasDirective = opts.ifExpr || opts.elifExpr || opts.elseExpr;
  const hasIdAttr = node.openingElement.attributes.some(
    (a) => t.isJSXAttribute(a) && a.name.name === 'id',
  );
  const attrs = [];
  for (const attr of node.openingElement.attributes) {
    if (t.isJSXAttribute(attr)) {
      const aname = t.isJSXIdentifier(attr.name) ? attr.name.name : '';
      if (hasDirective && (aname === 'if' || aname === 'elif' || aname === 'else')) {
        continue;
      }
    }
    const s = serializeAttribute(attr, warnings, hasIdAttr);
    if (s) attrs.push(s);
  }
  if (opts.ifExpr) attrs.push(`if="{{${opts.ifExpr}}}"`);
  if (opts.elifExpr) attrs.push(`elif="{{${opts.elifExpr}}}"`);
  if (opts.elseExpr) attrs.push('else');
  if (opts.forExpr) attrs.push(`for="{{${opts.forExpr.item} in ${opts.forExpr.array}}}"`);

  const attrStr = attrs.length ? ' ' + attrs.join(' ') : '';
  const children = node.children;
  if (children.length === 0) {
    return `<${name}${attrStr}/>`;
  }

  const innerParts = [];
  for (const child of children) {
    const s = serializeJSXChild(child, warnings, name);
    if (s != null && s !== '') innerParts.push(s);
  }

  if (innerParts.length === 0) {
    return `<${name}${attrStr}/>`;
  }
  const joined = innerParts.join('');
  if (!joined.includes('\n')) {
    return `<${name}${attrStr}>${joined}</${name}>`;
  }
  return (
    `<${name}${attrStr}>\n` +
    innerParts.map((p) => indent(p, 2)).join('\n') +
    `\n</${name}>`
  );
}

function indent(s, spaces) {
  const pad = ' '.repeat(spaces);
  return s
    .split('\n')
    .map((l) => (l.trim() ? pad + l : l))
    .join('\n');
}

function serializeJSXFragment(fragment, warnings) {
  warnings.push(
    'Fragment <> detected — wrapping in <div>. Vela requires a single root in <template>.',
  );
  const inner = fragment.children
    .map((c) => serializeJSXChild(c, warnings, 'div'))
    .filter((s) => s != null && s !== '')
    .join('\n');
  if (!inner) return '<div></div>';
  return `<div>\n${indent(inner, 2)}\n</div>`;
}

function serializeJSXChild(child, warnings, parentTag) {
  if (t.isJSXText(child)) {
    const text = child.value.replace(/\s+/g, ' ');
    if (!text.trim()) return null;
    if (CONTAINER_LIKE.has(parentTag)) {
      warnings.push(
        `Plain text "${text}" inside <${parentTag}> is auto-wrapped in <text>. Vela requires <text> for textual content.`,
      );
      return `<text>${escapeXml(text)}</text>`;
    }
    return escapeXml(text);
  }
  if (t.isJSXElement(child)) return serializeJSXElement(child, warnings);
  if (t.isJSXFragment(child)) return serializeJSXFragment(child, warnings);
  if (t.isJSXExpressionContainer(child)) {
    return serializeJSXExpression(child.expression, warnings, parentTag);
  }
  return null;
}

function serializeJSXExpression(expr, warnings, parentTag) {
  if (t.isBooleanLiteral(expr)) return null;
  if (t.isNullLiteral(expr)) return null;
  if (t.isIdentifier(expr, { name: 'undefined' })) return null;

  if (t.isLogicalExpression(expr) && expr.operator === '&&') {
    return serializeConditional(expr, warnings);
  }
  if (t.isConditionalExpression(expr)) {
    const isConsequentJSX = t.isJSXElement(expr.consequent) || t.isJSXFragment(expr.consequent);
    const isAlternateJSX = t.isJSXElement(expr.alternate) || t.isJSXFragment(expr.alternate);
    if (!isConsequentJSX && !isAlternateJSX) {
      const binding = `{{${exprToVelaBinding(expr)}}}`;
      if (TEXT_LIKE.has(parentTag)) return binding;
      return `<text>${binding}</text>`;
    }
    return serializeTernary(expr, warnings);
  }
  if (t.isCallExpression(expr)) {
    const callee = expr.callee;
    if (
      t.isMemberExpression(callee) &&
      t.isIdentifier(callee.property, { name: 'map' })
    ) {
      return serializeMap(callee, expr.arguments, warnings);
    }
  }

  // String / Number literal children
  if (t.isStringLiteral(expr)) {
    if (TEXT_LIKE.has(parentTag)) return escapeXml(expr.value);
    return `<text>${escapeXml(expr.value)}</text>`;
  }
  if (t.isNumericLiteral(expr)) {
    if (TEXT_LIKE.has(parentTag)) return String(expr.value);
    return `<text>${String(expr.value)}</text>`;
  }

  // Identifier / MemberExpression / CallExpression: bind via {{...}}
  if (
    t.isIdentifier(expr) ||
    t.isMemberExpression(expr) ||
    t.isCallExpression(expr) ||
    t.isBinaryExpression(expr)
  ) {
    const binding = `{{${exprToVelaBinding(expr)}}}`;
    if (TEXT_LIKE.has(parentTag)) return binding;
    return `<text>${binding}</text>`;
  }

  throw new Error(`Unsupported JSX expression: ${exprSource(expr)}`);
}

function serializeConditional(logical, warnings) {
  const cond = exprToVelaBinding(logical.left);
  const right = logical.right;
  if (t.isJSXElement(right)) {
    return serializeJSXElement(right, warnings, { ifExpr: cond });
  }
  if (t.isJSXFragment(right)) {
    warnings.push(
      `\`cond && <></>\` detected — wrapping fragment in <div> with \`if="{{${cond}}}\`\`.`,
    );
    const inner = right.children
      .map((c) => serializeJSXChild(c, warnings, 'div'))
      .filter((s) => s != null && s !== '');
    const innerXml = inner.length
      ? `<div if="{{${cond}}}">\n` +
        inner.map((p) => indent(p, 2)).join('\n') +
        `\n</div>`
      : `<div if="{{${cond}}}" />`;
    return innerXml;
  }
  if (t.isParenthesizedExpression(right)) {
    return serializeConditional(
      { left: logical.left, right: right.expression, operator: '&&' },
      warnings,
    );
  }
  if (t.isConditionalExpression(right)) {
    const outerCond = exprToVelaBinding(logical.left);
    return serializeTernaryWithPrefix(outerCond, right, warnings);
  }
  throw new Error(
    `Right side of \`&&\` must be a single JSX element. Got: ${exprSource(right)}`,
  );
}

function serializeTernaryElement(element, warnings, opts) {
  if (t.isJSXFragment(element)) {
    const inner = element.children
      .map(c => serializeJSXChild(c, warnings, 'div'))
      .filter(s => s != null && s !== '')
      .join('\n');
    const attrStr = opts.ifExpr ? ` if="{{${opts.ifExpr}}}"` :
      opts.elifExpr ? ` elif="{{${opts.elifExpr}}}"` :
      opts.elseExpr ? ' else' : '';
    if (!inner) return `<div${attrStr}/>`;
    return `<div${attrStr}>\n${indent(inner, 2)}\n</div>`;
  }
  return serializeJSXElement(element, warnings, opts);
}

function flattenTernary(ternary) {
  const pairs = [];
  let current = ternary;
  while (t.isConditionalExpression(current)) {
    let elem = current.consequent;
    while (t.isParenthesizedExpression(elem)) elem = elem.expression;
    if (t.isLogicalExpression(elem) && elem.operator === '&&' && t.isJSXElement(elem.right)) {
      const combined = t.logicalExpression('&&', current.test, elem.left);
      pairs.push({ cond: combined, element: elem.right });
    } else if (t.isJSXElement(elem) || t.isJSXFragment(elem)) {
      pairs.push({ cond: current.test, element: elem });
    } else {
      throw new Error(`Ternary branch must be a JSX element. Got: ${exprSource(elem)}`);
    }
    current = current.alternate;
  }
  if (t.isJSXElement(current)) {
    pairs.push({ cond: null, element: current });
  } else if (t.isJSXFragment(current)) {
    pairs.push({ cond: null, element: current });
  } else if (t.isNullLiteral(current) || t.isIdentifier(current, { name: 'undefined' })) {
    pairs.push({ cond: null, element: null });
  } else {
    throw new Error('Last branch of ternary chain must be a JSX element.');
  }
  return pairs;
}

function serializeTernaryWithPrefix(prefix, ternary, warnings) {
  const pairs = flattenTernary(ternary);
  if (pairs.length < 2) {
    throw new Error('Ternary must have at least 2 branches.');
  }
  const results = [];
  for (let i = 0; i < pairs.length; i++) {
    const { cond, element } = pairs[i];
    if (!element) continue;
    if (i === 0) {
      const condStr = `${prefix} && ${exprToVelaBinding(cond)}`;
      results.push(serializeTernaryElement(element, warnings, { ifExpr: condStr }));
    } else if (i < pairs.length - 1) {
      const condStr = `${prefix} && ${exprToVelaBinding(cond)}`;
      results.push(serializeTernaryElement(element, warnings, { elifExpr: condStr }));
    } else {
      const prevCond = pairs[i - 1] && pairs[i - 1].cond;
      if (prevCond) {
        const negated = `${prefix} && !(${exprToVelaBinding(prevCond)})`;
        results.push(serializeTernaryElement(element, warnings, { ifExpr: negated }));
      } else {
        results.push(serializeTernaryElement(element, warnings, { ifExpr: prefix }));
      }
    }
  }
  return results.join('\n');
}

function serializeTernary(ternary, warnings) {
  const pairs = flattenTernary(ternary);
  if (pairs.length < 2) {
    throw new Error('Ternary must have at least 2 branches.');
  }
  const results = [];
  for (let i = 0; i < pairs.length; i++) {
    const { cond, element } = pairs[i];
    if (!element) continue;
    if (i === 0) {
      const condStr = exprToVelaBinding(cond);
      results.push(serializeTernaryElement(element, warnings, { ifExpr: condStr }));
    } else if (i < pairs.length - 1) {
      const condStr = exprToVelaBinding(cond);
      results.push(serializeTernaryElement(element, warnings, { elifExpr: condStr }));
    } else {
      results.push(serializeTernaryElement(element, warnings, { elseExpr: true }));
    }
  }
  return results.join('\n');
}

function serializeMap(memberExpr, args, warnings) {
  const arrayExpr = memberExpr.object;
  const arraySrc = exprToVelaBinding(arrayExpr);

  if (args.length === 0) {
    throw new Error('map() requires a callback.');
  }
  const cb = args[0];
  if (!t.isArrowFunctionExpression(cb) && !t.isFunctionExpression(cb)) {
    throw new Error('map() callback must be a function (arrow or expression).');
  }
  if (cb.params.length === 0) {
    throw new Error('map() callback must have at least one parameter (item).');
  }
  const itemParam = cb.params[0];
  if (!t.isIdentifier(itemParam)) {
    throw new Error('map() callback parameter must be a simple identifier.');
  }
  let itemName = itemParam.name;
  if (cb.params.length >= 2) {
    const idxParam = cb.params[1];
    if (t.isIdentifier(idxParam)) {
      itemName = `(${idxParam.name}, ${itemName})`;
    }
  }
  const body = cb.body;
  if (!t.isJSXElement(body)) {
    throw new Error('map() callback body must be a single JSX element.');
  }
  return serializeJSXElement(body, warnings, {
    forExpr: { item: itemName, array: arraySrc },
  });
}

let _templateImports = [];

function serializeCustomComponent(node, name, warnings, opts) {
  const importInfo = _componentRegistry ? _componentRegistry.get(name) : null;
  const importSrc = importInfo ? importInfo.src : null;
  let kebabName = name.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()).replace(/^-/, '');

  if (importSrc && !_templateImports.some(imp => imp.name === kebabName)) {
    _templateImports.push({ name: kebabName, src: importSrc });
  }

  const COMPONENT_EVENT_RE = /^on[A-Z]/;
  const attrs = [];
  for (const attr of node.openingElement.attributes) {
    if (!t.isJSXAttribute(attr)) continue;
    const attrName = t.isJSXIdentifier(attr.name) ? attr.name.name : '';
    if (!attrName) continue;

    if (COMPONENT_EVENT_RE.test(attrName)) {
      const eventName = attrName.replace(/^on/, '');
      const eventKebab = eventName.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()).replace(/^-/, '');
      const value = attr.value;
      let handler = '';
      if (t.isJSXExpressionContainer(value)) {
        handler = exprToVelaBinding(value.expression);
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
      const velaVal = exprToVelaBinding(attr.value.expression);
      const safeVal = velaVal.replace(/"/g, "'");
      attrs.push(`${camelToKebab(attrName)}="{{${safeVal}}}"`);
      continue;
    }
    warnings.push(`Custom component attr ${attrName} dropped (unsupported value type).`);
  }

  if (opts.ifExpr) attrs.push(`if="{{${opts.ifExpr}}}"`);
  if (opts.elifExpr) attrs.push(`elif="{{${opts.elifExpr}}}"`);
  if (opts.elseExpr) attrs.push('else');
  if (opts.forExpr) attrs.push(`for="{{${opts.forExpr.item} in ${opts.forExpr.array}}}"`);

  const children = node.children;
  const innerParts = [];
  for (const child of children) {
    const s = serializeJSXChild(child, warnings, kebabName);
    if (s != null && s !== '') innerParts.push(s);
  }

  const attrStr = attrs.length ? ' ' + attrs.join(' ') : '';
  if (innerParts.length === 0) return `<${kebabName}${attrStr}/>`;
  return `<${kebabName}${attrStr}>${innerParts.join('')}</${kebabName}>`;
}

// -----------------------------------------------------------------------------
// Top-level: parse a file, build the .ux content
// -----------------------------------------------------------------------------

function getLineNumber(node) {
  return (node && node.loc && node.loc.start && node.loc.start.line) || 0;
}

function extractASTLineMap(ast) {
  const map = {};
  function walk(node, topLevel) {
    if (!node || typeof node !== 'object') return;
    if (node.type && node.loc) {
      const l = node.loc.start.line;
      if (!map[l]) {
        map[l] = { type: node.type, endLine: node.loc.end.line };
      }
    }
    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'start' || key === 'end') continue;
      const val = node[key];
      if (Array.isArray(val)) {
        for (const item of val) walk(item, false);
      } else {
        walk(val, false);
      }
    }
  }
  walk(ast, true);
  return map;
}

function formatMethodFromFn(name, fnNode, setterToState, dataObj, propsObj, refsSet = new Set()) {
  const stateKeys = new Set([...Object.keys(dataObj), ...Object.keys(propsObj)]);
  const params = (fnNode.params || []).map((p) => generator(p).code).join(', ');

  const bodyAst = t.cloneNode(fnNode.body, true);

  function replaceSettersAndRefs(node) {
    if (!node || typeof node !== 'object') return;

    if (t.isMemberExpression(node)) {
      if (t.isIdentifier(node.object) && refsSet.has(node.object.name) && t.isIdentifier(node.property, { name: 'current' })) {
        const refName = node.object.name;
        const elCall = t.callExpression(
          t.memberExpression(t.thisExpression(), t.identifier('$element')),
          [t.stringLiteral(refName)]
        );
        delete node.object;
        delete node.property;
        delete node.computed;
        Object.assign(node, elCall);
      }
    }

    if (t.isExpressionStatement(node) && t.isCallExpression(node.expression)) {
      const callee = node.expression.callee;
      if (t.isIdentifier(callee) && setterToState.has(callee.name)) {
        const stateVar = setterToState.get(callee.name);
        const arg = node.expression.arguments[0];
        let rhs = 'null';
        if (arg) {
          if (t.isArrowFunctionExpression(arg) || t.isFunctionExpression(arg)) {
            const pName = arg.params[0] ? arg.params[0].name : 'prev';
            let eCode = generator(arg.body).code;
            eCode = eCode.replace(new RegExp(`\\b${pName}\\b`, 'g'), `this.${stateVar}`);
            rhs = eCode;
          } else {
            rhs = generator(arg).code;
          }
        }
        for (const k of stateKeys) {
          rhs = rhs.replace(new RegExp(`(?<!\\.|this\\.)\\b${k}\\b`, 'g'), `this.${k}`);
        }
        node.expression = t.assignmentExpression('=', t.memberExpression(t.thisExpression(), t.identifier(stateVar)), t.identifier(rhs));
      }
    }
    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'start' || key === 'end') continue;
      const val = node[key];
      if (Array.isArray(val)) {
        for (const item of val) replaceSettersAndRefs(item);
      } else {
        replaceSettersAndRefs(val);
      }
    }
  }
  replaceSettersAndRefs(bodyAst);

  let bodyCode = generator(bodyAst).code;
  for (const k of stateKeys) {
    bodyCode = bodyCode.replace(new RegExp(`(?<!\\.|this\\.)\\b${k}\\b`, 'g'), `this.${k}`);
  }
  return `${name}(${params}) ${bodyCode}`;
}

function findHookInAst(ast, name) {
  let found = null;
  traverse(ast, {
    FunctionDeclaration(path) {
      if (path.node.id && path.node.id.name === name) {
        found = path.node;
      }
    },
    VariableDeclarator(path) {
      if (
        t.isIdentifier(path.node.id) &&
        path.node.id.name === name &&
        (t.isArrowFunctionExpression(path.node.init) || t.isFunctionExpression(path.node.init))
      ) {
        found = path.node.init;
      }
    },
  });
  return found;
}

function inlineHookIntoComponent(hookFn, callDecl, dataObj, setterToState, methodsObj, lifecyclesObj, propsObj, refsSet = new Set()) {
  const paramMap = new Map();
  const args = callDecl.init ? callDecl.init.arguments : [];
  (hookFn.params || []).forEach((p, idx) => {
    const argVal = args[idx] ? generator(args[idx]).code : (t.isAssignmentPattern(p) ? generator(p.right).code : 'null');
    const pName = t.isIdentifier(p) ? p.name : (t.isAssignmentPattern(p) && t.isIdentifier(p.left) ? p.left.name : null);
    if (pName) paramMap.set(pName, argVal);
  });

  const body = hookFn.body;
  const stmts = t.isBlockStatement(body) ? body.body : [t.returnStatement(body)];

  for (const stmt of stmts) {
    if (t.isVariableDeclaration(stmt)) {
      for (const decl of stmt.declarations) {
        if (t.isCallExpression(decl.init)) {
          const callee = decl.init.callee;
          const name = t.isIdentifier(callee) ? callee.name : '';
          if (name === 'useState' && t.isArrayPattern(decl.id)) {
            const stateName = decl.id.elements[0] ? decl.id.elements[0].name : null;
            const setterName = decl.id.elements[1] ? decl.id.elements[1].name : null;
            let initVal = decl.init.arguments[0] ? generator(decl.init.arguments[0]).code : 'null';
            if (paramMap.has(initVal)) initVal = paramMap.get(initVal);
            if (stateName) {
              dataObj[stateName] = initVal;
              if (setterName) setterToState.set(setterName, stateName);
            }
          }
          if (name === 'useRef' && t.isIdentifier(decl.id)) {
            refsSet.add(decl.id.name);
          }
        }
        if (t.isIdentifier(decl.id) && (t.isArrowFunctionExpression(decl.init) || t.isFunctionExpression(decl.init))) {
          const funcName = decl.id.name;
          methodsObj[funcName] = formatMethodFromFn(funcName, decl.init, setterToState, dataObj, propsObj, refsSet);
        }
      }
    }
    if (t.isFunctionDeclaration(stmt)) {
      const funcName = stmt.id.name;
      methodsObj[funcName] = formatMethodFromFn(funcName, stmt, setterToState, dataObj, propsObj, refsSet);
    }
    if (t.isExpressionStatement(stmt) && t.isCallExpression(stmt.expression)) {
      const callee = stmt.expression.callee;
      const name = t.isIdentifier(callee) ? callee.name : '';
      if (name === 'useEffect') {
        const effectFn = stmt.expression.arguments[0];
        if (t.isArrowFunctionExpression(effectFn) || t.isFunctionExpression(effectFn)) {
          lifecyclesObj.onInit = generator(effectFn.body).code;
        }
      }
    }
  }
}

function processFunctionalComponent(fnNode, warnings, ast) {
  let templateXml = null;
  let styleCss = '';
  const propsObj = {};
  const dataObj = {};
  const methodsObj = {};
  const lifecyclesObj = {};
  const setterToState = new Map();
  const refsSet = new Set();

  if (fnNode.params && fnNode.params.length > 0) {
    const p0 = fnNode.params[0];
    if (t.isObjectPattern(p0)) {
      for (const prop of p0.properties) {
        if (t.isObjectProperty(prop)) {
          const name = t.isIdentifier(prop.key) ? prop.key.name : prop.key.value;
          if (t.isAssignmentPattern(prop.value)) {
            propsObj[name] = { default: generator(prop.value.right).code };
          } else {
            propsObj[name] = { default: "''" };
          }
        }
      }
    }
  }

  const body = fnNode.body;
  const stmts = t.isBlockStatement(body) ? body.body : [t.returnStatement(body)];

  for (const stmt of stmts) {
    if (t.isVariableDeclaration(stmt)) {
      for (const decl of stmt.declarations) {
        if (t.isCallExpression(decl.init)) {
          const callee = decl.init.callee;
          const name = t.isIdentifier(callee) ? callee.name : (t.isMemberExpression(callee) ? callee.property.name : '');
          if (name === 'useState' && t.isArrayPattern(decl.id)) {
            const stateName = decl.id.elements[0] ? decl.id.elements[0].name : null;
            const setterName = decl.id.elements[1] ? decl.id.elements[1].name : null;
            const initArg = decl.init.arguments[0];
            const initVal = initArg ? generator(initArg).code : 'null';
            if (stateName) {
              dataObj[stateName] = initVal;
              if (setterName) setterToState.set(setterName, stateName);
            }
            continue;
          }
          if (name === 'useRef' && t.isIdentifier(decl.id)) {
            refsSet.add(decl.id.name);
            continue;
          }
          if (/^use[A-Z]/.test(name) && name !== 'useState' && name !== 'useEffect' && name !== 'useRef' && ast) {
            const hookFn = findHookInAst(ast, name);
            if (hookFn) {
              inlineHookIntoComponent(hookFn, decl, dataObj, setterToState, methodsObj, lifecyclesObj, propsObj, refsSet);
            }
            continue;
          }
        }
        if (t.isIdentifier(decl.id) && (t.isArrowFunctionExpression(decl.init) || t.isFunctionExpression(decl.init))) {
          const funcName = decl.id.name;
          methodsObj[funcName] = formatMethodFromFn(funcName, decl.init, setterToState, dataObj, propsObj, refsSet);
        } else if (t.isIdentifier(decl.id) && decl.id.name === 'style') {
          if (t.isStringLiteral(decl.init)) styleCss = decl.init.value;
          else if (t.isTemplateLiteral(decl.init)) styleCss = decl.init.quasis.map((q) => q.value.cooked).join('');
        } else if (t.isIdentifier(decl.id) && decl.init) {
          const varName = decl.id.name;
          if (!dataObj[varName] && !methodsObj[varName] && !refsSet.has(varName)) {
            dataObj[varName] = generator(decl.init).code;
          }
        }
      }
    }

    if (t.isFunctionDeclaration(stmt)) {
      const funcName = stmt.id.name;
      methodsObj[funcName] = formatMethodFromFn(funcName, stmt, setterToState, dataObj, propsObj, refsSet);
    }

    if (t.isExpressionStatement(stmt) && t.isCallExpression(stmt.expression)) {
      const callee = stmt.expression.callee;
      const name = t.isIdentifier(callee) ? callee.name : (t.isMemberExpression(callee) ? callee.property.name : '');
      if (name === 'useEffect') {
        const effectFn = stmt.expression.arguments[0];
        if (t.isArrowFunctionExpression(effectFn) || t.isFunctionExpression(effectFn)) {
          const bodyCode = generator(effectFn.body).code;
          lifecyclesObj.onInit = bodyCode;
        }
      } else if (/^use[A-Z]/.test(name) && name !== 'useState' && name !== 'useRef' && ast) {
        const hookFn = findHookInAst(ast, name);
        if (hookFn) {
          inlineHookIntoComponent(hookFn, { init: stmt.expression }, dataObj, setterToState, methodsObj, lifecyclesObj, propsObj, refsSet);
        }
      }
    }

    if (t.isReturnStatement(stmt)) {
      const arg = stmt.argument;
      if (t.isJSXElement(arg)) templateXml = serializeJSXElement(arg, warnings);
      else if (t.isJSXFragment(arg)) templateXml = serializeJSXFragment(arg, warnings);
    }
  }

  const scriptParts = [];
  if (Object.keys(propsObj).length > 0) {
    const propsStr = Object.entries(propsObj)
      .map(([k, v]) => `${k}: { default: ${v.default} }`)
      .join(', ');
    scriptParts.push(`  props: { ${propsStr} },`);
  }
  if (Object.keys(dataObj).length > 0) {
    const dataStr = Object.entries(dataObj)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
    scriptParts.push(`  data: { ${dataStr} },`);
  }
  if (Object.keys(methodsObj).length > 0) {
    const mStrs = Object.values(methodsObj).map((m) => `  ${m},`);
    scriptParts.push(mStrs.join('\n'));
  }
  for (const [lcName, lcBody] of Object.entries(lifecyclesObj)) {
    scriptParts.push(`  ${lcName}() ${lcBody},`);
  }

  const scriptPropLines = `export default {\n${scriptParts.join('\n')}\n}`;
  return { templateXml, styleCss, scriptPropLines };
}

function buildUxContent(source, filename) {
  _templateImports = [];

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
        `[vela-ux] Error de sintaxis en ${filename}:${loc.line}:${loc.column}\n` +
        `  ${ctxLine}\n` +
        `  ${'~'.repeat(Math.max(1, loc.column - 1))}^\n` +
        `  ${e.message}`
      );
    }
    throw new Error(`[vela-ux] Error al parsear ${filename}: ${e.message}`);
  }

  const astLineMap = extractASTLineMap(ast);

  const warnings = [];
  const compImports = new Map();
  const jsImportLines = [];
  const helperLines = [];
  let templateXml = null;
  let styleCss = '';
  let scriptPropLines = null;
  let computedPropLines = null;
  let hasComputed = false;
  let templateSourceLine = 0;
  let styleSourceLine = 0;
  let exportDefaultLine = 0;

  traverse(ast, {
    ImportDeclaration(path) {
      const src = path.node.source.value;
      if (src === 'kovo-ux' || src === 'kovo' || src === 'vela-jsx' || src === 'react') {
        return;
      }
      const isRelativeOrComp = /^(\.|\.\.\/)/.test(src) || /\.(ux|tsx?)$/.test(src);
      if (isRelativeOrComp) {
        for (const spec of path.node.specifiers) {
          if (t.isImportDefaultSpecifier(spec) && /^[A-Z]/.test(spec.local.name)) {
            compImports.set(spec.local.name, {
              localName: spec.local.name,
              src: src,
            });
          }
        }
      }
      jsImportLines.push(generator(path.node).code);
      _componentRegistry = compImports;
    },
    ExportNamedDeclaration(path) {
      const decl = path.node.declaration;
      if (t.isVariableDeclaration(decl)) {
        for (const vdecl of decl.declarations) {
          if (t.isIdentifier(vdecl.id) && vdecl.id.name === 'style') {
            if (t.isStringLiteral(vdecl.init)) styleCss = vdecl.init.value;
            else if (t.isTemplateLiteral(vdecl.init)) styleCss = vdecl.init.quasis.map((q) => q.value.cooked).join('');
          }
        }
      }
    },
    VariableDeclaration(path) {
      if (path.parentPath && path.parentPath.isProgram()) {
        for (const vdecl of path.node.declarations) {
          if (t.isIdentifier(vdecl.id) && vdecl.id.name === 'style') {
            if (t.isStringLiteral(vdecl.init)) styleCss = vdecl.init.value;
            else if (t.isTemplateLiteral(vdecl.init)) styleCss = vdecl.init.quasis.map((q) => q.value.cooked).join('');
          }
        }
      }
    },
    ExportDefaultDeclaration(path) {
      _componentRegistry = compImports;
      exportDefaultLine = getLineNumber(path.node);
      const decl = path.node.declaration;

      if (t.isFunctionDeclaration(decl) || t.isFunctionExpression(decl) || t.isArrowFunctionExpression(decl)) {
        const res = processFunctionalComponent(decl, warnings, ast);
        if (res.templateXml) templateXml = res.templateXml;
        if (res.styleCss) styleCss = res.styleCss;
        scriptPropLines = res.scriptPropLines;
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
        const key = t.isIdentifier(prop.key) ? prop.key.name : prop.key.value;
        propByName[key] = prop;
      }

      if (propByName.template) {
        const tv = propByName.template.value;
        templateSourceLine = getLineNumber(tv);
        if (t.isJSXElement(tv)) templateXml = serializeJSXElement(tv, warnings);
        else if (t.isJSXFragment(tv)) templateXml = serializeJSXFragment(tv, warnings);
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
        if (t.isStringLiteral(sv)) styleCss = sv.value;
        else if (t.isTemplateLiteral(sv)) {
          styleCss = sv.quasis.map((q) => q.value.cooked).join('');
        } else {
          const got = exprSource(sv).substring(0, 40);
          throw new Error(
            `[vela-ux] style must be a string or template literal at ${filename}, got: ${got}`
          );
        }
      }

      if (propByName.computed) {
        hasComputed = true;
        const cv = propByName.computed;
        if (t.isObjectProperty(cv)) {
          const ce = cv.value;
          if (t.isObjectExpression(ce)) {
            for (const prop of ce.properties) {
              if (t.isObjectMethod(prop) || t.isObjectProperty(prop)) {
                const k = t.isIdentifier(prop.key) ? prop.key.name : prop.key.value;
                if (!t.isFunctionExpression(prop.value) && !t.isObjectMethod(prop) && !t.isArrowFunctionExpression(prop.value)) {
                  warnings.push(
                    `Computed property "${k}" should be a function (${filename})`
                  );
                }
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

  traverse(ast, {
    FunctionDeclaration(path) {
      if (path.parent.type === 'Program') {
        const fnName = path.node.id ? path.node.id.name : '';
        if (/^use[A-Z]/.test(fnName)) return;
        if (/^[A-Z]/.test(fnName)) return;
        helperLines.push(generator(path.node).code);
      }
    },
    VariableDeclaration(path) {
      if (path.parent.type === 'Program') {
        const isStyle = path.node.declarations.some(
          (d) => t.isIdentifier(d.id) && d.id.name === 'style'
        );
        if (isStyle) return;
        helperLines.push(generator(path.node).code);
      }
    },
  });

  if (!templateXml && !scriptPropLines) {
    throw new Error(`[vela-ux] No \`template\` property found in export default of ${filename}.`);
  }

  const parts = [];
  if (templateXml) {
    for (const imp of _templateImports) {
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
    parts.push('<style>');
    parts.push(styleCss);
    parts.push('</style>');
  }
  parts.push('');
  parts.push('<script>');
  if (jsImportLines.length) parts.push(jsImportLines.join('\n'));
  if (helperLines.length) {
    if (jsImportLines.length) parts.push('');
    parts.push(helperLines.join('\n\n'));
  }
  if (jsImportLines.length || helperLines.length) parts.push('');
  if (scriptPropLines) parts.push(scriptPropLines);
  parts.push('</script>');

  const content = parts.join('\n');
  const contentLines = content.split('\n');
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
      if (parts[i] === h.startTag) {
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
        exit(path, state) {
          const filename = state.filename || '<unknown>';
          if (/\.ux$/i.test(filename) || filename.includes('node_modules') || filename.includes('\\src\\') || filename.includes('/src/')) {
            return;
          }
          const source = state.file.code;
          const { content, warnings } = buildUxContent(source, filename);
          for (const w of warnings) {
            // eslint-disable-next-line no-console
            console.warn(`[vela-ux] ${filename}: ${w}`);
          }
          // Replace the program with a single string literal export so the
          // build script can read it and write the .ux file.
          const str = t.stringLiteral(content);
          path.replaceWith(
            t.program([
              t.expressionStatement(
                t.callExpression(t.identifier('__vela_write_ux__'), [
                  t.stringLiteral(filename),
                  str,
                ]),
              ),
            ]),
          );
        },
      },
    },
  };
};

module.exports.buildUxContent = buildUxContent;
