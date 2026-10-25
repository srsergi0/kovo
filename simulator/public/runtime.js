// Kovo simulator runtime: runs the JS that aiot-toolkit emits (build/**/*.js)
// in the browser. The toolkit compiles each .ux into a render function that
// calls `aiot.__ce__` (element), `__cf__` (for), `__ci__` (if), `__cb__`
// (block), `__cc__`/`__cdc__` (components); this file implements those
// primitives on the DOM and a Vue-like ViewModel on top of reactivity.js.

import { reactive, effect, computed, scope, untracked, queueJob } from './reactivity.js';
import { createSystemModules } from './system.js';

const log = (...a) => window.simLog && window.simLog('log', ...a);
const warn = (...a) => window.simLog && window.simLog('warn', ...a);

// ---------------------------------------------------------------------------
// Module loading
// ---------------------------------------------------------------------------

let loadSeq = 0;
async function loadBundle(url, globalObj) {
  const mod = await import(`${url}?v=${Date.now()}-${loadSeq++}`);
  const exportsObj = {};
  mod.default(globalObj, globalObj, globalObj, exportsObj, () => {});
  return exportsObj;
}

// ---------------------------------------------------------------------------
// ViewModel
// ---------------------------------------------------------------------------

const LIFECYCLE = new Set(['onInit', 'onReady', 'onShow', 'onHide', 'onDestroy', 'onBackPress', 'onRefresh', 'onConfigurationChanged']);

function createVM(def, { params = {}, app, page, emitTo } = {}) {
  let initial = typeof def.data === 'function' ? def.data() : def.data || {};
  initial = JSON.parse(JSON.stringify(initial || {}));
  // Router params reach `protected`/`public` data with the same name (strings).
  const descriptor = def._descriptor || {};
  for (const [k, v] of Object.entries(params)) {
    const access = descriptor[k] && descriptor[k].access;
    if (k in initial && access !== 'private') initial[k] = v;
  }
  const state = reactive(initial);
  const extras = {}; // non-reactive fields assigned at runtime (this.timer = ...)
  const computedMap = {};
  const methods = {};
  const watchers = [];
  const elements = new Map();
  const listeners = {};

  const vm = new Proxy({}, {
    get(_, k) {
      if (k in api) return api[k];
      if (typeof k === 'symbol') return undefined;
      if (Object.prototype.hasOwnProperty.call(computedMap, k)) return computedMap[k].value;
      if (Object.prototype.hasOwnProperty.call(methods, k)) return methods[k];
      if (k in state) return state[k];
      return extras[k];
    },
    set(_, k, v) {
      if (Object.prototype.hasOwnProperty.call(initial, k)) state[k] = v;
      else if (Object.prototype.hasOwnProperty.call(computedMap, k)) warn(`computed "${String(k)}" is read-only`);
      else extras[k] = v;
      return true;
    },
    has(_, k) {
      return k in state || k in computedMap || k in methods || k in extras || k in api;
    },
  });

  const api = {
    $app: app,
    $page: page,
    $valid: true,
    $watch(path, handler) {
      const getter = () => path.split('.').reduce((o, p) => (o == null ? o : o[p]), vm);
      let old = untracked(getter);
      const fn = typeof handler === 'function' ? handler : vm[handler];
      const e = effect(() => {
        const v = getter();
        if (Array.isArray(v)) v.length; // in-place push/unshift also notifies
        return v;
      }, {
        scheduler: () => queueJob(() => {
          const v = e.run();
          if (v !== old || Array.isArray(v)) {
            const prev = old;
            old = v;
            fn && fn.call(vm, v, prev);
          }
        }),
      });
      watchers.push(e);
    },
    $emit(evt, detail) {
      if (emitTo) emitTo(evt, detail);
    },
    $on(evt, fn) {
      (listeners[evt] = listeners[evt] || []).push(fn);
    },
    $off(evt) {
      delete listeners[evt];
    },
    $element(id) {
      const el = elements.get(id);
      return el ? elementApi(el) : undefined;
    },
    $canIUse() {
      return true;
    },
    $set(k, v) {
      state[k] = v;
    },
    $delete(k) {
      delete state[k];
    },
    __elements: elements,
    __stop() {
      watchers.forEach((w) => w.stop());
    },
  };

  for (const [k, fn] of Object.entries(def.computed || {})) {
    const getter = typeof fn === 'function' ? fn : fn.get;
    computedMap[k] = computed(() => getter.call(vm));
  }
  for (const [k, v] of Object.entries(def)) {
    if (typeof v === 'function' && k !== 'data' && k !== 'template') methods[k] = v.bind(vm);
  }
  return vm;
}

