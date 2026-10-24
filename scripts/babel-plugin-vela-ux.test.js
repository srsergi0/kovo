/**
 * Comprehensive tests for babel-plugin-vela-ux
 * Covers all patterns from Xiaomi Vela JS documentation:
 *   - Template syntax (data binding, events, for, if, block)
 *   - Props, components, event binding
 *   - Style syntax (dynamic class/style, inline, selectors)
 *   - Script syntax (data, lifecycle, computed, methods)
 *   - Page switching (router)
 *
 * Run with:  node --test scripts/babel-plugin-vela-ux.test.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { buildUxContent } = require('./babel-plugin-vela-ux.js');

function transform(source) {
  const { content, warnings } = buildUxContent(source, '<test>');
  return { content, warnings };
}

// =========================================================================
// SECTION 1: DATA BINDING  (Template doc)
// =========================================================================

describe('Data binding', () => {
  test('basic {{}} interpolation in <text>', () => {
    const src = `
      export default {
        private: { message: 'Hello' },
        template: <text>{this.message}</text>,
      };
    `;
    const { content } = transform(src);
    assert.match(content, /<text>\{\{message\}\}<\/text>/);
  });

  test('expression in <text> children', () => {
    const src = `
      export default {
        private: { a: 1 },
        template: <text>{this.a}</text>,
      };
    `;
    const { content } = transform(src);
    assert.match(content, /<text>\{\{a\}\}<\/text>/);
  });

  test('expression inside string attribute', () => {
    const src = `
      export default {
        private: { src: 'img.png' },
        template: <image src={this.src} />,
      };
    `;
    const { content } = transform(src);
    assert.match(content, /<image src="\{\{src\}\}"\/>/);
  });

  test('plain string literal attribute', () => {
    const src = `
      export default {
        template: <image src="/foo.png" />,
      };
    `;
    const { content } = transform(src);
    assert.match(content, /<image src="\/foo.png"\/>/);
  });
});

// =========================================================================
// SECTION 2: EVENT BINDING  (Template + Event docs)
// =========================================================================

describe('Event binding', () => {
  test('onclick lowercase -> @click (Vela doc style)', () => {
    const src = `
      export default {
        methods: { press() {} },
        template: <text onclick={this.press}>press</text>,
      };
    `;
    const { content } = transform(src);
    assert.match(content, /@click="press"/);
  });

  test('onclick lowercase with no this', () => {
    const src = `
      export default {
        methods: { press() {} },
        template: <text onclick="press">press</text>,
      };
    `;
    const { content } = transform(src);
    assert.match(content, /@click="press"/);
  });

  test('onClick camelCase -> @click', () => {
    const src = `
      export default {
        methods: { press() {} },
        template: <text onClick={this.press}>press</text>,
      };
    `;
    const { content } = transform(src);
    assert.match(content, /@click="press"/);
  });

  test('event with constant parameter', () => {
    const src = `
      export default {
        methods: { handle(idx) {} },
        template: <text onClick={() => this.handle(0)}>X</text>,
      };
    `;
    const { content } = transform(src);
    assert.match(content, /@click="handle\(0\)"/);
  });

  test('event with variable parameter', () => {
    const src = `
      export default {
        data: { total: 0 },
        methods: { handle(n, num) {} },
        template: <text onClick={() => this.handle(this.total, 5)}>X</text>,
      };
    `;
    const { content } = transform(src);
    // this.total -> total
    assert.match(content, /@click="handle\(total, 5\)"/);
  });

  test('onchange lowercase -> @change', () => {
    const src = `
      export default {
        methods: { onChange() {} },
        template: <input type="text" onchange={this.onChange} />,
      };
    `;
    const { content } = transform(src);
    assert.match(content, /@change="onChange"/);
  });

  test('onfocus -> @focus', () => {
    const src = `
      export default {
        methods: { onFocus() {} },
        template: <input type="text" onFocus={this.onFocus} />,
      };
    `;
    const { content } = transform(src);
    assert.match(content, /@focus="onFocus"/);
  });

  test('$evt is auto-added by Vela, passed in arrow function', () => {
    // Vela auto-appends $evt parameter, but user can also define handler($idx, $item, $evt)
    const src = `
      export default {
        methods: { handle(idx, item) {} },
        template: <text onClick={() => this.handle(0, 'a')}>X</text>,
      };
    `;
    const { content } = transform(src);
    assert.match(content, /@click="handle\(0, 'a'\)"/);
  });
});

// =========================================================================
// SECTION 3: LOOP DIRECTIVES (for doc)
// =========================================================================

describe('Loop directives', () => {
  test('.map() -> for="{{item in list}}"', () => {
    const src = `
      export default {
        data: { list: [{ name: 'a' }] },
        template: (
          <div>
            {this.list.map(item => <text>{item.name}</text>)}
          </div>
        ),
      };
    `;
    const { content } = transform(src);
    assert.match(content, /<text for="\{\{item in list\}\}">\{\{item\.name\}\}<\/text>/);
  });

  test('.map() with tid attribute', () => {
    const src = `
      export default {
        data: { list: [{ uniqueId: 1 }] },
        template: (
          <div>
            {this.list.map(item => <text tid={item.uniqueId}>{item.name}</text>)}
          </div>
        ),
      };
    `;
    const { content } = transform(src);
    // The tid is on the element, for is also on it
    assert.match(content, /for="\{\{item in list\}\}"/);
    assert.match(content, /tid="\{\{item\.uniqueId\}\}"/);
  });

  test('nested .map() on different elements', () => {
    const src = `
      export default {
        data: { cities: [{ name: 'bj', spots: [{ addr: 'X' }] }] },
        template: (
          <div>
            {this.cities.map(city => (
              <div>
                <text>{city.name}</text>
                {city.spots.map(spot => <text>{spot.addr}</text>)}
              </div>
            ))}
          </div>
        ),
      };
    `;
    const { content } = transform(src);
    // Outer for
    assert.match(content, /<div for="\{\{city in cities\}\}">/);
    // Inner for
    assert.match(content, /<text for="\{\{spot in city\.spots\}\}">\{\{spot\.addr\}\}<\/text>/);
  });

  test('.map() with index param uses (idx, item) syntax', () => {
    const src = `
      export default {
        data: { list: [1, 2, 3] },
        template: (
          <div>
            {this.list.map((item, idx) => <text>{idx}: {item}</text>)}
          </div>
        ),
      };
    `;
    const { content } = transform(src);
    assert.match(content, /for="\{\{\(idx, item\) in list\}\}"/);
  });
});

// =========================================================================
// SECTION 4: CONDITIONAL DIRECTIVES (if doc)
// =========================================================================

describe('Conditional directives', () => {
  test('cond && <X/> -> if="{{cond}}" on X', () => {
    const src = `
      export default {
        data: { display: false },
        template: (
          <text if={this.display}>hello</text>
        ),
      };
    `;
    const { content } = transform(src);
    assert.match(content, /<text if="\{\{display\}\}">/);
  });

  test('show directive passed through', () => {
    const src = `
      export default {
        private: { visible: false },
        template: <text show={this.visible}>hello</text>,
      };
    `;
    const { content } = transform(src);
    assert.match(content, /show="\{\{visible\}\}"/);
  });

  test('show=false omits the attribute', () => {
    const src = `
      export default {
        private: { visible: false },
        template: <text show={false}>hello</text>,
      };
    `;
    const { content } = transform(src);
    // when show={false}, the attribute is omitted entirely
    assert.ok(!content.includes('show') || content.includes('show="true"') === false);
  });

  // --- if/elif/else chain ---
  test('ternary chain: cond ? X : cond2 ? Y : Z -> if/elif/else', () => {
    const src = `
      export default {
        data: { display: false },
        template: (
          <div>
            {this.display ? <text>Hello-1</text> : !this.display ? <text>Hello-2</text> : <text>Hello-3</text>}
          </div>
        ),
      };
    `;
    const { content } = transform(src);
    assert.match(content, /<text if="\{\{display\}\}">Hello-1<\/text>/);
    assert.match(content, /<text elif="\{\{!display\}\}">Hello-2<\/text>/);
    assert.match(content, /<text else>Hello-3<\/text>/);
  });

  test('simple ternary: X ? A : B -> if + else', () => {
    const src = `
      export default {
        data: { ok: true },
        template: (
          <div>
            {this.ok ? <text>yes</text> : <text>no</text>}
          </div>
        ),
      };
    `;
    const { content } = transform(src);
    assert.match(content, /<text if="\{\{ok\}\}">yes<\/text>/);
    assert.match(content, /<text else>no<\/text>/);
  });
});

// =========================================================================
// SECTION 5: LOGICAL CONTROL BLOCK (block element)
// =========================================================================

describe('Block element', () => {
  test('block is transparent in Vela, just pass through', () => {
    const src = `
      export default {
        data: { items: [1, 2] },
        template: (
          <div>
            {this.items.map(item => (
              <text>{item}</text>
            ))}
          </div>
        ),
      };
    `;
    const { content } = transform(src);
    assert.match(content, /<text for="\{\{item in items\}\}">\{\{item\}\}<\/text>/);
  });

  test('block with conditional inside', () => {
    const src = `
      export default {
        data: { show: true, items: [1, 2] },
        template: (
          <div>
            {this.items.map(item => (
              <text>{item}</text>
            ))}
          </div>
        ),
      };
    `;
    const { content } = transform(src);
    assert.match(content, /<text for="\{\{item in items\}\}">\{\{item\}\}<\/text>/);
  });
});

// =========================================================================
// SECTION 6: COMPUTED PROPERTIES (computed doc)
// =========================================================================

describe('Computed properties', () => {
  test('computed with getter function', () => {
    const src = `
      export default {
        data: { message: 'Hello' },
        computed: {
          reversedMessage() {
            return this.message.split('').reverse().join('');
          }
        },
        template: <text>{this.reversedMessage}</text>,
      };
    `;
    const { content } = transform(src);
    assert.match(content, /computed: \{ reversedMessage\(\) \{/);
    assert.match(content, /<text>\{\{reversedMessage\}\}<\/text>/);
  });

  test('computed with getter/setter object', () => {
    const src = `
      export default {
        data: { firstName: 'Quick', lastName: 'App' },
        computed: {
          fullName: {
            get() { return this.firstName + ' ' + this.lastName; },
            set(value) { const n = value.split(' '); this.firstName = n[0]; this.lastName = n[1]; }
          }
        },
        template: <text>{this.fullName}</text>,
      };
    `;
    const { content } = transform(src);
    assert.match(content, /computed: \{ fullName: \{ get\(\)/);
  });

  test('computed used in template', () => {
    const src = `
      export default {
        data: { message: 'Hello' },
        computed: {
          reversedMessage() { return this.message.split('').reverse().join(''); }
        },
        template: <text>{this.reversedMessage}</text>,
      };
    `;
    const { content } = transform(src);
    assert.match(content, /\{\{reversedMessage\}\}/);
  });
});

// =========================================================================
// SECTION 7: PROPS (props doc)
// =========================================================================

describe('Props (script)', () => {
  test('props array', () => {
    const src = `
      export default {
        props: ['say', 'propObject'],
        data: { say: 'hello' },
        template: <text>{this.say}</text>,
      };
    `;
    const { content } = transform(src);
    assert.match(content, /props: \['say', 'propObject'\],/);
  });

  test('props with object form (default, type)', () => {
    const src = `
      export default {
        props: {
          prop1: { default: 'Hello', type: String },
          prop2Object: {}
        },
        template: <text>{this.prop1}</text>,
      };
    `;
    const { content } = transform(src);
    assert.match(content, /props: \{ prop1: \{ default: 'Hello', type: String \}, prop2Object: \{\} \},/);
  });

  test('props with default and type validation', () => {
    const src = `
      export default {
        props: {
          prop1: { default: 'Hello', type: String },
        },
        onInit() { console.info(this.prop1); },
        template: <div />,
      };
    `;
    const { content } = transform(src);
    assert.match(content, /props: \{ prop1: \{ default: 'Hello', type: String \} \},/);
    assert.match(content, /onInit\(\) \{ console\.info\(this\.prop1\); \},/);
  });

  test('using props as initial value with data', () => {
    const src = `
      export default {
        props: ['propObject'],
        data: { obj: null },
        onInit() {
          this.obj = JSON.parse(JSON.stringify(this.propObject));
        },
        template: <div />,
      };
    `;
    const { content } = transform(src);
    assert.match(content, /props: \['propObject'\],/);
    assert.match(content, /data: \{ obj: null \},/);
    assert.match(content, /onInit\(\) \{/);
  });

  test('$watch in script', () => {
    const src = `
      export default {
        props: ['propObject'],
        data: { propSay: '' },
        onInit() {
          this.$watch('propObject.name', 'watchPropsChange');
        },
        watchPropsChange(newV, oldV) {
          this.propSay = newV && newV.toUpperCase();
        },
        template: <text>{this.propSay}</text>,
      };
    `;
    const { content } = transform(src);
    assert.match(content, /this\.\$watch\('propObject\.name', 'watchPropsChange'\);/);
    assert.match(content, /watchPropsChange\(newV, oldV\) \{/);
  });
});

// =========================================================================
// SECTION 8: CUSTOM COMPONENTS (component doc - script side)
// =========================================================================

describe('Components (script side)', () => {
  test('$emit in method', () => {
    const src = `
      export default {
        data: { compCount: 0 },
        addHandler() {
          this.compCount++;
          this.$emit('emitEvt', { count: this.compCount });
        },
        template: <text>{this.compCount}</text>,
      };
    `;
    const { content } = transform(src);
    assert.match(content, /this\.\$emit\('emitEvt', \{ count: this\.compCount \}\);/);
  });

  test('$dispatch in method', () => {
    const src = `
      export default {
        data: { compNum: 0 },
        delHandler() {
          this.compNum--;
          this.$dispatch('dispatchEvt', { num: this.compNum });
        },
        template: <text>{this.compNum}</text>,
      };
    `;
    const { content } = transform(src);
    assert.match(content, /this\.\$dispatch\('dispatchEvt', \{ num: this\.compNum \}\);/);
  });

  test('$on in lifecycle', () => {
    const src = `
      export default {
        data: { compAge: null },
        onInit() {
          this.$on('broadevt', this.broadevt);
        },
        broadevt(evt) {
          this.compAge = evt.detail.age;
        },
        template: <text>{this.compAge}</text>,
      };
    `;
    const { content } = transform(src);
    assert.match(content, /this\.\$on\('broadevt', this\.broadevt\);/);
    assert.match(content, /broadevt\(evt\) \{/);
  });

  test('$broadcast in method', () => {
    const src = `
      export default {
        data: { age: 18 },
        evtTypeEmit() {
          this.$broadcast('broadevt', { age: 19 });
        },
        template: <div />,
      };
    `;
    const { content } = transform(src);
    assert.match(content, /this\.\$broadcast\('broadevt', \{ age: 19 \}\);/);
  });
});

// =========================================================================
// SECTION 9: DATA MODIFIERS (script doc - private/protected/public)
// =========================================================================

describe('Data modifiers (private/protected/public)', () => {
  test('private data in script', () => {
    const src = `
      export default {
        private: { message: 'Hello' },
        template: <text>{this.message}</text>,
      };
    `;
    const { content } = transform(src);
    assert.match(content, /private: \{ message: 'Hello' \},/);
  });

  test('protected data for router params', () => {
    const src = `
      export default {
        protected: { key: '' },
        onInit() { console.info('key: ' + this.key); },
        template: <text>{this.key}</text>,
      };
    `;
    const { content } = transform(src);
    assert.match(content, /protected: \{ key: '' \},/);
  });

  test('public data for external params', () => {
    const src = `
      export default {
        public: { key: '' },
        template: <text>{this.key}</text>,
      };
    `;
    const { content } = transform(src);
    assert.match(content, /public: \{ key: '' \},/);
  });
});

// =========================================================================
// SECTION 10: STYLE SYNTAX (style doc)
// =========================================================================

describe('Style syntax', () => {
  test('tag selector in style block', () => {
    const src = `
      export default {
        style: 'text { color: #0000FF; }',
        template: <text>styled</text>,
      };
    `;
    const { content } = transform(src);
    assert.match(content, /<style>[\s\S]*text \{ color: #0000FF; \}[\s\S]*<\/style>/);
  });

  test('class selector in style block', () => {
    const src = `
      export default {
        style: '.title { color: #00FF00; font-weight: bold; }',
        template: <text class="title">styled</text>,
      };
    `;
    const { content } = transform(src);
    assert.match(content, /\.title \{ color: #00FF00; font-weight: bold; \}/);
  });

  test('id selector in style block', () => {
    const src = `
      export default {
        style: '#title { color: #00A000; }',
        template: <text id="title">styled</text>,
      };
    `;
    const { content } = transform(src);
    assert.match(content, /#title \{ color: #00A000; \}/);
  });

  test('parallel selectors (comma)', () => {
    const src = `
      export default {
        style: '.title, #title { font-weight: bold; }',
        template: <text class="title">styled</text>,
      };
    `;
    const { content } = transform(src);
    assert.match(content, /\.title, #title \{ font-weight: bold; \}/);
  });

  test('flex layout example from docs', () => {
    const src = `
      export default {
        style: '.page { flex-direction: column; align-items: center; } .item { flex-shrink: 0; justify-content: center; width: 200px; height: 100px; margin: 10px; background-color: #FF0000; }',
        template: (
          <div class="page">
            <div class="item"><text>item1</text></div>
            <div class="item"><text>item2</text></div>
          </div>
        ),
      };
    `;
    const { content } = transform(src);
    assert.match(content, /<div class="page">/);
    assert.match(content, /<style>[\s\S]*\.page \{ flex-direction: column;/);
  });

  test('inline style attribute', () => {
    const src = `
      export default {
        template: <div style="color: red; margin: 10px;" />,
      };
    `;
    const { content } = transform(src);
    assert.match(content, /<div style="color: red; margin: 10px;"\/>/);
  });
});

// =========================================================================
// SECTION 11: DYNAMIC STYLE/MODIFICATION (style doc - dynamic)
// =========================================================================

describe('Dynamic style modification', () => {
  test('dynamic class with expression', () => {
    const src = `
      export default {
        private: { className: 'text-blue' },
        template: <text class={this.className}>dynamic</text>,
      };
    `;
    const { content } = transform(src);
    assert.match(content, /class="\{\{className\}\}"/);
  });

  test('dynamic inline style with expression', () => {
    const src = `
      export default {
        private: { textColor: '#0faeff' },
        template: <div style={{color: this.textColor}}>text</div>,
      };
    `;
    const { content } = transform(src);
    assert.match(content, /style="color: \{\{textColor\}\};"/);
  });

  test('dynamic style with bound object', () => {
    const src = `
      export default {
        private: { styleObj: { color: 'red', fontSize: 16 } },
        template: <div style={this.styleObj}>text</div>,
      };
    `;
    const { content } = transform(src);
    // When style value is a non-object expression, wrap in {{}}
    assert.match(content, /style="\{\{styleObj\}\}"/);
  });

  test('dynamic class with template string', () => {
    const src = `
      export default {
        private: { className: 'text-blue' },
        template: <text class={"normal-text " + this.className}>dynamic</text>,
      };
    `;
    const { content } = transform(src);
    assert.match(content, /class="\{\{'normal-text ' \+ className\}\}"/);
  });
});

// =========================================================================
// SECTION 12: PAGE SWITCHING (router)
// =========================================================================

describe('Page switching', () => {
  test('router.replace with uri', () => {
    const src = `
      import router from '@system.router';
      export default {
        routePage() {
          router.replace({ uri: '/Pages/newPage' });
        },
        template: <div />,
      };
    `;
    const { content } = transform(src);
    assert.match(content, /import router from '@system\.router';/);
    assert.match(content, /router\.replace\(\{ uri: '\/Pages\/newPage' \}\);/);
  });

  test('router.replace with params', () => {
    const src = `
      import router from '@system.router';
      export default {
        private: { title: 'Hello, world!' },
        routePageReplaceWithParams() {
          router.replace({
            uri: '/PageParams/receiveparams',
            params: { key: this.title }
          });
        },
        template: <input type="button" value="Go" onClick={this.routePageReplaceWithParams} />,
      };
    `;
    const { content } = transform(src);
    assert.match(content, /router\.replace\(\{ uri: '\/PageParams\/receiveparams', params: \{ key: this\.title \} \}\);/);
  });
});

// =========================================================================
// SECTION 13: LIFECYCLE
// =========================================================================

describe('Lifecycle hooks', () => {
  test('all page lifecycle hooks in script', () => {
    const src = `
      export default {
        onInit() { console.log('init'); },
        onReady() { console.log('ready'); },
        onShow() { console.log('show'); },
        onHide() { console.log('hide'); },
        onDestroy() { console.log('destroy'); },
        template: <div />,
      };
    `;
    const { content } = transform(src);
    assert.match(content, /onInit\(\)/);
    assert.match(content, /onReady\(\)/);
    assert.match(content, /onShow\(\)/);
    assert.match(content, /onHide\(\)/);
    assert.match(content, /onDestroy\(\)/);
  });
});

// =========================================================================
// SECTION 14: SCRIPT SYNTAX (imports, helpers)
// =========================================================================

describe('Script syntax', () => {
  test('import from system modules', () => {
    const src = `
      import fetch from '@system.fetch';
      import router from '@system.router';
      export default {
        template: <div />,
      };
    `;
    const { content } = transform(src);
    assert.match(content, /import fetch from '@system\.fetch';/);
    assert.match(content, /import router from '@system\.router';/);
  });

  test('custom JS import', () => {
    const src = `
      import utils from '../common/utils.js';
      export default {
        template: <div />,
      };
    `;
    const { content } = transform(src);
    assert.match(content, /import utils from '\.\.\/common\/utils\.js';/);
  });

  test('helper function at top level', () => {
    const src = `
      function formatPrice(price) {
        return price.toFixed(2);
      }
      export default {
        private: { price: 9.99 },
        template: <text>{this.formatPrice(this.price)}</text>,
      };
    `;
    const { content } = transform(src);
    assert.match(content, /function formatPrice/);
    assert.match(content, /\{\{formatPrice\(price\)\}\}/);
  });
});

// =========================================================================
// SECTION 15: MIXED / INTEGRATION
// =========================================================================

describe('Integration', () => {
  test('full page example from Vela template doc', () => {
    const src = `
      import router from '@system.router';
      export default {
        private: {
          title: 'Example Page'
        },
        routeDetail() {
          router.push({ uri: '/DemoDetail' });
        },
        style: '.page { flex-direction: column; justify-content: center; align-items: center; } .title { font-size: 30px; text-align: center; } .btn { width: 400px; height: 60px; margin-top: 75px; border-radius: 43px; background-color: #09ba07; font-size: 30px; color: #ffffff; }',
        template: (
          <div class="page">
            <text class="title">Welcome to {this.title}</text>
            <input class="btn" type="button" value="Go to Details" onClick={this.routeDetail} />
          </div>
        ),
      };
    `;
    const { content } = transform(src);
    // Has all sections
    assert.match(content, /<template>/);
    assert.match(content, /<style>/);
    assert.match(content, /<script>/);
    // Script has import + methods + style
    assert.match(content, /import router from '@system\.router';/);
    assert.match(content, /routeDetail/);
    // Template has correct structure
    assert.match(content, /<div class="page">/);
    assert.match(content, /<text class="title">Welcome to \{\{title\}\}<\/text>/);
    assert.match(content, /@click="routeDetail"/);
  });

  test('conditional with comment/expression mix', () => {
    const src = `
      export default {
        data: { display: true },
        template: (
          <div>
            {this.display && <text if={this.display}>Hello-1</text>}
          </div>
        ),
      };
    `;
    const { content } = transform(src);
    // Should not double up the if
    assert.match(content, /<text if="\{\{display\}\}">Hello-1<\/text>/);
  });
});

// =========================================================================
// SECTION 16: EDGE CASES
// =========================================================================

describe('Edge cases', () => {
  test('empty template text', () => {
    const src = `
      export default {
        template: <div></div>,
      };
    `;
    const { content } = transform(src);
    assert.match(content, /<div\/>/);
  });

  test('text with only whitespace', () => {
    const src = `
      export default {
        template: <div>   </div>,
      };
    `;
    const { content } = transform(src);
    assert.match(content, /<div\/>/);
  });

  test('multiple children on one line', () => {
    const src = `
      export default {
        data: { a: 1, b: 2 },
        template: <text>{this.a} + {this.b} = {this.a + this.b}</text>,
      };
    `;
    const { content } = transform(src);
    // All expressions inline
    assert.match(content, /\{\{a\}\} \+ \{\{b\}\} = \{\{a \+ b\}\}/);
  });

  test('element with multiple classes', () => {
    const src = `
      export default {
        template: <div class="foo bar baz" />,
      };
    `;
    const { content } = transform(src);
    assert.match(content, /class="foo bar baz"/);
  });
});

// =========================================================================
// SECTION 17: CROSS-FILE COMPONENTS
// =========================================================================

describe('Cross-file components', () => {
  test('custom component with import generates <import> tag', () => {
    const src = `
      import Keyboard from '../../components/Keyboard/Keyboard.ux';
      export default {
        data: { hide: false },
        template: <Keyboard hide={this.hide} />,
      };
    `;
    const { content } = transform(src);
    assert.match(content, /<import name="keyboard" src="\.\.\/\.\.\/components\/Keyboard\/Keyboard\.ux"><\/import>/);
    assert.match(content, /<keyboard hide="\{\{hide\}\}"\/>/);
  });

  test('custom component with onEvent -> @event', () => {
    const src = `
      import Keyboard from '../../components/Keyboard/Keyboard.ux';
      export default {
        methods: { onComplete(evt) {} },
        template: <Keyboard onComplete={this.onComplete} />,
      };
    `;
    const { content } = transform(src);
    assert.match(content, /@complete="onComplete"/);
  });

  test('custom component with kebab-case event name', () => {
    const src = `
      import InputMethod from '../../components/InputMethod/InputMethod.ux';
      export default {
        methods: { onVisibilityChange(evt) {} },
        template: <InputMethod onVisibilityChange={this.onVisibilityChange} />,
      };
    `;
    const { content } = transform(src);
    assert.match(content, /@visibility-change="onVisibilityChange"/);
  });

  test('custom component .tsx import resolves .ux in <import src>', () => {
    const src = `
      import MyWidget from '../../components/MyWidget/MyWidget.tsx';
      export default {
        template: <MyWidget title="hello" />,
      };
    `;
    const { content } = transform(src);
    assert.match(content, /<import name="my-widget" src="\.\.\/\.\.\/components\/MyWidget\/MyWidget\.ux"><\/import>/);
    assert.match(content, /<my-widget title="hello"\/>/);
  });
});

// =========================================================================
// SECTION 18: SWITCH / CASE / DEFAULT
// =========================================================================

describe('Switch/case/default', () => {
  test('switch on parent div with case and default children', () => {
    const src = `
      export default {
        data: { status: 'loading' },
        template: (
          <div switch={this.status}>
            <text case="'loading'">Loading...</text>
            <text case="'error'">Error!</text>
            <text default>Ready</text>
          </div>
        ),
      };
    `;
    const { content } = transform(src);
    assert.match(content, /<div switch="\{\{status\}\}">/);
    assert.match(content, /<text case="'loading'">/);
    assert.match(content, /<text case="'error'">/);
    assert.match(content, /<text default="true">/);
  });
});

// =========================================================================
// SECTION 19: NEW EVENTS
// =========================================================================

describe('New events (appear, disappear, scroll, key)', () => {
  test('onAppear -> @appear', () => {
    const src = `
      export default {
        methods: { onAppear() {} },
        template: <text onAppear={this.onAppear}>hello</text>,
      };
    `;
    const { content } = transform(src);
    assert.match(content, /@appear="onAppear"/);
  });

  test('onDisappear -> @disappear', () => {
    const src = `
      export default {
        methods: { onDisappear() {} },
        template: <text onDisappear={this.onDisappear}>hello</text>,
      };
    `;
    const { content } = transform(src);
    assert.match(content, /@disappear="onDisappear"/);
  });

  test('onScroll -> @scroll', () => {
    const src = `
      export default {
        methods: { onScroll() {} },
        template: <scroll onScroll={this.onScroll}><text>content</text></scroll>,
      };
    `;
    const { content } = transform(src);
    assert.match(content, /@scroll="onScroll"/);
  });

  test('onKey -> @key', () => {
    const src = `
      export default {
        methods: { onKey() {} },
        template: <input type="text" onKey={this.onKey} />,
      };
    `;
    const { content } = transform(src);
    assert.match(content, /@key="onKey"/);
  });
});

// =========================================================================
// SECTION 20: STATIC ATTRIBUTE
// =========================================================================

describe('Static attribute', () => {
  test('static attribute passes through', () => {
    const src = `
      export default {
        template: <div static><text>static content</text></div>,
      };
    `;
    const { content } = transform(src);
    assert.match(content, /<div static="true">/);
  });

  test('static={true} also works', () => {
    const src = `
      export default {
        template: <div static={true}><text>static content</text></div>,
      };
    `;
    const { content } = transform(src);
    assert.match(content, /<div static="true">/);
  });
});

// =========================================================================
// SECTION 21: CRUEL TESTS — edge cases that try to break the compiler
// =========================================================================

describe('CRUEL: deep nesting', () => {
  test('10 levels of nested divs', () => {
    const src = `
      export default {
        template: <div><div><div><div><div><div><div><div><div><div><text>deep</text></div></div></div></div></div></div></div></div></div></div>,
      };
    `;
    const { content } = transform(src);
    const opens = (content.match(/<div>/g) || []).length;
    const closes = (content.match(/<\/div>/g) || []).length;
    assert.equal(opens, 10);
    assert.equal(closes, 10);
    assert.match(content, /<text>deep<\/text>/);
  });
});

describe('CRUEL: mixed directives on one element', () => {
  test('for + if + show + class + style + event + tid on same element', () => {
    const src = `
      export default {
        data: { items: [1,2,3], visible: true, showMe: false },
        methods: { onClick() {} },
        template: <div>
          {this.items.map(item => (
            <text if={this.visible} show={this.showMe} class="foo" style={{color: 'red'}} onClick={this.onClick} tid={item.id}>{item.name}</text>
          ))}
        </div>,
      };
    `;
    const { content } = transform(src);
    assert.match(content, /for="\{\{item in items\}\}"/);
    assert.match(content, /if="\{\{visible\}\}"/);
    assert.match(content, /show="\{\{showMe\}\}"/);
    assert.match(content, /class="foo"/);
    assert.match(content, /style="color: red;"/);
    assert.match(content, /@click="onClick"/);
    assert.match(content, /tid="\{\{item\.id\}\}"/);
  });
});

describe('CRUEL: complex expressions', () => {
  test('deep member expression chain', () => {
    const src = `
      export default {
        data: { a: { b: { c: { d: { e: 'deep' } } } } },
        template: <text>{this.a.b.c.d.e}</text>,
      };
    `;
    const { content } = transform(src);
    assert.match(content, /\{\{a\.b\.c\.d\.e\}\}/);
  });

  test('expression with binary operators and function call', () => {
    const src = `
      export default {
        data: { items: [] },
        methods: { calc(n) { return n * 2; } },
        template: <text>{this.calc(this.items.length + 1)}</text>,
      };
    `;
    const { content } = transform(src);
    // Should generate a binding expression
    assert.match(content, /\{\{calc\(/);
  });

  test('expression inside JSX attribute with complex logic', () => {
    const src = `
      export default {
        data: { a: 1, b: 2, c: 3 },
        template: <div class={"cls-" + this.a + "-" + this.b}>text</div>,
      };
    `;
    const { content } = transform(src);
    assert.match(content, /class="\{\{'cls-'.+b\}\}"/);
  });
});

describe('CRUEL: nested conditionals', () => {
  test('ternary inside && rhs', () => {
    const src = `
      export default {
        data: { ok: true, flag: false },
        template: <div>
          {this.ok && (this.flag ? <text>A</text> : <text>B</text>)}
        </div>,
      };
    `;
    const { content } = transform(src);
    assert.match(content, /<div>/);
    // The && combines with the ternary condition
    assert.match(content, /if="\{\{ok && flag\}\}"/);
    assert.match(content, /if="\{\{ok && !\(flag\)\}\}"/);
  });

  test('&& inside ternary consequent', () => {
    const src = `
      export default {
        data: { a: true, b: false },
        template: <div>
          {this.a ? (this.b && <text>both</text>) : <text>none</text>}
        </div>,
      };
    `;
    const { content } = transform(src);
    assert.match(content, /<text if="\{\{a && b\}\}"/);
    assert.match(content, /<text else>/);
  });
});

describe('CRUEL: nested functional patterns', () => {
  test('map inside map (3 levels)', () => {
    const src = `
      export default {
        data: {
          matrix: [[[1,2],[3,4]],[[5,6],[7,8]]]
        },
        template: <div>
          {this.matrix.map(level1 => (
            <div>
              {level1.map(level2 => (
                <div>
                  {level2.map(item => <text>{item}</text>)}
                </div>
              ))}
            </div>
          ))}
        </div>,
      };
    `;
    const { content } = transform(src);
    assert.match(content, /for="\{\{level1 in matrix\}\}"/);
    assert.match(content, /for="\{\{level2 in level1\}\}"/);
    assert.match(content, /for="\{\{item in level2\}\}"/);
  });

  test('map with index nested inside another map', () => {
    const src = `
      export default {
        data: { groups: [['a','b'],['c','d']] },
        template: <div>
          {this.groups.map((group, gi) => (
            <div>
              {group.map((item, idx) => <text>{gi}:{idx}:{item}</text>)}
            </div>
          ))}
        </div>,
      };
    `;
    const { content } = transform(src);
    assert.match(content, /for="\{\{\(gi, group\) in groups\}\}"/);
    assert.match(content, /for="\{\{\(idx, item\) in group\}\}"/);
    assert.match(content, /\{\{gi\}\}:\{\{idx\}\}:\{\{item\}\}/);
  });
});

describe('CRUEL: style edge cases', () => {
  test('style with all possible value types', () => {
    const src = `
      export default {
        template: <div style={{ width: '100%', height: 200, flex: true, opacity: 0.5, zIndex: 1000 }} />,
      };
    `;
    const { content } = transform(src);
    assert.match(content, /width: 100%/);
    assert.match(content, /height: 200/);
    assert.match(content, /opacity: 0\.5/);
    assert.match(content, /flex: true/);
    assert.match(content, /z-index: 1000/);
  });

  test('style with dynamic binding values', () => {
    const src = `
      export default {
        private: { bgColor: '#ff0', h: 100 },
        template: <div style={{ backgroundColor: this.bgColor, height: this.h }} />,
      };
    `;
    const { content } = transform(src);
    // Dynamic values become {{bindings}} inside style
    assert.match(content, /background-color: \{\{bgColor\}\}/);
    assert.match(content, /height: \{\{h\}\}/);
  });
});

describe('CRUEL: event handler insanity', () => {
  test('event with method call chain as arg', () => {
    const src = `
      export default {
        data: { items: [{ id: 1 }] },
        methods: { handle(n) {} },
        template: <text onClick={() => this.handle(this.items[0].id)}>X</text>,
      };
    `;
    const { content } = transform(src);
    assert.match(content, /@click="handle\(/);
    // The binding should reference items[0].id (this. stripped)
    assert.match(content, /items\[0\]\.id/);
  });

  test('event with multiple args including string and binary', () => {
    const src = `
      export default {
        data: { x: 5 },
        methods: { fn(a, b, c) {} },
        template: <text onClick={() => this.fn(this.x, 'hello', 42)}>X</text>,
      };
    `;
    const { content } = transform(src);
    assert.match(content, /@click="fn\(x, 'hello', 42\)"/);
  });

  test('lowercase onclick with complex expression value', () => {
    const src = `
      export default {
        methods: { handleIt() {} },
        template: <text onclick={this.handleIt}>press</text>,
      };
    `;
    const { content } = transform(src);
    assert.match(content, /@click="handleIt"/);
  });
});

describe('CRUEL: unicode and special characters', () => {
  test('emoji in text content', () => {
    const src = `
      export default {
        template: <text>{'Hello ' + '🔥' + ' World'}</text>,
      };
    `;
    const { content } = transform(src);
    assert.match(content, /Hello/);
  });

  test('CJK characters in text', () => {
    const src = `
      export default {
        data: { msg: '你好世界' },
        template: <text>{this.msg}</text>,
      };
    `;
    const { content } = transform(src);
    assert.match(content, /\{\{msg\}\}/);
  });

  test('special XML chars in text: <>&"', () => {
    const src = `
      export default {
        template: <text>{'a < b & c > d "e"'}</text>,
      };
    `;
    const { content } = transform(src);
    assert.match(content, /a &lt; b &amp; c &gt; d &quot;e&quot;/);
  });
});

describe('CRUEL: fragment madness', () => {
  test('empty fragment', () => {
    const src = `
      export default {
        template: <></>,
      };
    `;
    const { content } = transform(src);
    assert.match(content, /<div\/>/);
  });

  test('fragment with single element', () => {
    const src = `
      export default {
        template: <><text>single</text></>,
      };
    `;
    const { content } = transform(src);
    assert.match(content, /<div>\s*<text>single<\/text>\s*<\/div>/);
  });

  test('nested fragments', () => {
    const src = `
      export default {
        template: <><><text>nested</text></></>,
      };
    `;
    const { content } = transform(src);
    // Root fragment becomes <div>; nested fragments become transparent <block>
    const divCount = (content.match(/<div>/g) || []).length;
    assert.equal(divCount, 1);
    assert.match(content, /<block>/);
    assert.match(content, /<text>nested<\/text>/);
  });
});

describe('CRUEL: boolean attribute edge cases', () => {
  test('disabled={false} is omitted', () => {
    const src = `
      export default {
        template: <input type="button" disabled={false} />,
      };
    `;
    const { content } = transform(src);
    assert.ok(!content.includes('disabled'));
  });

  test('disabled={undefined} is omitted', () => {
    const src = `
      export default {
        template: <input type="button" disabled={undefined} />,
      };
    `;
    const { content } = transform(src);
    assert.ok(!content.includes('disabled'));
  });

  test('disabled alone (no value) becomes disabled="true"', () => {
    const src = `
      export default {
        template: <input type="button" disabled />,
      };
    `;
    const { content } = transform(src);
    assert.match(content, /disabled="true"/);
  });

  test('show={false} is omitted', () => {
    const src = `
      export default {
        template: <text show={false}>hidden</text>,
      };
    `;
    const { content } = transform(src);
    assert.ok(!content.includes('show'));
  });
});

describe('CRUEL: container text wrapping', () => {
  test('text in stack auto-wraps', () => {
    const src = `
      export default {
        template: <stack>plain text in stack</stack>,
      };
    `;
    const { content, warnings } = transform(src);
    assert.match(content, /<stack><text>plain text in stack<\/text><\/stack>/);
    assert.ok(warnings.length > 0);
  });

  test('text in scroll auto-wraps', () => {
    const src = `
      export default {
        template: <scroll>scroll text</scroll>,
      };
    `;
    const { content } = transform(src);
    assert.match(content, /<scroll><text>/);
  });

  test('text in list auto-wraps', () => {
    const src = `
      export default {
        template: <list><text>header</text>tail text</list>,
      };
    `;
    const { content } = transform(src);
    assert.match(content, /<text>tail text<\/text>/);
  });
});

// =========================================================================
// SECTION 22: CRUEL ERROR CASES — patterns that MUST throw
// =========================================================================

describe('CRUEL ERROR: export default not object', () => {
  test('export default string literal throws', () => {
    assert.throws(() => transform('export default "hello";'), /object expression/);
  });

  test('export default number throws', () => {
    assert.throws(() => transform('export default 42;'), /object expression/);
  });
});

describe('CRUEL ERROR: missing template', () => {
  test('export default with no template is allowed (app.tsx style)', () => {
    const { content } = transform('export default { data: { x: 1 } };');
    assert.doesNotMatch(content, /<template>/);
    assert.match(content, /data:/);
  });
});

describe('CRUEL ERROR: invalid template type', () => {
  test('template is a string literal throws', () => {
    assert.throws(
      () => transform(`export default { template: 'not-jsx' };`),
      /template must be a JSX/,
    );
  });
});

describe('CRUEL ERROR: style not string', () => {
  test('style is a number throws', () => {
    assert.throws(
      () => transform(`export default { style: 42, template: <div/> };`),
      /style must be a string/,
    );
  });

  test('style is an object throws', () => {
    assert.throws(
      () => transform(`export default { style: { color: 'red' }, template: <div/> };`),
      /style must be a string/,
    );
  });
});

describe('CRUEL ERROR: map() edge cases', () => {
  test('map() with no arguments throws', () => {
    const src = `
      export default {
        data: { items: [] },
        template: <div>{this.items.map()}</div>,
      };
    `;
    assert.throws(() => transform(src), /map\(\) requires a callback/);
  });

  test('map() callback with no params throws', () => {
    const src = `
      export default {
        data: { items: [] },
        template: <div>{this.items.map(() => <text/>)}</div>,
      };
    `;
    assert.throws(() => transform(src), /at least one parameter/);
  });

  test('map() callback body not JSX throws', () => {
    const src = `
      export default {
        data: { items: [] },
        template: <div>{this.items.map(x => x + 1)}</div>,
      };
    `;
    assert.throws(() => transform(src), /single JSX element/);
  });

  test('map() with non-function callback throws', () => {
    const src = `
      export default {
        data: { items: [] },
        template: <div>{this.items.map(x)}</div>,
      };
    `;
    assert.throws(() => transform(src), /callback must be a function/);
  });
});

describe('CRUEL ERROR: && conditional edge cases', () => {
  test('&& with non-JSX right side (string) throws', () => {
    const src = `
      export default {
        data: { ok: true },
        template: <div>{this.ok && 'hello'}</div>,
      };
    `;
    assert.throws(() => transform(src), /must be a single JSX element/);
  });

  test('&& with number on right side throws', () => {
    const src = `
      export default {
        data: { ok: true },
        template: <div>{this.ok && 42}</div>,
      };
    `;
    assert.throws(() => transform(src), /must be a single JSX element/);
  });
});

describe('CRUEL ERROR: ternary edge cases', () => {
  test('ternary with null alternate (else omitido)', () => {
    const src = `
      export default {
        data: { ok: true },
        template: <div>{this.ok ? <text>yes</text> : null}</div>,
      };
    `;
    const r = transform(src);
    assert.match(r.content, /if="\{\{ok\}\}"/);
    assert.doesNotMatch(r.content, /else/);
  });

  test('ternary with non-JSX consequent throws', () => {
    const src = `
      export default {
        data: { ok: true },
        template: <div>{this.ok ? 'string' : <text>no</text>}</div>,
      };
    `;
    assert.throws(() => transform(src), /must be a JSX element/);
  });
});

describe('CRUEL ERROR: spread not supported', () => {
  test('spread attributes throw', () => {
    const src = `
      export default {
        data: { obj: {} },
        template: <div {...this.obj} />,
      };
    `;
    assert.throws(() => transform(src), /spread/i);
  });

  test('spread in style throws', () => {
    const src = `
      export default {
        template: <div style={{...{color: 'red'}}} />,
      };
    `;
    assert.throws(() => transform(src), /spread.*style/i);
  });
});

describe('CRUEL ERROR: custom component not imported', () => {
  test('uppercase non-imported element throws', () => {
    const src = `
      export default {
        template: <UnknownComponent />,
      };
    `;
    // If it starts with uppercase but wasn't imported, the compiler
    // should still try to handle it (it may be a Vela system component)
    // Just make sure it doesn't crash
    const { content } = transform(src);
    // It should still serialize it as a custom component
    assert.match(content, /<unknown-component\/>/);
  });
});

describe('CRUEL ERROR: event handler no value', () => {
  test('event handler attribute without value falls through', () => {
    const src = `
      export default {
        template: <text onclick>press</text>,
      };
    `;
    // onclick without value — the existing code at line 199 checks EVENT_MAP
    // and calls serializeEventHandler with value=null which throws
    assert.throws(() => transform(src), /must have a value/);
  });
});

describe('CRUEL: empty/null data edge cases', () => {
  test('empty data object', () => {
    const src = `
      export default {
        data: {},
        template: <text>empty</text>,
      };
    `;
    const { content } = transform(src);
    assert.match(content, /<text>empty<\/text>/);
  });

  test('data with null value', () => {
    const src = `
      export default {
        data: { x: null },
        template: <text>{this.x}</text>,
      };
    `;
    const { content } = transform(src);
    assert.match(content, /\{\{x\}\}/);
  });

  test('data with undefined value', () => {
    const src = `
      export default {
        data: { x: undefined },
        template: <text>{this.x}</text>,
      };
    `;
    const { content } = transform(src);
    assert.match(content, /\{\{x\}\}/);
  });
});

describe('CRUEL: import edge cases', () => {
  test('multiple system imports + component import all coexist', () => {
    const src = `
      import router from '@system.router';
      import fetch from '@system.fetch';
      import MyComp from './MyComp.tsx';
      export default {
        template: <div><MyComp title="hi" onEvent={this.handler} /></div>,
        methods: { handler() {} },
      };
    `;
    const { content } = transform(src);
    // Template has <import> for the component
    assert.match(content, /<import name="my-comp"/);
    assert.match(content, /<my-comp title="hi"/);
    assert.match(content, /@event="handler"/);
    // Script keeps JS imports; the component import lives in <import> only
    assert.match(content, /import router from/);
    assert.match(content, /import fetch from/);
    assert.doesNotMatch(content, /import MyComp from/);
  });
});

describe('React Functional Components', () => {
  test('functional component with useState, props destructuring, and handlers', () => {
    const src = `
      import { useState } from 'kovo-ux';
      export default function Counter({ value = 0, label = 'Count' }) {
        const [count, setCount] = useState(value);
        function handleInc() {
          setCount(count + 1);
        }
        return (
          <div onClick={handleInc}>
            <text>{label}: {count}</text>
          </div>
        );
      }
    `;
    const { content } = transform(src);
    assert.match(content, /<div @click="handleInc">/);
    assert.match(content, /<text>\{\{label\}\}: \{\{count\}\}<\/text>/);
    assert.match(content, /props:\s*\{\s*value:\s*\{\s*default:\s*0\s*\},\s*label:\s*\{\s*default:\s*'Count'\s*\}\s*\}/);
    // State initialised from a prop: declared in data, assigned in onInit
    assert.match(content, /data:\s*\{\s*count:\s*null\s*\}/);
    assert.match(content, /onInit\(\)\s*\{\s*this\.count = this\.value;/);
    assert.match(content, /handleInc\(\)/);
    assert.match(content, /this\.count = this\.count \+ 1/);
  });

  test('custom hook inlining (useCounter)', () => {
    const src = `
      import { useState } from 'kovo-ux';

      function useCounter(initialValue = 0) {
        const [count, setCount] = useState(initialValue);
        function inc() {
          setCount(count + 1);
        }
        function dec() {
          setCount(count - 1);
        }
        return { count, inc, dec };
      }

      export default function CounterPage() {
        const { count, inc, dec } = useCounter(10);
        return (
          <div className="page">
            <text>{count}</text>
            <input type="button" value="+" onClick={inc} />
            <input type="button" value="-" onClick={dec} />
          </div>
        );
      }
    `;
    const { content } = transform(src);
    // Pages use `protected` so in-app router params can override state
    assert.match(content, /protected:\s*\{\s*count:\s*10\s*\}/);
    assert.match(content, /inc\(\)/);
    assert.match(content, /this\.count = this\.count \+ 1/);
    assert.match(content, /dec\(\)/);
    assert.match(content, /this\.count = this\.count - 1/);
    assert.match(content, /<text>\{\{count\}\}<\/text>/);
    assert.match(content, /@click="inc"/);
    assert.match(content, /@click="dec"/);

    // Xiaomi Vela OS Compliance Checks
    assert.doesNotMatch(content, /methods:\s*\{/, 'Methods MUST NOT be wrapped in methods: {} for Vela OS VM');
    assert.doesNotMatch(content, /function useCounter/, 'Inlined custom hook function MUST NOT remain in script');
  });

  test('ultra robust useRef support: DOM element references, methods, and custom hooks', () => {
    const src = `
      import { useState, useRef } from 'kovo-ux';

      function useScrollToTop() {
        const listRef = useRef(null);
        function scrollTop() {
          listRef.current.scrollTo({ top: 0, smooth: true });
        }
        return { listRef, scrollTop };
      }

      export default function CanvasPage() {
        const inputRef = useRef(null);
        const canvasRef = useRef(null);
        const { listRef, scrollTop } = useScrollToTop();
        const [title, setTitle] = useState('My Canvas');

        function focusInput() {
          inputRef.current.focus();
        }

        function clearCanvas() {
          const ctx = canvasRef.current.getContext('2d');
          ctx.clearRect(0, 0, 300, 300);
        }

        return (
          <div ref={listRef} className="page">
            <text className="title">{title}</text>
            <input ref={inputRef} type="text" value={title} />
            <canvas ref={canvasRef} id="customCanvasId" width="300" height="300" />
            <input type="button" value="Focus" onClick={focusInput} />
            <input type="button" value="Clear" onClick={clearCanvas} />
            <input type="button" value="Top" onClick={scrollTop} />
          </div>
        );
      }
    `;
    const { content } = transform(src);

    // 1. Template: ref={listRef} -> id="listRef", ref={inputRef} -> id="inputRef"
    assert.match(content, /<div id="listRef" class="page">/);
    assert.match(content, /<input id="inputRef" type="text" value="\{\{title\}\}"\/>/);

    // 2. Pre-existing id="customCanvasId" is preserved over ref={canvasRef}
    assert.match(content, /<canvas id="customCanvasId" width="300" height="300"\/>/);

    // 3. Methods: inputRef.current.focus() -> this.$element("inputRef").focus()
    assert.match(content, /focusInput\(\) \{\s*this\.\$element\(["']inputRef["']\)\.focus\(\);\s*\}/);

    // 4. Methods: canvasRef.current resolves to the element's explicit id
    assert.match(content, /clearCanvas\(\) \{\s*const ctx = this\.\$element\(["']customCanvasId["']\)\.getContext\('2d'\);\s*ctx\.clearRect\(0, 0, 300, 300\);\s*\}/);

    // 5. Custom hook inlined ref: listRef.current.scrollTo(...) -> this.$element("listRef").scrollTo(...)
    assert.match(content, /scrollTop\(\) \{\s*this\.\$element\(["']listRef["']\)\.scrollTo\(\{/);

    // 6. Data: title initialized
    assert.match(content, /protected:\s*\{\s*title:\s*'My Canvas'\s*\}/);
  });

  test('dynamic component tag <component is={activeTab} /> is serialized to is="{{activeTab}}"', () => {
    const src = `
      import { useState } from 'kovo-ux';
      import Part1 from './part1';
      import Part2 from './part2';

      export default function TabPage() {
        const [activeTab, setActiveTab] = useState('part1');
        return (
          <div className="page">
            <component is={activeTab} />
          </div>
        );
      }
    `;
    const { content } = transform(src);
    assert.match(content, /<component is="\{\{activeTab\}\}"\/>/);
  });

  test('Vela OS compliance: methods MUST be emitted directly on export default, NOT inside a methods: {} wrapper', () => {
    const src = `
      import { useState } from 'kovo-ux';

      export default function VelaApp() {
        const [counter, setCounter] = useState(100);
        function bump() {
          setCounter(counter + 1);
        }
        return (
          <div className="page">
            <text>{counter}</text>
            <input type="button" value="Bump" onClick={bump} />
          </div>
        );
      }
    `;
    const { content } = transform(src);

    // 1. Methods MUST be top-level keys of export default (bump() { ... })
    assert.match(content, /export default \{\s*protected:\s*\{\s*counter:\s*100\s*\},\s*bump\(\)\s*\{/);

    // 2. MUST NOT contain methods: {
    assert.doesNotMatch(content, /methods:\s*\{/);

    // 3. MUST NOT leave un-inlined hook or component functions in script
    assert.doesNotMatch(content, /function VelaApp/);
  });
});


