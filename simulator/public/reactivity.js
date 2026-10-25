// Minimal reactivity core for the simulator: deep proxies, effects with
// dependency cleanup, lazy computed values and batched scheduling.
// Mirrors what the Vela firmware's ViewModel does natively (Vue-like).

const ITERATE = Symbol('iterate');
const RAW = Symbol('raw');
const targetMap = new WeakMap();
const proxyMap = new WeakMap();

let activeEffect = null;
let activeScope = null;

function track(target, key) {
  if (!activeEffect) return;
  let deps = targetMap.get(target);
  if (!deps) targetMap.set(target, (deps = new Map()));
  let dep = deps.get(key);
  if (!dep) deps.set(key, (dep = new Set()));
  if (!dep.has(activeEffect)) {
    dep.add(activeEffect);
    activeEffect.deps.push(dep);
  }
}

function trigger(target, key) {
  const deps = targetMap.get(target);
  if (!deps) return;
  const run = new Set();
  for (const k of [key, ITERATE]) {
    const dep = deps.get(k);
    if (dep) dep.forEach((e) => e !== activeEffect && run.add(e));
  }
  run.forEach((e) => (e.scheduler ? e.scheduler() : e.run()));
}

export function toRaw(v) {
  return (v && v[RAW]) || v;
}

export function reactive(obj) {
  if (obj === null || typeof obj !== 'object' || obj[RAW]) return obj;
  if (proxyMap.has(obj)) return proxyMap.get(obj);
  const proxy = new Proxy(obj, {
    get(t, k, r) {
      if (k === RAW) return t;
      const v = Reflect.get(t, k, r);
      if (typeof k !== 'symbol') track(t, k);
      return v !== null && typeof v === 'object' ? reactive(v) : v;
    },
    set(t, k, v, r) {
      const had = Object.prototype.hasOwnProperty.call(t, k);
      const old = t[k];
      const raw = toRaw(v);
      const lenBefore = Array.isArray(t) ? t.length : 0;
      const ok = Reflect.set(t, k, raw, r);
      if (!had || old !== raw) {
        trigger(t, k);
        if (Array.isArray(t) && t.length !== lenBefore) trigger(t, 'length');
        if (!had) trigger(t, ITERATE);
      }
      return ok;
    },
    deleteProperty(t, k) {
      const had = Object.prototype.hasOwnProperty.call(t, k);
      const ok = Reflect.deleteProperty(t, k);
      if (had) {
        trigger(t, k);
        trigger(t, ITERATE);
      }
      return ok;
    },
    has(t, k) {
      track(t, k);
      return Reflect.has(t, k);
    },
    ownKeys(t) {
      track(t, Array.isArray(t) ? 'length' : ITERATE);
      return Reflect.ownKeys(t);
    },
  });
  proxyMap.set(obj, proxy);
  return proxy;
}

// --- scheduling: DOM updates are batched per microtask, like the device ----
const queue = new Set();
let flushing = false;
export function queueJob(job) {
  queue.add(job);
  if (!flushing) {
    flushing = true;
    Promise.resolve().then(() => {
      for (let i = 0; i < 100 && queue.size; i++) {
        const jobs = [...queue];
        queue.clear();
        jobs.forEach((j) => j());
      }
      flushing = false;
    });
  }
}

export function effect(fn, { scheduler, lazy } = {}) {
  const e = {
    deps: [],
    active: true,
    scheduler: null,
    run() {
      if (!e.active) return undefined;
      cleanup(e);
      const prev = activeEffect;
      activeEffect = e;
      try {
        return fn();
      } finally {
        activeEffect = prev;
      }
    },
    stop() {
      e.active = false;
      cleanup(e);
    },
  };
  e.scheduler = scheduler === undefined ? () => queueJob(e.run) : scheduler;
  if (activeScope) activeScope.push(e);
  if (!lazy) e.run();
  return e;
}

function cleanup(e) {
  e.deps.forEach((dep) => dep.delete(e));
  e.deps.length = 0;
}

/** Collects effects created while `fn` runs so a region can stop them later. */
export function scope(fn) {
  const effects = [];
  const prev = activeScope;
  activeScope = effects;
  try {
    fn();
  } finally {
    activeScope = prev;
  }
  return () => effects.forEach((e) => e.stop());
}

export function computed(getter) {
  let value;
  let dirty = true;
  const holder = {};
  const runner = effect(getter, {
    lazy: true,
    scheduler: () => {
      if (!dirty) {
        dirty = true;
        trigger(holder, 'value');
      }
    },
  });
  return {
    get value() {
      if (dirty) {
        value = runner.run();
        dirty = false;
      }
      track(holder, 'value');
      return value;
    },
  };
}

/** Untracked read helper. */
export function untracked(fn) {
  const prev = activeEffect;
  activeEffect = null;
  try {
    return fn();
  } finally {
    activeEffect = prev;
  }
}