function elementApi(el) {
  return {
    focus: (o) => el.focus && el.focus(),
    scrollTo: (o = {}) => el.scrollTo({ left: o.left, top: o.top, behavior: o.behavior === 'smooth' ? 'smooth' : 'auto' }),
    scrollBy: (o = {}) => el.scrollBy({ left: o.left, top: o.top }),
    getBoundingClientRect: (o = {}) => {
      const r = el.getBoundingClientRect();
      const s = window.simScale || 1;
      const res = { left: r.left / s, top: r.top / s, width: r.width / s, height: r.height / s };
      if (o.success) o.success(res);
      return res;
    },
    animate: () => ({ play() {}, finish() {}, cancel() {}, pause() {} }),
    __el: el,
  };
}

// ---------------------------------------------------------------------------
// Render primitives
// ---------------------------------------------------------------------------

const TAGS = {
  div: 'div', text: 'div', span: 'span', a: 'a', image: 'img', input: 'input', stack: 'div',
  scroll: 'div', list: 'div', 'list-item': 'div', swiper: 'div', block: 'div', progress: 'div',
  slider: 'input', switch: 'input', picker: 'select', marquee: 'div', label: 'span',
};

function resolveSrc(src) {
  if (typeof src !== 'string') return src;
  if (/^(https?:|data:|blob:)/.test(src)) return src;
  return `/app/${src.replace(/^\/+/, '')}`;
}

function applyStyle(el, value) {
  if (typeof value === 'string') value = window.$translateStyle$ ? window.$translateStyle$(value) : {};
  for (const [k, v] of Object.entries(value || {})) {
    if (k === 'backgroundImage' && typeof v === 'string') el.style.backgroundImage = `url(${resolveSrc(v.replace(/^url\(|\)$/g, ''))})`;
    else el.style[k] = typeof v === 'number' ? `${v}px` : v;
  }
}

function setText(el, v) {
  el.textContent = v == null ? '' : String(v);
}

const EVENT_MAP = { click: 'click', touchstart: 'pointerdown', touchmove: 'pointermove', touchend: 'pointerup', touchcancel: 'pointercancel', scroll: 'scroll', change: 'change', focus: 'focus', blur: 'blur' };

function bindEvent(el, name, fn, tag) {
  if (name === 'longpress') {
    let t;
    el.addEventListener('pointerdown', () => (t = setTimeout(() => fn({ type: 'longpress', target: el }), 500)));
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((n) => el.addEventListener(n, () => clearTimeout(t)));
    return;
  }
  if (name === 'swipe') {
    let x0, y0;
    el.addEventListener('pointerdown', (e) => ((x0 = e.clientX), (y0 = e.clientY)));
    el.addEventListener('pointerup', (e) => {
      const dx = e.clientX - x0;
      const dy = e.clientY - y0;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 30) return;
      const direction = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
      fn({ type: 'swipe', direction, target: el });
    });
    return;
  }
  if (name === 'appear' || name === 'disappear') {
    queueMicrotask(() => name === 'appear' && fn({ type: name, target: el }));
    return;
  }
  const domName = EVENT_MAP[name] || name;
  el.addEventListener(domName, (e) => {
    const evt = { type: name, target: { id: el.id, attr: el.dataset }, timestamp: Date.now() };
    if (e.clientX !== undefined) {
      const r = el.getBoundingClientRect();
      const s = window.simScale || 1;
      evt.touches = [{ clientX: (e.clientX - r.left) / s, clientY: (e.clientY - r.top) / s }];
      evt.changedTouches = evt.touches;
    }
    if (name === 'change') {
      if (el.type === 'checkbox' || el.type === 'radio') evt.checked = el.checked;
      else evt.value = el.value;
      if (tag === 'switch') evt.checked = el.checked;
      if (tag === 'slider') evt.progress = Number(el.value);
    }
    if (name === 'scroll') {
      evt.scrollX = el.scrollLeft;
      evt.scrollY = el.scrollTop;
    }
    fn(evt);
  });
}

