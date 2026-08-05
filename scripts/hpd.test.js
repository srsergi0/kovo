const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { buildUxContent } = require('./babel-plugin-vela-ux.js');

function transform(source) {
  return buildUxContent(source, '<hpd>');
}

function includes(str, sub) {
  if (!str.includes(sub)) {
    assert.fail(`Expected substring "${sub}" not found in:\n${str}`);
  }
}

function excludes(str, sub) {
  if (str.includes(sub)) {
    assert.fail(`Unexpected substring "${sub}" found in:\n${str}`);
  }
}

function assertSections(result, hasTemplate, hasStyle, hasScript) {
  if (hasTemplate) includes(result.content, '<template>');
  else excludes(result.content, '<template>');
  if (hasStyle) includes(result.content, '<style>');
  else excludes(result.content, '<style>');
  if (hasScript) includes(result.content, '<script>');
  else excludes(result.content, '<script>');
}

describe('HPD: Producci\u00f3n \u2014 app real completa', () => {

  test('1. app.tsx sin template (solo script)', () => {
    const r = transform(`
      import router from '@system.router';
      export default {
        onCreate() { console.log('app ready'); },
      };
    `);
    assertSections(r, false, false, true);
    includes(r.content, 'onCreate');
    includes(r.content, '@system.router');
  });

  test('2. contador completo (data + methods + eventos + binding)', () => {
    const r = transform(`
      export default {
        data: { count: 0, step: 1 },
        methods: {
          inc() { this.count = this.count + this.step; },
          dec() { this.count = this.count - 1; },
          reset() { this.count = 0; },
        },
        template: (
          <div class="page">
            <text class="counter">{this.count}</text>
            <input type="button" value="-" onClick={this.dec} />
            <input type="button" value="+" onClick={this.inc} />
            <input type="button" value="reset" onClick={this.reset} />
            <text>Step: {this.step}</text>
          </div>
        ),
      };
    `);
    assertSections(r, true, false, true);
    includes(r.content, 'class="page"');
    includes(r.content, '{{count}}');
    includes(r.content, '@click="dec"');
    includes(r.content, '@click="inc"');
    includes(r.content, '@click="reset"');
    includes(r.content, '{{step}}');
    includes(r.content, 'this.step');
  });

  test('3. toggle visibility con show + if + else', () => {
    const r = transform(`
      export default {
        data: { visible: true, details: false },
        methods: {
          toggle() { this.visible = !this.visible; },
          showDetails() { this.details = true; },
        },
        template: (
          <div>
            <text show={this.visible}>visible</text>
            <text if={this.visible}>rendered</text>
            <text elif={this.details}>details</text>
            <text else>hidden</text>
          </div>
        ),
      };
    `);
    includes(r.content, 'show="{{visible}}"');
    includes(r.content, 'if="{{visible}}"');
    includes(r.content, 'elif="{{details}}"');
    includes(r.content, 'else="true"');
  });

  test('4. lista con for + indice + binding anidado', () => {
    const r = transform(`
      export default {
        data: {
          items: [
            { name: 'A', price: 10 },
            { name: 'B', price: 20 },
          ],
        },
        template: (
          <list>
            {this.items.map((item, idx) => (
              <list-item>
                <text>{idx}</text>
                <text>{item.name}</text>
                <text>{item.price}</text>
              </list-item>
            ))}
          </list>
        ),
      };
    `);
    includes(r.content, '(idx, item) in items');
    includes(r.content, '{{idx}}');
    includes(r.content, '{{item.name}}');
    includes(r.content, '{{item.price}}');
    includes(r.content, '<list>');
    includes(r.content, '<list-item');
  });

  test('5. && + ternario + map combinados en un solo template', () => {
    const r = transform(`
      export default {
        data: { admin: true, items: ['a', 'b'], debug: false },
        template: (
          <div>
            {this.admin && <text>Panel</text>}
            {this.admin ? <text>Admin</text> : <text>User</text>}
            {this.items.map(x => <text>{x}</text>)}
          </div>
        ),
      };
    `);
    includes(r.content, 'if="{{admin}}"');
    includes(r.content, 'x in items');
    includes(r.content, '{{x}}');
  });

  test('6. style dinamico con binding en propiedades CSS', () => {
    const r = transform(`
      export default {
        data: { bgColor: '#f00', fontSize: 20, visible: true },
        template: (
          <text
            style={{ color: 'white', backgroundColor: this.bgColor, fontSize: this.fontSize }}
            show={this.visible}
          >
            Styled
          </text>
        ),
      };
    `);
    includes(r.content, 'background-color: {{bgColor}}');
    includes(r.content, 'font-size: {{fontSize}}');
    includes(r.content, 'show="{{visible}}"');
  });

  test('7. lifecycle hooks preservados', () => {
    const r = transform(`
      export default {
        data: { loaded: false },
        onCreate() { this.loaded = true; },
        onInit(query) { console.log(query); },
        onReady() { console.log('ready'); },
        onShow() { console.log('show'); },
        onDestroy() { console.log('destroy'); },
        template: <text>{this.loaded}</text>,
      };
    `);
    includes(r.content, 'onCreate() { this.loaded = true; }');
    includes(r.content, 'onInit(query)');
    includes(r.content, 'onReady()');
    includes(r.content, 'onShow()');
    includes(r.content, 'onDestroy()');
  });

  test('8. metodos con argumentos desde eventos', () => {
    const r = transform(`
      export default {
        data: { val: 0 },
        methods: {
          add(n) { this.val = this.val + n; },
          log(msg) { console.log(msg); },
        },
        template: (
          <div>
            <input type="button" onClick={() => this.add(5)} />
            <input type="button" onClick={() => this.log('hi')} />
            <text>{this.val}</text>
          </div>
        ),
      };
    `);
    includes(r.content, 'add(5)');
    includes(r.content, "log('hi')");
    includes(r.content, '{{val}}');
  });

  test('9. watch + $emit + router + system imports', () => {
    const r = transform(`
      import router from '@system.router';
      import vibrator from '@system.vibrator';
      export default {
        data: { count: 0 },
        onInit() {
          this.$watch('count', (nv) => {
            if (nv > 10) vibrator.vibrate({ mode: 'short' });
          });
        },
        methods: {
          goNext() { router.push({ uri: 'pages/next/next' }); },
          emitEvt() { this.$emit('done', { ok: true }); },
        },
        template: (
          <div>
            <text>{this.count}</text>
            <input type="button" onClick={this.goNext} />
          </div>
        ),
      };
    `);
    includes(r.content, '@system.router');
    includes(r.content, '@system.vibrator');
    includes(r.content, "$watch");
    includes(r.content, "$emit");
    includes(r.content, 'router.push');
    includes(r.content, '@click="goNext"');
  });

  test('10. componente cross-file con props y evento custom', () => {
    const r = transform(`
      import Counter from '../components/Counter/Counter.tsx';
      export default {
        data: { total: 0 },
        methods: {
          onTotalChanged(val) { this.total = val; },
        },
        template: (
          <div>
            <Counter
              initialValue={this.total}
              onValueChanged={this.onTotalChanged}
            />
            <text>Total: {this.total}</text>
          </div>
        ),
      };
    `);
    includes(r.content, 'name="counter"');
    includes(r.content, 'Counter.ux');
    includes(r.content, '<counter');
    includes(r.content, 'initial-value="{{total}}"');
    includes(r.content, '@value-changed="onTotalChanged"');
    includes(r.content, 'Total: {{total}}');
  });

  test('11. componente cross-file con children, for, if, eventos', () => {
    const r = transform(`
      import ItemList from '../components/ItemList/ItemList.tsx';
      export default {
        data: { items: ['a', 'b'], show: true },
        methods: {
          onSelect(item) { console.log(item); },
        },
        template: (
          <div>
            {this.show && (
              <ItemList items={this.items} onSelect={this.onSelect}>
                <text>child</text>
              </ItemList>
            )}
          </div>
        ),
      };
    `);
    includes(r.content, 'name="item-list"');
    includes(r.content, 'ItemList.ux');
    includes(r.content, '<item-list');
    includes(r.content, 'if="{{show}}"');
    includes(r.content, 'items="{{items}}"');
    includes(r.content, '@select="onSelect"');
    includes(r.content, '<text>child</text>');
  });

  test('12. switch / case / default passthrough', () => {
    const r = transform(`
      export default {
        data: { view: 'main' },
        template: (
          <stack switch={this.view}>
            <text case="'main'">Main</text>
            <text case="'settings'">Settings</text>
            <text default>Other</text>
          </stack>
        ),
      };
    `);
    includes(r.content, 'switch="{{view}}"');
    includes(r.content, "case=\"'main'\"");
    includes(r.content, "case=\"'settings'\"");
    includes(r.content, 'default="true"');
  });

  test('13. static, disabled, boolean shorthand attrs', () => {
    const r = transform(`
      export default {
        template: (
          <div>
            <text static>static</text>
            <input type="button" disabled />
            <input type="button" disabled={false} />
            <input type="button" disabled={true} />
            <scroll scrollY={true}>
              <text>scroll</text>
            </scroll>
          </div>
        ),
      };
    `);
    includes(r.content, 'static="true"');
    includes(r.content, 'disabled="true"');
    includes(r.content, 'scroll-y="true"');
  });

  test('14. pre / block passthrough + BinaryExpression', () => {
    const r = transform(`
      export default {
        data: { a: 1, b: 2, code: '<hello>' },
        template: (
          <div>
            <pre>{this.code}</pre>
            <block if={this.a}>
              <text>A</text>
              <text>B</text>
            </block>
            <text>{this.a + this.b}</text>
          </div>
        ),
      };
    `);
    includes(r.content, '<pre>');
    includes(r.content, '<block');
    includes(r.content, 'if="{{a}}"');
    includes(r.content, '{{a + b}}');
  });

  test('15. texto plano auto-wrap + Fragment', () => {
    const r = transform(`
      export default {
        template: (
          <div>
            plain text here
            <>
              <text>frag</text>
            </>
          </div>
        ),
      };
    `);
    includes(r.content, 'plain text here');
    includes(r.content, '<text>frag</text>');
  });

  test('16. app real con computed, watchers, metodos encadenados', () => {
    const r = transform(`
      import storage from '@system.storage';
      export default {
        data: { count: 0, history: [] },
        computed: {
          double() { return this.count * 2; },
        },
        onInit() {
          this.$watch('count', (n, o) => {
            this.history = [...this.history, { from: o, to: n }];
            storage.set({ key: 'count', value: String(n) });
          });
        },
        methods: {
          add(n) {
            this.count = this.count + n;
            this.save();
          },
          save() {
            storage.set({ key: 'count', value: String(this.count) });
          },
        },
        template: (
          <div>
            <text>{this.count}</text>
            <text>double: {this.computed.double}</text>
            <input type="button" onClick={() => this.add(1)} />
          </div>
        ),
      };
    `);
    assertSections(r, true, false, true);
    includes(r.content, '{{count}}');
    includes(r.content, 'add(1)');
    includes(r.content, "$watch");
    includes(r.content, 'storage.set');
    includes(r.content, 'computed:');
    includes(r.content, 'this.count * 2');
  });

  test('17. style multiline + template + data binding total', () => {
    const r = transform(`
      export default {
        data: { bg: '#000', color: '#fff', padding: 12 },
        style: \`
          .page { flex-direction: column; align-items: center; }
          .title { font-size: 32px; }
        \`,
        template: (
          <div style={{ backgroundColor: this.bg, color: this.color, padding: this.padding }}>
            <text class="title">Hello {this.bg}</text>
          </div>
        ),
      };
    `);
    assertSections(r, true, true, true);
    includes(r.content, 'background-color: {{bg}}');
    includes(r.content, 'color: {{color}}');
    includes(r.content, 'padding: {{padding}}');
    includes(r.content, 'flex-direction: column');
    includes(r.content, 'class="title"');
  });

  test('18. $t i18n binding preservado', () => {
    const r = transform(`
      export default {
        data: { msg: 'hello' },
        template: <text>{this.$t('hello')}</text>,
      };
    `);
    includes(r.content, "{{$t('hello')}}");
  });

  test('19. todos los eventos lower + camelCase juntos', () => {
    const r = transform(`
      export default {
        methods: {
          a() {}, b() {}, c() {}, d() {}, e() {}, f() {}, g() {}, h() {},
        },
        template: (
          <div
            onClick={this.a}
            onclick={this.b}
            onLongPress={this.c}
            onSwipe={this.d}
            onTouchStart={this.e}
            onChange={this.f}
            onFocus={this.g}
            onBlur={this.h}
          >
            <text>events</text>
          </div>
        ),
      };
    `);
    includes(r.content, '@click="a"');
    includes(r.content, '@click="b"');
    includes(r.content, '@longpress="c"');
    includes(r.content, '@swipe="d"');
    includes(r.content, '@touchstart="e"');
    includes(r.content, '@change="f"');
    includes(r.content, '@focus="g"');
    includes(r.content, '@blur="h"');
  });

  test('20. error throws en patrones invalidos', () => {
    assert.throws(() => transform('export default "string";'), /object expression/);
    assert.throws(() => transform('export default 42;'), /object expression/);
    assert.throws(
      () => transform('export default { template: "not-jsx" };'),
      /template must be a JSX/,
    );
    assert.throws(
      () => transform('export default { style: 123, template: <div/> };'),
      /style must be a string/,
    );
  });

  test('21. app de lista de tareas (todo) completa', () => {
    const r = transform(`
      export default {
        data: { tasks: [], input: '' },
        methods: {
          addTask() {
            if (this.input.trim()) {
              this.tasks = [...this.tasks, { text: this.input, done: false }];
              this.input = '';
            }
          },
          toggleTask(i) { this.tasks[i].done = !this.tasks[i].done; },
        },
        template: (
          <div class="page">
            <text>Tasks ({this.tasks.length})</text>
            <input type="text" value={this.input} onChange={this.addTask} />
            <list>
              {this.tasks.map((t, i) => (
                <list-item>
                  <text if={!t.done}>{t.text}</text>
                  <text else class="done">{t.text}</text>
                </list-item>
              ))}
            </list>
          </div>
        ),
      };
    `);
    assertSections(r, true, false, true);
    includes(r.content, '@change="addTask"');
    includes(r.content, '(i, t) in tasks');
    includes(r.content, 'if="{{!t.done}}"');
    includes(r.content, 'class="done"');
    includes(r.content, '{{tasks.length}}');
  });

  test('22. image-animator + marquee + swiper (elementos Vela)', () => {
    const r = transform(`
      export default {
        data: { srcs: ['a.png', 'b.png'] },
        template: (
          <div>
            <image-animator images={this.srcs} onStart={this.onAnimStart} />
            <marquee>scrolling text</marquee>
            <swiper index={0}>
              <text>slide1</text>
              <text>slide2</text>
            </swiper>
          </div>
        ),
        methods: {
          onAnimStart() {},
        },
      };
    `);
    includes(r.content, '<image-animator');
    includes(r.content, 'images="{{srcs}}"');
    includes(r.content, '<marquee>');
    includes(r.content, '<swiper');
    includes(r.content, 'index="{{0}}"');
  });

  test('23. $element + $refs preservados (Vela DOM access)', () => {
    const r = transform(`
      export default {
        data: { el: null },
        onReady() {
          this.el = this.$element('myText');
          this.el.setText('updated');
        },
        template: <text>$element="myText"</text>,
      };
    `);
    includes(r.content, "$element");
    includes(r.content, 'setText');
  });

  test('24. complex nested: && cond ? A : B', () => {
    const r = transform(`
      export default {
        data: { ok: true, items: [1, 2] },
        template: (
          <div>
            {this.ok && (this.items.length ? <text>has items</text> : <text>empty</text>)}
          </div>
        ),
      };
    `);
    includes(r.content, 'if="{{ok && items.length}}"');
    includes(r.content, 'if="{{ok && !(items.length)}}"');
  });

  test('25. helper functions top-level preservadas', () => {
    const r = transform(`
      function formatDate(ts) { return ts; }
      const API_URL = 'https://api.example.com';
      export default {
        data: { ts: 0 },
        template: <text>{this.ts}</text>,
      };
    `);
    includes(r.content, 'function formatDate');
    includes(r.content, 'API_URL');
  });

  test('26. onAppear / onDisappear / onScroll / onKey', () => {
    const r = transform(`
      export default {
        methods: { didAppear() {}, hid() {}, scrolled() {}, keyPressed() {} },
        template: (
          <scroll
            onAppear={this.didAppear}
            onDisappear={this.hid}
            onScroll={this.scrolled}
            onKey={this.keyPressed}
          >
            <text>scroll</text>
          </scroll>
        ),
      };
    `);
    includes(r.content, '@appear="didAppear"');
    includes(r.content, '@disappear="hid"');
    includes(r.content, '@scroll="scrolled"');
    includes(r.content, '@key="keyPressed"');
  });

  test('27. input type text + number + date + switch + slider', () => {
    const r = transform(`
      export default {
        data: { name: '', age: 0, date: '', enabled: false, level: 50 },
        methods: {
          onNameChange(e) { this.name = e.text; },
          onAgeChange(e) { this.age = e.value; },
        },
        template: (
          <div>
            <input type="text" value={this.name} onChange={this.onNameChange} />
            <input type="number" value={this.age} onchange={this.onAgeChange} />
            <input type="date" value={this.date} />
            <switch checked={this.enabled} />
            <slider value={this.level} min={0} max={100} />
          </div>
        ),
      };
    `);
    includes(r.content, 'type="text"');
    includes(r.content, 'type="number"');
    includes(r.content, 'type="date"');
    includes(r.content, '<switch');
    includes(r.content, '<slider');
    includes(r.content, 'checked="{{enabled}}"');
    includes(r.content, 'value="{{level}}"');
    includes(r.content, 'min="{{0}}"');
    includes(r.content, 'max="{{100}}"');
  });

  test('28. event handler con funcion anonima simple sin this', () => {
    const r = transform(`
      function handleTap() { console.log('tap'); }
      export default {
        template: <input type="button" onClick={handleTap} />,
      };
    `);
    includes(r.content, '@click="handleTap"');
  });

  test('29. contenido XML escapado correctamente', () => {
    const r = transform(`
      export default {
        data: { html: '<b>hello</b>' },
        template: <text>{this.html}</text>,
      };
    `);
    includes(r.content, '{{html}}');
  });

  test('30. style con template literals multilinea', () => {
    const r = transform(`
      export default {
        style: \`
          .page {
            flex-direction: column;
          }
        \`,
        template: <div class="page"><text>ok</text></div>,
      };
    `);
    includes(r.content, 'flex-direction: column');
  });

  test('31. className y class sinonimos', () => {
    const r = transform(`
      export default {
        template: (
          <div>
            <text className="foo">a</text>
            <text class="bar">b</text>
          </div>
        ),
      };
    `);
    includes(r.content, 'class="foo"');
    includes(r.content, 'class="bar"');
  });

  test('32. ternario con Fragment en rama', () => {
    const r = transform(`
      export default {
        data: { ok: true },
        template: (
          <div>
            {this.ok ? (
              <>
                <text>A</text>
                <text>B</text>
              </>
            ) : (
              <text>C</text>
            )}
          </div>
        ),
      };
    `);
    includes(r.content, 'if="{{ok}}"');
    includes(r.content, '<text>A</text>');
    includes(r.content, '<text>B</text>');
    includes(r.content, '<text else');
  });

  test('33. null/undefined branches producen else sin elemento', () => {
    const r = transform(`
      export default {
        data: { ok: true },
        template: (
          <div>
            {this.ok ? <text>yes</text> : null}
          </div>
        ),
      };
    `);
    includes(r.content, 'if="{{ok}}"');
  });

  test('34. mixed data types binding (null/undefined omitidos)', () => {
    const r = transform(`
      export default {
        data: { flag: true, count: 0 },
        template: (
          <div>
            {this.flag && <text>true</text>}
            <text>{this.count}</text>
          </div>
        ),
      };
    `);
    includes(r.content, 'if="{{flag}}"');
    includes(r.content, '{{count}}');
  });

  test('35. MemberExpression con computed property', () => {
    const r = transform(`
      export default {
        data: { obj: { nested: 'val' }, key: 'nested' },
        template: <text>{this.obj[this.key]}</text>,
      };
    `);
    includes(r.content, '{{obj[key]}}');
  });

  test('36. llamada a metodo con $emit desde template event', () => {
    const r = transform(`
      export default {
        methods: {
          fire() { this.$emit('done'); },
        },
        template: <input type="button" onClick={this.fire} />,
      };
    `);
    includes(r.content, '@click="fire"');
  });

  test('37. computed validation: non-function avisa warning', () => {
    const r = transform(`
      export default {
        data: { x: 1 },
        computed: { double() { return this.x * 2; }, triple: 3 },
        template: <text>{this.computed.double}</text>,
      };
    `);
    includes(r.warnings.join(' '), 'triple');
    includes(r.warnings.join(' '), 'function');
    includes(r.content, 'computed:');
    includes(r.content, 'double()');
    includes(r.content, '{{computed.double}}');
  });

  test('38. source map contiene sectionRanges', () => {
    const r = transform(`
      export default {
        data: { msg: 'hi' },
        template: <text>{this.msg}</text>,
      };
    `);
    includes(JSON.stringify(r.sectionRanges), 'template');
    includes(JSON.stringify(r.sectionRanges), 'script');
  });

  test('39. lineMap mapea lineas .ux a .tsx', () => {
    const r = transform(`
      export default {
        data: { x: 1 },
        template: <div><text>{this.x}</text></div>,
      };
    `);
    const uxLines = r.content.split('\n');
    for (let i = 1; i <= uxLines.length; i++) {
      if (uxLines[i - 1].includes('{{x}}')) {
        if (!r.lineMap[i] || r.lineMap[i] === 0) {
          assert.fail(`Line ${i} ("${uxLines[i - 1]}") should map to >0 source line`);
        }
      }
    }
  });

  test('40. error message friendly includes filename', () => {
    try {
      buildUxContent('export default "bad";', 'pages/test.tsx');
      assert.fail('Should have thrown');
    } catch (e) {
      includes(e.message, 'pages/test.tsx');
      includes(e.message, 'bad');
    }
  });

  test('41. error message friendly for bad style', () => {
    try {
      buildUxContent('export default { style: 42, template: <div/> };', 'test.tsx');
      assert.fail('Should have thrown');
    } catch (e) {
      includes(e.message, 'style must be a string');
      includes(e.message, 'test.tsx');
    }
  });

  test('42. error message friendly for bad template', () => {
    try {
      buildUxContent('export default { template: "string" };', 'test.tsx');
      assert.fail('Should have thrown');
    } catch (e) {
      includes(e.message, 'template must be a JSX');
      includes(e.message, 'test.tsx');
    }
  });

  test('43. syntax error wrapped in friendly message', () => {
    try {
      buildUxContent('export default { template: <div> }', 'broken.tsx');
      assert.fail('Should have thrown');
    } catch (e) {
      includes(e.message, 'broken.tsx');
      includes(e.message, '[vela-ux]');
    }
  });
});
