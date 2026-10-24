/**
 * Tests for React semantics -> native Vela ViewModel mapping:
 * scope-aware rewriting, hooks, computed values, effects, events,
 * lighter template output, compile-time component inlining and validation.
 *
 * Run with:  node --test scripts/react-semantics.test.js
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildUxContent } = require('./babel-plugin-vela-ux.js');

function transform(source, filename = '<test>', options) {
  return buildUxContent(source, filename, options);
}

function script(content) {
  return content.slice(content.indexOf('<script>'));
}

function template(content) {
  const m = /<template>\n([\s\S]*?)\n<\/template>/.exec(content);
  return m ? m[1] : '';
}

// =========================================================================
// Scope-aware rewriting
// =========================================================================

describe('Scope-aware member rewriting', () => {
  test('string literals that mention state names are untouched', () => {
    const { content } = transform(`
      import { useState } from 'kovo-ux';
      export default function P() {
        const [count, setCount] = useState(0);
        function log() { console.log("count is", count); }
        return <text>{count}</text>;
      }
    `);
    assert.match(script(content), /console\.log\("count is", this\.count\)/);
  });

  test('local variables and params shadowing state are untouched', () => {
    const { content } = transform(`
      import { useState } from 'kovo-ux';
      export default function P() {
        const [value, setValue] = useState(0);
        function onInput(e) { const value = e.value; setValue(value); }
        function twice(value) { return value * 2; }
        return <text>{value}</text>;
      }
    `);
    const s = script(content);
    assert.match(s, /const value = e\.value;\s*this\.value = value;/);
    assert.match(s, /twice\(value\) \{\s*return value \* 2;/);
  });

  test('object keys and member properties named like state are untouched', () => {
    const { content } = transform(`
      import { useState } from 'kovo-ux';
      export default function P() {
        const [count, setCount] = useState(0);
        function save(obj) { return { count: obj.count, total: count }; }
        return <text>{count}</text>;
      }
    `);
    assert.match(script(content), /count: obj\.count,\s*total: this\.count/);
  });

  test('methods calling other methods use this.method()', () => {
    const { content } = transform(`
      export default function P() {
        function a() { return 1; }
        function b() { return a() + 1; }
        return <text>x</text>;
      }
    `);
    assert.match(script(content), /return this\.a\(\) \+ 1;/);
  });

  test('a method passed as a callback keeps its this binding', () => {
    const { content } = transform(`
      export default function P() {
        function tick() {}
        function start() { setTimeout(tick, 1000); }
        return <text>x</text>;
      }
    `);
    assert.match(script(content), /setTimeout\(this\.tick\.bind\(this\), 1000\)/);
  });
});

// =========================================================================
// Setters
// =========================================================================

describe('useState setters', () => {
  const src = (body) => `
    import { useState } from 'kovo-ux';
    export default function P() {
      const [n, setN] = useState(0);
      function f() { ${body} }
      return <text>{n}</text>;
    }
  `;

  test('setter inside an arrow callback', () => {
    const { content } = transform(src('setTimeout(() => setN(5), 10);'));
    assert.match(script(content), /setTimeout\(\(\) => this\.n = 5, 10\)/);
  });

  test('setter used inside expressions', () => {
    const { content } = transform(src('const ok = n > 0 && setN(0);'));
    assert.match(script(content), /const ok = this\.n > 0 && \(this\.n = 0\);/);
  });

  test('functional updater with expression body is inlined', () => {
    const { content } = transform(src('setN((prev) => prev + 1);'));
    assert.match(script(content), /this\.n = this\.n \+ 1;/);
  });

  test('functional updater with a block body becomes a valid call', () => {
    const { content } = transform(src('setN((prev) => { return prev + 1; });'));
    assert.match(script(content), /this\.n = \(prev => \{\s*return prev \+ 1;\s*\}\)\(this\.n\);/);
  });

  test('setter inside a function() callback uses kovoSelf', () => {
    const { content } = transform(src(`
      request({ success: function (res) { setN(res.n); } });
    `));
    const s = script(content);
    assert.match(s, /const kovoSelf = this;/);
    assert.match(s, /success: function \(res\) \{\s*kovoSelf\.n = res\.n;/);
  });

  test('setter passed as a value becomes a React-compatible function', () => {
    const { content } = transform(src('[1, 2].forEach(setN);'));
    assert.match(script(content), /forEach\(v => this\.n = typeof v === "function" \? v\(this\.n\) : v\)/);
  });
});

// =========================================================================
// Data / computed / refs
// =========================================================================

describe('Data model', () => {
  test('pages use protected, components use data', () => {
    const page = transform(`
      import { useState } from 'kovo-ux';
      export default function Home() { const [a] = useState(1); return <text>{a}</text>; }
    `, '/app/src-tsx/pages/home/home.tsx').content;
    assert.match(page, /protected: \{\s*a: 1\s*\}/);

    const comp = transform(`
      import { useState } from 'kovo-ux';
      export default function Card() { const [a] = useState(1); return <text>{a}</text>; }
    `, '/app/src-tsx/components/Card/Card.tsx').content;
    assert.match(comp, /data: \{\s*a: 1\s*\}/);
    assert.doesNotMatch(comp, /protected/);
  });

  test('options.kind overrides detection', () => {
    const { content } = transform(`
      export default function X() { return <text>x</text>; }
    `, '<test>', { kind: 'component' });
    assert.doesNotMatch(content, /protected/);
  });

  test('derived values become computed properties', () => {
    const { content } = transform(`
      import { useState } from 'kovo-ux';
      export default function P() {
        const [a, setA] = useState(2);
        const doubled = a * 2;
        const label = 'x' + doubled;
        return <text>{label}</text>;
      }
    `);
    const s = script(content);
    assert.match(s, /computed: \{\s*doubled\(\) \{\s*return this\.a \* 2;\s*\},\s*label\(\) \{\s*return 'x' \+ this\.doubled;/);
    assert.doesNotMatch(s, /doubled: a \* 2/);
  });

  test('useMemo becomes computed, useCallback becomes a method', () => {
    const { content } = transform(`
      import { useState, useMemo, useCallback } from 'kovo-ux';
      export default function P() {
        const [n, setN] = useState(1);
        const sq = useMemo(() => n * n, [n]);
        const inc = useCallback(() => setN(n + 1), [n]);
        return <text onClick={inc}>{sq}</text>;
      }
    `);
    const s = script(content);
    assert.match(s, /sq\(\) \{\s*return this\.n \* this\.n;/);
    assert.match(s, /inc\(\) \{\s*return this\.n = this\.n \+ 1;/);
  });

  test('constants used by the template go to data; others stay module-level', () => {
    const { content } = transform(`
      export default function P() {
        const title = 'Hello';
        const SECRET = 42;
        function f() { return SECRET; }
        return <text>{title}</text>;
      }
    `);
    const s = script(content);
    assert.match(s, /protected: \{\s*title: 'Hello'\s*\}/);
    assert.match(s, /const SECRET = 42;\s*\n\s*export default/);
    assert.match(s, /return SECRET;/);
  });

  test('state initialised from props is assigned in onInit', () => {
    const { content } = transform(`
      import { useState } from 'kovo-ux';
      export default function C({ start = 5 }) {
        const [n, setN] = useState(start);
        return <text>{n}</text>;
      }
    `);
    const s = script(content);
    assert.match(s, /data: \{\s*n: null\s*\}/);
    assert.match(s, /onInit\(\) \{\s*this\.n = this\.start;/);
  });

  test('lazy useState initialiser', () => {
    const { content } = transform(`
      import { useState } from 'kovo-ux';
      export default function P() {
        const [list] = useState(() => [1, 2, 3]);
        return <text>{list.length}</text>;
      }
    `);
    assert.match(script(content), /list: \[1, 2, 3\]/);
  });

  test('non-DOM refs are plain ViewModel fields', () => {
    const { content } = transform(`
      import { useRef } from 'kovo-ux';
      export default function P() {
        const timer = useRef(0);
        function bump() { timer.current += 1; }
        return <text>x</text>;
      }
    `);
    const s = script(content);
    assert.match(s, /onInit\(\) \{\s*this\.timer = \{\s*current: 0\s*\};/);
    assert.match(s, /this\.timer\.current \+= 1;/);
  });

  test('module-level helpers and constants read by the template are bridged', () => {
    const { content } = transform(`
      const LIMIT = 3;
      function fmt(n) { return n + '!'; }
      export default function P() {
        return <text>{fmt(LIMIT)}</text>;
      }
    `);
    const s = script(content);
    assert.match(s, /LIMIT: LIMIT/);
    assert.match(s, /\n\s*fmt\n\s*\};/);
  });
});

// =========================================================================
// Effects
// =========================================================================

describe('useEffect', () => {
  test('every effect runs, in order', () => {
    const { content } = transform(`
      import { useEffect } from 'kovo-ux';
      export default function P() {
        useEffect(() => { console.log('a'); }, []);
        useEffect(() => { console.log('b'); }, []);
        return <text>x</text>;
      }
    `);
    assert.match(script(content), /onInit\(\) \{\s*console\.log\('a'\);\s*console\.log\('b'\);/);
  });

  test('cleanup functions run in onDestroy', () => {
    const { content } = transform(`
      import { useEffect } from 'kovo-ux';
      export default function P() {
        useEffect(() => {
          const id = setInterval(() => {}, 1000);
          return () => clearInterval(id);
        }, []);
        return <text>x</text>;
      }
    `);
    const s = script(content);
    assert.match(s, /kovoEffect0\(\) \{[\s\S]*this\.kovoCleanup0 = \(\(\) => \{[\s\S]*return \(\) => clearInterval\(id\);/);
    assert.match(s, /onInit\(\) \{\s*this\.kovoEffect0\(\);/);
    assert.match(s, /onDestroy\(\) \{\s*if \(typeof this\.kovoCleanup0 === "function"\) this\.kovoCleanup0\(\);/);
  });

  test('dependencies become $watch subscriptions', () => {
    const { content } = transform(`
      import { useEffect } from 'kovo-ux';
      export default function C({ user }) {
        useEffect(() => { load(user.id); }, [user.id]);
        return <text>x</text>;
      }
    `);
    const s = script(content);
    assert.match(s, /kovoEffect0\(\) \{\s*load\(this\.user\.id\);/);
    assert.match(s, /this\.kovoEffect0\(\);\s*this\.\$watch\("user\.id", "kovoEffect0"\);/);
  });

  test('expression dependencies watch every reactive value they read (useFetch(url) pattern)', () => {
    const { content, warnings } = transform(`
      import { useState, useEffect } from 'kovo-ux';
      const API = 'https://example.com';
      function useFetch(url) {
        const [data, setData] = useState(null);
        useEffect(() => { load(url, setData); }, [url]);
        return { data };
      }
      export default function P() {
        const [id, setId] = useState(1);
        const { data } = useFetch(\`\${API}/todos/\${id}\`);
        return <text>{data}</text>;
      }
    `);
    assert.match(script(content), /this\.\$watch\("id", "kovoEffect0"\);/);
    assert.ok(!warnings.some((w) => /cannot be watched/.test(w)));
  });

  test('effects touching DOM refs run in onReady', () => {
    const { content } = transform(`
      import { useEffect, useRef } from 'kovo-ux';
      export default function P() {
        const box = useRef(null);
        useEffect(() => { box.current.focus(); }, []);
        return <div ref={box} />;
      }
    `);
    assert.match(script(content), /onReady\(\) \{\s*this\.\$element\("box"\)\.focus\(\);/);
  });

  test('missing dependency array warns', () => {
    const { warnings } = transform(`
      import { useEffect } from 'kovo-ux';
      export default function P() { useEffect(() => { go(); }); return <text>x</text>; }
    `);
    assert.ok(warnings.some((w) => /without a dependency array/.test(w)));
  });
});

// =========================================================================
// Custom hooks
// =========================================================================

describe('Custom hooks', () => {
  test('parameters are substituted with call arguments', () => {
    const { content } = transform(`
      import { useState } from 'kovo-ux';
      function useStep(step = 1) {
        const [n, setN] = useState(0);
        function next() { setN(n + step); }
        return { n, next };
      }
      export default function P() {
        const { n, next } = useStep(5);
        return <text onClick={next}>{n}</text>;
      }
    `);
    assert.match(script(content), /this\.n = this\.n \+ 5;/);
  });

  test('destructuring aliases rename hook bindings', () => {
    const { content } = transform(`
      import { useState } from 'kovo-ux';
      function useCounter() {
        const [count, setCount] = useState(0);
        function inc() { setCount(count + 1); }
        return { count, inc };
      }
      export default function P() {
        const { count: steps, inc: addStep } = useCounter();
        return <text onClick={addStep}>{steps}</text>;
      }
    `);
    const s = script(content);
    assert.match(s, /steps: 0/);
    assert.match(s, /addStep\(\) \{\s*this\.steps = this\.steps \+ 1;/);
    assert.match(template(content), /@click="addStep">\{\{steps\}\}/);
  });

  test('array-returning hooks map by position', () => {
    const { content } = transform(`
      import { useState } from 'kovo-ux';
      function useToggle() {
        const [on, setOn] = useState(false);
        function toggle() { setOn(!on); }
        return [on, toggle];
      }
      export default function P() {
        const [lightOn, flip] = useToggle();
        return <text onClick={flip}>{lightOn}</text>;
      }
    `);
    assert.match(script(content), /flip\(\) \{\s*this\.lightOn = !this\.lightOn;/);
  });

  test('hooks that cannot be resolved warn', () => {
    const { warnings } = transform(`
      import { useThing } from './hooks';
      import { useLib } from 'some-lib';
      export default function P() { const { a } = useThing(); const { b } = useLib(); return <text>x</text>; }
    `);
    assert.ok(warnings.some((w) => /useThing\(\) could not be inlined: "\.\/hooks" could not be resolved/.test(w)));
    assert.ok(warnings.some((w) => /useLib\(\) could not be inlined: it is imported from "some-lib"/.test(w)));
  });
});

describe('Imported custom hooks', () => {
  let dir;
  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kovo-hooks-'));
    fs.mkdirSync(path.join(dir, 'hooks'));
    fs.mkdirSync(path.join(dir, 'lib'));
    fs.mkdirSync(path.join(dir, 'pages'));
    fs.writeFileSync(path.join(dir, 'lib', 'format.ts'), `
      export function pad(n: number): string { return n < 10 ? '0' + n : String(n); }
    `);
    fs.writeFileSync(path.join(dir, 'hooks', 'useToggle.ts'), `
      import { useState } from 'kovo-ux';
      export default function useToggle(initial = false) {
        const [on, setOn] = useState(initial);
        function toggle() { setOn(!on); }
        return [on, toggle];
      }
    `);
    fs.writeFileSync(path.join(dir, 'hooks', 'index.ts'), `
      import { useState, useEffect } from 'kovo-ux';
      import vibrator from '@system.vibrator';
      import { pad } from '../lib/format';
      import useToggle from './useToggle';

      const STEP = 2;
      function buzz() { vibrator.vibrate({ mode: 'short' }); }

      export function useClock(start: number) {
        const [secs, setSecs] = useState(start);
        const [running, toggleRunning] = useToggle(true);
        const label = pad(secs);
        useEffect(() => {
          const id = setInterval(() => { if (running) setSecs((s) => s + STEP); }, 1000);
          return () => clearInterval(id);
        }, []);
        function reset() { buzz(); setSecs(start); }
        return { secs, label, running, toggleRunning, reset };
      }
    `);
  });
  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const compile = () => transform(`
    import { useClock } from '../hooks';
    import router from '@system.router';
    export default function Home() {
      const { label, running, toggleRunning: toggle, reset } = useClock(5);
      return <div onClick={reset}><text onClick={toggle}>{label} {running}</text></div>;
    }
  `, path.join(dir, 'pages', 'home.tsx'));

  test('hook state, computed values, effects and nested hooks are inlined', () => {
    const { content, warnings } = compile();
    const s = script(content);
    assert.deepEqual(warnings, []);
    assert.match(s, /protected: \{\s*secs: 5,\s*running: true\s*\}/);
    assert.match(s, /label\(\) \{\s*return pad\(this\.secs\);/);
    assert.match(s, /if \(this\.running\) this\.secs = this\.secs \+ STEP;/);
    assert.match(s, /toggle\(\) \{\s*this\.running = !this\.running;/);
    assert.match(s, /reset\(\) \{\s*buzz\(\);\s*this\.secs = 5;/);
    assert.match(template(content), /@click="toggle"/);
  });

  test('module dependencies are brought along and hook imports dropped', () => {
    const s = script(compile().content);
    assert.doesNotMatch(s, /from '\.\.\/hooks'/);
    assert.doesNotMatch(s, /kovo-ux/);
    assert.match(s, /import router from '@system\.router';/);
    assert.match(s, /import vibrator from '@system\.vibrator';/);
    assert.match(s, /import \{ pad \} from '\.\.\/lib\/format';/);
    assert.match(s, /const STEP = 2;/);
    assert.match(s, /function buzz\(\) \{/);
  });

  test('a clashing module name warns', () => {
    const { warnings } = transform(`
      import { useClock } from '../hooks';
      const STEP = 99;
      export default function Home() {
        const { secs } = useClock(1);
        return <text>{secs}</text>;
      }
    `, path.join(dir, 'pages', 'home.tsx'));
    assert.ok(warnings.some((w) => /"STEP" from index\.ts clashes/.test(w)));
  });
});

// =========================================================================
// Templates
// =========================================================================

describe('Template output', () => {
  test('template literals in text and attributes', () => {
    const { content } = transform(`
      export default function P() {
        const name = 'x';
        return <text className={\`t \${name ? 'on' : ''}\`}>Hi {\`\${name}!\`}</text>;
      }
    `);
    assert.match(template(content), /<text class="t \{\{name \? 'on' : ''\}\}" static>Hi \{\{name\}\}!<\/text>/);
  });

  test('whitespace between expressions follows JSX rules', () => {
    const { content } = transform(`
      export default function P() {
        const a = 1; const b = 2;
        return <text>{a} {b}</text>;
      }
    `);
    assert.match(template(content), /<text static>\{\{a\}\} \{\{b\}\}<\/text>/);
  });

  test('key becomes tid when it is a property of the item', () => {
    const { content } = transform(`
      export default function P() {
        const items = [{ id: 1 }];
        return <div>{items.map((it) => <text key={it.id}>{it.id}</text>)}</div>;
      }
    `);
    assert.match(template(content), /<text static for="\{\{it in items\}\}" tid="id">/);
    assert.doesNotMatch(content, /key=/);
  });

  test('non-mappable key warns and is dropped', () => {
    const { content, warnings } = transform(`
      export default function P() {
        const items = [{ id: 1 }];
        return <div>{items.map((it) => <text key={'k' + it.id}>x</text>)}</div>;
      }
    `);
    assert.doesNotMatch(content, /tid=|key=/);
    assert.ok(warnings.some((w) => /cannot become a Vela tid/.test(w)));
  });

  test('destructured map parameters', () => {
    const { content } = transform(`
      export default function P() {
        const items = [{ id: 1, label: 'a' }];
        return <div>{items.map(({ id, label }) => <text key={id}>{label}</text>)}</div>;
      }
    `);
    assert.match(template(content), /<text static for="\{\{kovoItem in items\}\}" tid="id">\{\{kovoItem\.label\}\}<\/text>/);
  });

  test('map callback with a block body that only returns', () => {
    const { content } = transform(`
      export default function P() {
        const items = [1];
        return <div>{items.map((i) => { return <text>{i}</text>; })}</div>;
      }
    `);
    assert.match(template(content), /<text static for="\{\{i in items\}\}">\{\{i\}\}<\/text>/);
  });

  test('per-item conditions wrap the loop in <block for> (if beats for on one tag)', () => {
    const { content } = transform(`
      export default function P() {
        const items = [{ ok: true }];
        return <div>{items.map((i) => i.ok && <text>yes</text>)}</div>;
      }
    `);
    assert.match(template(content), /<block for="\{\{i in items\}\}">\s*<text if="\{\{i\.ok\}\}">yes<\/text>\s*<\/block>/);
  });

  test('cond && list.map() guards the loop with <block if>', () => {
    const { content } = transform(`
      export default function P() {
        const items = [1];
        return <div>{items.length > 0 && items.map((i) => <text>{i}</text>)}</div>;
      }
    `);
    assert.match(template(content), /<block if="\{\{items\.length > 0\}\}">\s*<text static for="\{\{i in items\}\}">/);
  });

  test('functions in bindings are hoisted to computed', () => {
    const { content } = transform(`
      import { useState } from 'kovo-ux';
      export default function P() {
        const [items] = useState([{ done: true }]);
        return <div>{items.filter((i) => i.done).map((i) => <text>{i.done}</text>)}</div>;
      }
    `);
    assert.match(template(content), /for="\{\{i in kovoComputed0\}\}"/);
    assert.match(script(content), /kovoComputed0\(\) \{\s*return this\.items\.filter\(i => i\.done\);/);
  });

  test('nested fragments render as <block>, not extra <div>s', () => {
    const { content } = transform(`
      import { useState } from 'kovo-ux';
      export default function P() {
        const [on] = useState(true);
        return <div>{on && <><text>a</text><text>b</text></>}</div>;
      }
    `);
    assert.match(template(content), /<block if="\{\{on\}\}"><text>a<\/text><text>b<\/text><\/block>/);
  });

  test('loop variables starting with $ are rejected', () => {
    assert.throws(() => transform(`
      export default function P() {
        const items = [1];
        return <div>{items.map(($x) => <text>{$x}</text>)}</div>;
      }
    `), /cannot start with \$ or _/);
  });
});

// =========================================================================
// Events
// =========================================================================

describe('Event handlers', () => {
  test('multi-statement inline handlers become generated methods', () => {
    const { content } = transform(`
      import { useState } from 'kovo-ux';
      export default function P() {
        const [n, setN] = useState(0);
        function log(x) {}
        return <div onClick={() => { setN(n + 1); log(n); }} />;
      }
    `);
    assert.match(template(content), /<div @click="kovoHandler0"\/>/);
    assert.match(script(content), /kovoHandler0\(\) \{\s*this\.n = this\.n \+ 1;\s*this\.log\(this\.n\);/);
  });

  test('inline handlers inside loops receive the loop variables', () => {
    const { content } = transform(`
      import { useState } from 'kovo-ux';
      export default function P() {
        const [sel, setSel] = useState(null);
        const [list] = useState([1]);
        return <div>{list.map((x, i) => <text onClick={() => setSel(x + i)}>{x}</text>)}</div>;
      }
    `);
    assert.match(template(content), /@click="kovoHandler0\(i, x\)"/);
    assert.match(script(content), /kovoHandler0\(i, x\) \{\s*this\.sel = x \+ i;/);
  });

  test('any onFooBar on a native element becomes @foobar', () => {
    const { content } = transform(`
      export default function P() {
        function more() {}
        function idx(e) {}
        return <div><list onScrollBottom={more}><list-item type="row"><text>a</text></list-item></list><swiper onSwipeEnd={idx} /></div>;
      }
    `);
    const tpl = template(content);
    assert.match(tpl, /<list @scrollbottom="more">/);
    assert.match(tpl, /<swiper @swipeend="idx"\/>/);
  });

  test('(e) => method(e) binds the method directly (Vela appends the event)', () => {
    const { content } = transform(`
      export default function P() {
        function onInput(e) {}
        return <input type="text" onChange={(e) => onInput(e)} />;
      }
    `);
    assert.match(template(content), /@change="onInput"/);
  });

  test('a setter as handler gets a generated method', () => {
    const { content } = transform(`
      import { useState } from 'kovo-ux';
      export default function P() {
        const [v, setV] = useState('');
        return <input type="text" onChange={setV} />;
      }
    `);
    assert.match(template(content), /@change="kovoHandler0"/);
    assert.match(script(content), /kovoHandler0\(evt\) \{\s*this\.v = evt;/);
  });

  test('child event props compile to $emit with kovoArgs', () => {
    const { content } = transform(`
      export default function Picker({ items = [], onSelect }) {
        function pick(i) { if (onSelect) onSelect(i, 'x'); }
        return <div onClick={onSelect}><text>{items.length}</text></div>;
      }
    `);
    const s = script(content);
    assert.match(s, /if \(true\) this\.\$emit\("select", \{\s*kovoArgs: \[i, 'x'\]\s*\}\);/);
    assert.doesNotMatch(s, /onSelect: \{/);
    assert.match(template(content), /@click="kovoHandler0"/);
  });

  test('parent handlers on imported components unwrap kovoArgs', () => {
    const { content } = transform(`
      import { useState } from 'kovo-ux';
      import Picker from '../components/Picker/Picker';
      export default function P() {
        const [sel, setSel] = useState(null);
        function onPick(item) { setSel(item); }
        return <div><Picker onSelect={onPick} /></div>;
      }
    `);
    assert.match(template(content), /<picker @select="kovoHandler0"\/>/);
    const s = script(content);
    assert.match(s, /function kovoArgs\(evt\)/);
    assert.match(s, /kovoHandler0\(evt\) \{\s*this\.onPick\(\.\.\.kovoArgs\(evt\)\);/);
  });
});

// =========================================================================
// Compile-time component inlining
// =========================================================================

describe('Component inlining', () => {
  let dir;
  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kovo-inline-'));
    fs.mkdirSync(path.join(dir, 'components'));
    fs.writeFileSync(path.join(dir, 'components', 'Badge.tsx'), `
      export const style = '.badge { color: #fff; }';
      export default function Badge({ label = 'NEW', tone = 'blue', onPress }) {
        const cls = 'badge badge-' + tone;
        return <text className={cls} onClick={onPress}>{label}</text>;
      }
    `);
    fs.writeFileSync(path.join(dir, 'components', 'Counter.tsx'), `
      import { useState } from 'kovo-ux';
      export default function Counter() {
        const [n, setN] = useState(0);
        return <text onClick={() => setN(n + 1)}>{n}</text>;
      }
    `);
    fs.writeFileSync(path.join(dir, 'components', 'Opaque.tsx'), `
      export const inline = false;
      export default function Opaque({ a }) { return <text>{a}</text>; }
    `);
  });
  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const page = (jsx) => `
    import { useState } from 'kovo-ux';
    import Badge from './components/Badge';
    import Counter from './components/Counter';
    import Opaque from './components/Opaque';
    export default function Home() {
      const [items] = useState([{ id: 1, name: 'a' }]);
      function open(x) {}
      return (${jsx});
    }
  `;

  test('stateless components are inlined with props substituted', () => {
    const { content } = transform(page(`
      <div>{items.map((it) => <Badge key={it.id} label={it.name} onPress={() => open(it)} />)}</div>
    `), path.join(dir, 'home.tsx'));
    const tpl = template(content);
    assert.match(tpl, /<text class="badge badge-blue" @click="open\(it\)" for="\{\{it in items\}\}" tid="id">\{\{it\.name\}\}<\/text>/);
    assert.doesNotMatch(content, /<import/);
    assert.match(content, /\.badge \{ color: #fff; \}/);
  });

  test('stateful and opted-out components keep <import>', () => {
    const { content } = transform(page(`<div><Counter /><Opaque a="1" /></div>`), path.join(dir, 'home.tsx'));
    assert.match(content, /<import name="counter" src="\.\/components\/Counter\.ux"><\/import>/);
    assert.match(content, /<import name="opaque" src="\.\/components\/Opaque\.ux"><\/import>/);
  });

  test('<component is> imports every imported component', () => {
    const { content } = transform(`
      import { useState } from 'kovo-ux';
      import Badge from './components/Badge';
      import Counter from './components/Counter';
      export default function Tabs() {
        const [tab, setTab] = useState('badge');
        return <div><component is={tab} /></div>;
      }
    `, path.join(dir, 'tabs.tsx'));
    assert.match(content, /<import name="badge" src="\.\/components\/Badge\.ux"><\/import>/);
    assert.match(content, /<import name="counter" src="\.\/components\/Counter\.ux"><\/import>/);
    assert.match(template(content), /<component is="\{\{tab\}\}"\/>/);
    assert.doesNotMatch(script(content), /import Badge|import Counter/);
  });

  test('options.inline=false disables inlining', () => {
    const { content } = transform(page(`<div><Badge /></div>`), path.join(dir, 'home.tsx'), { inline: false });
    assert.match(content, /<import name="badge"/);
  });
});

// =========================================================================
// Vela optimization guide (guide/best-practice/memory, guide/other/tips)
// =========================================================================

describe('Vela optimizations', () => {
  const comp = (body, jsx, extra = '') => transform(`
    import { useState, useEffect } from 'kovo-ux';
    ${extra}
    export default function C() {
      ${body}
      return (${jsx});
    }
  `, '/app/src-tsx/components/C/C.tsx');

  test('nodes bound only to constants are marked static', () => {
    const { content } = comp(
      "const title = 'Hi'; const items = [{ id: 1 }]; const [n, setN] = useState(0);",
      '<div><text>{title}</text><text>{n}</text>{items.map((i) => <text key={i.id}>{i.id}</text>)}<text onClick={() => setN(1)}>{title}</text></div>',
    );
    const tpl = template(content);
    assert.match(tpl, /<text static>\{\{title\}\}<\/text>/);
    assert.match(tpl, /<text>\{\{n\}\}<\/text>/);
    assert.match(tpl, /<text static for="\{\{i in items\}\}" tid="id">/);
    assert.match(tpl, /<text @click="kovoHandler0" static>\{\{title\}\}<\/text>/);
  });

  test('state never shown leaves the component ViewModel', () => {
    const { content } = comp(
      'const [n, setN] = useState(0); const [clicks, setClicks] = useState(0);',
      '<text onClick={() => setClicks(clicks + 1)}>{n}</text>',
    );
    const s = script(content);
    assert.match(s, /data: \{\s*n: 0\s*\}/);
    assert.match(s, /onInit\(\) \{\s*this\.clicks = 0;/);
  });

  test('state read by computed values or watched deps stays reactive', () => {
    const { content } = comp(
      'const [a, setA] = useState(1); const [b, setB] = useState(2); const twice = a * 2; useEffect(() => { go(); }, [b]);',
      '<text>{twice}</text>',
    );
    assert.match(script(content), /data: \{\s*a: 1,\s*b: 2\s*\}/);
  });

  test('pages warn instead (state may receive a router param)', () => {
    const { content, warnings } = transform(`
      import { useState } from 'kovo-ux';
      export default function P() { const [id, setId] = useState(0); return <text>x</text>; }
    `, '/app/src-tsx/pages/p/p.tsx');
    assert.match(script(content), /protected: \{\s*id: 0\s*\}/);
    assert.ok(warnings.some((w) => /State "id" is never shown/.test(w)));
  });

  test('array setters with a self spread update in place', () => {
    const { content } = comp(
      'const [list, setList] = useState([]); function add(x) { setList([...list, x]); setList([x, ...list]); setList([...list]); }',
      '<text>{list.length}</text>',
    );
    const s = script(content);
    assert.match(s, /this\.list\.push\(x\);/);
    assert.match(s, /this\.list\.unshift\(x\);/);
    assert.match(s, /this\.list = \[\.\.\.this\.list\];/);
  });

  test('CSS rules for classes the template never uses are removed', () => {
    const { content } = comp(
      'const [on, setOn] = useState(false);',
      "<div className=\"box\"><text className={on ? 'on' : 'off'}>x</text></div>",
      "export const style = '.box { a: 1 } .on { b: 2 } .off { c: 3 } .unused { d: 4 } .box, .gone { e: 5 } text { f: 6 }';",
    );
    const css = content.slice(content.indexOf('<style>'), content.indexOf('</style>'));
    assert.match(css, /\.box \{ a: 1 \}/);
    assert.match(css, /\.on \{ b: 2 \}/);
    assert.match(css, /\.off \{ c: 3 \}/);
    assert.match(css, /\.box \{ e: 5 \}/);
    assert.match(css, /text \{ f: 6 \}/);
    assert.doesNotMatch(css, /unused|gone/);
  });

  test('CSS is kept when a class name is only known at runtime', () => {
    const { content } = comp(
      "const [cls, setCls] = useState('a');",
      '<text className={cls}>x</text>',
      "export const style = '.a { x: 1 } .unused { y: 2 }';",
    );
    assert.match(content, /\.unused/);
  });

  test('image src template strings become a single binding', () => {
    const { content } = comp(
      "const [type, setType] = useState('a');",
      '<image src={`/common/${type}.png`} />',
    );
    assert.match(template(content), /<image src="\{\{'\/common\/' \+ type \+ '\.png'\}\}"\/>/);
  });

  test('a text ternary with a && branch is a value, not a conditional render', () => {
    const { content } = comp(
      'const [loading, setLoading] = useState(true); const [post, setPost] = useState(null);',
      "<scroll scroll-y={true}><text>{loading ? 'wait' : post && post.title}</text></scroll>",
    );
    const tpl = template(content);
    assert.match(tpl, /<text>\{\{loading \? 'wait' : post && post\.title\}\}<\/text>/);
    assert.match(tpl, /<scroll scroll-y="true">/);
  });

  test('setInterval in an effect without cleanup warns', () => {
    const { warnings } = comp('useEffect(() => { setInterval(() => {}, 1000); }, []);', '<text>x</text>');
    assert.ok(warnings.some((w) => /setInterval without a cleanup/.test(w)));
  });
});

// =========================================================================
// Validation and TypeScript
// =========================================================================

describe('Validation', () => {
  test('reserved Vela names are rejected', () => {
    assert.throws(() => transform(`
      import { useState } from 'kovo-ux';
      export default function P() { const [show, setShow] = useState(0); return <div/>; }
    `), /reserved Vela name/);
  });

  test('names starting with $ or _ are rejected', () => {
    assert.throws(() => transform(`
      import { useState } from 'kovo-ux';
      export default function P() { const [_x, setX] = useState(0); return <div/>; }
    `), /cannot start with \$ or _/);
  });

  test('early returns give a clear error', () => {
    assert.throws(() => transform(`
      export default function P() { const x = 1; if (x) return <div/>; return <text/>; }
    `), /Early returns are not supported/);
  });

  test('unsupported CSS is reported', () => {
    const { warnings } = transform(`
      export const style = '.a .b { color: red } .c:active { color: blue } .d { display: block } .ok, #x, text { color: red } @keyframes k { from { opacity: 0 } to { opacity: 1 } }';
      export default function P() { return <div/>; }
    `);
    assert.equal(warnings.filter((w) => /^CSS/.test(w)).length, 3);
    assert.ok(warnings.some((w) => /descendant/.test(w)));
    assert.ok(warnings.some((w) => /pseudo/.test(w)));
    assert.ok(warnings.some((w) => /display: block/.test(w)));
  });

  test('characters missing from the watch font are reported with tested replacements', () => {
    const { warnings } = transform(`
      const LABELS = ['🔥 Hot'];
      export default function P() {
        console.log('🚀 logs are ignored');
        return <div><text>✔ Done</text><input type="button" value={\`🔄 Reset\`} /><text>★ ← ok</text></div>;
      }
    `);
    const w = warnings.find((x) => /cannot draw/.test(x));
    assert.ok(w, 'glyph warning expected');
    assert.match(w, /: 🔥 ✔ 🔄\./);
    assert.match(w, /✔ → ✓, 🔄 → ⇄/);
    assert.doesNotMatch(w, /🚀|★|←/);
  });

  test('checkGlyphs: false disables the glyph check', () => {
    const { warnings } = transform(`export default function P() { return <text>🔥</text>; }`, '<test>', { checkGlyphs: false });
    assert.ok(!warnings.some((x) => /cannot draw/.test(x)));
  });

  test('styleLang emits <style lang> and skips the lint', () => {
    const { content, warnings } = transform(`
      export const styleLang = 'less';
      export const style = '.a { .b { color: red; } }';
      export default function P() { return <div/>; }
    `);
    assert.match(content, /<style lang="less">/);
    assert.equal(warnings.filter((w) => /^CSS/.test(w)).length, 0);
  });
});

describe('TypeScript', () => {
  test('type syntax is stripped from the script block', () => {
    const { content } = transform(`
      import { useState } from 'kovo-ux';
      import type { Foo } from './types';
      interface Item { id: number }
      function total(items: Item[]): number { return items.length as number; }
      export default function P() {
        const [items, setItems] = useState<Item[]>([]);
        function add(n: number) { setItems([...items, { id: n }]!); }
        return <text>{items.length}</text>;
      }
    `);
    const s = script(content);
    assert.doesNotMatch(s, /: number|interface|import type|<Item\[\]>| as number|!\)/);
    assert.match(s, /function total\(items\) \{/);
  });

  test('prop types come from the TS annotation', () => {
    const { content } = transform(`
      interface Props { title: string; count?: number; tags: string[]; onTap?: () => void }
      export default function Card({ title, count = 0, tags }: Props) {
        return <text>{title}{count}{tags.length}</text>;
      }
    `);
    const s = script(content);
    assert.match(s, /title: \{\s*type: String\s*\}/);
    assert.match(s, /count: \{\s*default: 0,\s*type: Number\s*\}/);
    assert.match(s, /tags: \{\s*type: Array\s*\}/);
    assert.doesNotMatch(s, /onTap/);
  });

  test('props object access (props.x) is supported', () => {
    const { content } = transform(`
      export default function Card(props) {
        function f() { return props.title + '!'; }
        return <text>{props.title}</text>;
      }
    `);
    assert.match(template(content), /\{\{title\}\}/);
    assert.match(script(content), /return this\.title \+ '!';/);
  });

  test('export default of a named arrow component', () => {
    const { content } = transform(`
      import { useState } from 'kovo-ux';
      const App = () => { const [a] = useState(1); return <text>{a}</text>; };
      export default App;
    `);
    assert.match(template(content), /<text>\{\{a\}\}<\/text>/);
    assert.doesNotMatch(script(content), /const App/);
  });
});