/** A DOM region delimited by two comments, re-rendered by structural directives. */
function region(name) {
  const start = document.createComment(`${name}`);
  const end = document.createComment(`/${name}`);
  const frag = document.createDocumentFragment();
  frag.append(start, end);
  let stop = null;
  return {
    frag,
    render(build) {
      if (stop) stop();
      const parent = end.parentNode;
      let n = start.nextSibling;
      while (n && n !== end) {
        const next = n.nextSibling;
        parent.removeChild(n);
        n = next;
      }
      const nodes = [];
      stop = scope(() => {
        const out = build();
        (Array.isArray(out) ? out : [out]).forEach((x) => x && nodes.push(x));
      });
      nodes.forEach((x) => parent.insertBefore(x, end));
    },
  };
}

function createAiot() {
  const value = (v) => (typeof v === 'function' ? v() : v);
  const bind = (v, apply) => {
    if (typeof v === 'function') effect(() => apply(v()));
    else apply(v);
  };

  const aiot = {
    __ce__(tag, opts, children) {
      const o = (opts && opts.__opts__) || {};
      const htmlTag = TAGS[tag] || 'div';
      const el = document.createElement(htmlTag);
      el.className = `vela-${tag}`;
      el.dataset.tag = tag;
      for (const [k, v] of Object.entries(o)) {
        switch (k) {
          case 'classList':
            bind(v, (cls) => {
              el.className = [`vela-${tag}`, ...(Array.isArray(cls) ? cls : String(cls || '').split(/\s+/))].filter(Boolean).join(' ');
            });
            break;
          case 'style':
            bind(v, (s) => {
              el.removeAttribute('style');
              applyStyle(el, s);
            });
            break;
          case 'value':
            if (tag === 'input' || tag === 'slider') bind(v, (x) => (el.value = x == null ? '' : x));
            else if (tag === 'progress') bind(v, (x) => el.style.setProperty('--p', `${Number(x) || 0}%`));
            else bind(v, (x) => setText(el, x));
            break;
          case 'events':
            for (const [name, fn] of Object.entries(v || {})) bindEvent(el, name, fn, tag);
            break;
          case 'id':
            bind(v, (id) => {
              el.id = id;
              if (opts.__vm__ && opts.__vm__.__elements) opts.__vm__.__elements.set(id, el);
            });
            break;
          case 'src':
            bind(v, (s) => (el.src = resolveSrc(s)));
            break;
          case 'type':
            bind(v, (t) => {
              if (tag === 'input') el.type = t === 'button' ? 'button' : t;
              el.dataset.type = t;
            });
            break;
          case 'show':
            bind(v, (s) => (el.style.display = s === false || s === 'false' ? 'none' : ''));
            break;
          case 'checked':
            bind(v, (c) => (el.checked = c === true || c === 'true'));
            break;
          case 'disabled':
            bind(v, (d) => (el.disabled = d === true || d === 'true'));
            break;
          case 'percent':
            bind(v, (x) => el.style.setProperty('--p', `${Number(x) || 0}%`));
            break;
          case 'static':
            break;
          default:
            bind(v, (x) => {
              if (x == null || x === false) el.removeAttribute(k);
              else el.setAttribute(k, x);
              el.dataset[k.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = x;
            });
        }
      }
      if (tag === 'switch') el.type = 'checkbox';
      if (tag === 'slider') el.type = 'range';
      if (tag === 'progress') el.append(Object.assign(document.createElement('i'), { className: 'vela-progress-fill' }));
      for (const c of children || []) if (c) el.append(c);
      return el;
    },
    __cdc__(tag, opts, children) {
      return aiot.__ce__(tag, opts, children);
    },
    __ci__(opts, renderFn) {
      const o = (opts && opts.__opts__) || {};
      const r = region('if');
      let last;
      effect(() => {
        const shown = !!value(o.shown);
        if (shown === last) return;
        last = shown;
        r.render(() => (shown ? renderFn(aiot) : []));
      }, { scheduler: undefined });
      return r.frag;
    },
    __cf__(opts, renderFn) {
      const o = (opts && opts.__opts__) || {};
      const r = region('for');
      effect(() => {
        const exp = value(o.exp) || {};
        let list = exp.__list__;
        if (typeof list === 'number') list = Array.from({ length: list }, (_, i) => i);
        if (list && !Array.isArray(list) && typeof list === 'object') list = Object.values(list);
        const items = list || [];
        items.length; // track
        r.render(() => {
          const out = [];
          items.forEach((item, i) => out.push(...[].concat(renderFn(i, item, aiot))));
          return out;
        });
      });
      return r.frag;
    },
    __cb__(opts, renderFn) {
      const r = region('block');
      effect(() => r.render(() => renderFn(undefined, aiot)));
      return r.frag;
    },
    __cc__(tag, opts) {
      return placeholder(tag);
    },
  };
  return aiot;
}

function placeholder(tag) {
  const el = document.createElement('div');
  el.className = 'vela-unsupported';
  el.textContent = `<${tag}>`;
  warn(`component <${tag}> is not simulated yet`);
  return el;
}

// ---------------------------------------------------------------------------
// Styles: $app_style$ = [[selectors, declarations], ...]
//   selector part: [0, name] class · [1, name] id · [2, name] tag
// ---------------------------------------------------------------------------

const kebab = (s) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

function styleToCss(rules, scopeSel) {
  const out = [];
  for (const rule of rules || []) {
    if (!Array.isArray(rule) || rule.length < 2) continue;
    const [raw, decls] = rule;
    if (!Array.isArray(raw) || typeof decls !== 'object') continue;
    // One selector is a list of [type, name] parts; a comma list is a list of those.
    const isPart = (x) => Array.isArray(x) && typeof x[0] === 'number';
    const selectors = isPart(raw[0]) ? [raw] : raw;
    const sel = selectors.map((parts) => parts.filter(isPart).map(([type, name]) => {
      if (type === 0) return `.${CSS.escape(name)}`;
      if (type === 1) return `#${CSS.escape(name)}`;
      if (type === 2) return `[data-tag="${name}"]`;
      return null;
    }).filter(Boolean).join('')).filter(Boolean).map((s) => `${scopeSel} ${s}`).join(', ');
    if (!sel) continue;
    const body = Object.entries(decls).map(([k, v]) => {
      if (k === 'backgroundImage' && typeof v === 'string') v = `url(${resolveSrc(v.replace(/^url\(['"]?|['"]?\)$/g, ''))})`;
      if (k === 'lines') return `-webkit-line-clamp: ${v}; display: -webkit-box; -webkit-box-orient: vertical; overflow: hidden`;
      return `${kebab(k)}: ${v}`;
    }).join('; ');
    out.push(`${sel} { ${body} }`);
  }
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// App / pages / router
// ---------------------------------------------------------------------------

export async function startApp({ screen, styleEl, device }) {
  const manifest = await (await fetch('/app/manifest.json', { cache: 'no-store' })).json();
  const stack = [];
  const sim = { manifest, device, stack };

  const globalObj = {
    setTimeout: window.setTimeout.bind(window),
    setInterval: window.setInterval.bind(window),
    clearTimeout: window.clearTimeout.bind(window),
    clearInterval: window.clearInterval.bind(window),
  };
  sim.router = {
    push: (o) => openPage(o.uri, stringify(o.params)),
    replace: (o) => openPage(o.uri, stringify(o.params), 'replace'),
    back: () => {
      if (stack.length <= 1) return log('router.back: app would exit');
      destroyPage(stack.pop());
      const p = stack[stack.length - 1];
      p.root.style.display = '';
      styleEl.textContent = styleToCss(p.def.style, '#vela-screen');
      if (typeof p.vm.onShow === 'function') p.vm.onShow();
      window.dispatchEvent(new CustomEvent('sim:page', { detail: { route: p.route, depth: stack.length } }));
    },
    clear: () => {
      while (stack.length > 1) destroyPage(stack.shift());
    },
    getLength: () => stack.length,
    getState: () => {
      const p = stack[stack.length - 1];
      return p ? { index: stack.length - 1, name: p.route, path: `/${p.route}` } : null;
    },
    getPages: () => stack.map((p) => ({ name: p.route, path: `/${p.route}` })),
  };

  const modules = createSystemModules(sim);
  globalObj.$app_require$ = (name) => {
    const key = String(name).replace(/^@app-module\//, '').replace(/^@/, '');
    if (!modules[key]) warn(`${key} is not simulated`);
    return modules[key] || modules.__missing(key);
  };
  window.$app_require$ = globalObj.$app_require$;
  // Compiled templates reference `aiot` as a free global; elements carry their own __vm__.
  window.aiot = createAiot();

  // App
  let appDef = {};
  try {
    const exportsObj = await loadBundle('/app/app.js', globalObj);
    appDef = exportsObj.default || {};
  } catch (e) {
    warn(`app.js failed: ${e.message}`);
  }
  const app = { $def: appDef, $data: appDef.data };
  if (typeof appDef.onCreate === 'function') appDef.onCreate.call(app);

  const design = (manifest.config && manifest.config.designWidth) || 466;

  async function openPage(uri, params = {}, mode = 'push') {
    const name = String(uri).replace(/^\/+/, '');
    const pages = (manifest.router && manifest.router.pages) || {};
    const route = pages[name] ? name : Object.keys(pages).find((p) => p === name || p.endsWith(`/${name}`));
    if (!route) {
      warn(`router: no page "${uri}"`);
      return;
    }
    const component = pages[route].component || route.split('/').pop();
    const exportsObj = await loadBundle(`/app/${route}/${component}.js`, globalObj);
    // The bundle registers an `entry` that runs the script and attaches template/style.
    if (typeof exportsObj.entry === 'function') exportsObj.entry(exportsObj);
    const def = exportsObj.default;
    if (!def) throw new Error(`page ${route} has no default export`);

    const current = stack[stack.length - 1];
    if (current) {
      if (mode === 'replace') destroyPage(stack.pop());
      else hidePage(current);
    }
    const page = { route, params, def, root: null, vm: null, stop: null };
    const vm = createVM(def, { params, app, page: { name: route, path: `/${route}`, component } });
    page.vm = vm;
    styleEl.textContent = styleToCss(def.style, '#vela-screen');
    const root = document.createElement('div');
    root.className = 'vela-page';
    page.root = root;
    if (typeof vm.onInit === 'function') vm.onInit();
    page.stop = scope(() => {
      const out = def.template ? def.template.call(vm, vm) : null;
      if (out) root.append(out);
    });
    screen.querySelectorAll('.vela-page').forEach((p) => (p.style.display = 'none'));
    screen.append(root);
    stack.push(page);
    queueJob(() => {
      if (typeof vm.onReady === 'function') vm.onReady();
      if (typeof vm.onShow === 'function') vm.onShow();
    });
    log(`page ${route} ${Object.keys(params).length ? JSON.stringify(params) : ''}`);
    window.dispatchEvent(new CustomEvent('sim:page', { detail: { route, depth: stack.length } }));
  }

  function hidePage(p) {
    if (typeof p.vm.onHide === 'function') p.vm.onHide();
    p.root.style.display = 'none';
  }

  function destroyPage(p) {
    if (!p) return;
    if (typeof p.vm.onDestroy === 'function') p.vm.onDestroy();
    p.stop && p.stop();
    p.vm.__stop();
    p.root.remove();
  }

  sim.destroyAll = () => {
    while (stack.length) destroyPage(stack.pop());
    if (typeof appDef.onDestroy === 'function') appDef.onDestroy.call(app);
  };

  const entry = (manifest.router && manifest.router.entry) || Object.keys(manifest.router.pages)[0];
  await openPage(entry);
  return { sim, design };
}

// Vela converts router params to strings.
function stringify(params) {
  const out = {};
  for (const [k, v] of Object.entries(params || {})) out[k] = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return out;
}

export { LIFECYCLE };
