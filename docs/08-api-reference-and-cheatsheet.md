# 08. API Reference & Cheatsheet

A complete quick-reference guide for all Kovo APIs, compiler behaviors, supported elements, and solutions to common errors.

---

## 📦 Import Cheatsheet

### Virtual Module Imports (Compile-Time Only)

These imports are consumed by the Kovo compiler and stripped from the final output:

```tsx
import { useState } from 'kovo-ux';    // State declaration hook
import { useRef } from 'kovo-ux';      // DOM element reference hook
```

### System Module Imports

These imports are preserved and transpiled to `require('@system.moduleName')`:

```tsx
import router from '@system.router';       // Page navigation
import vibrator from '@system.vibrator';   // Haptic feedback
import fetch from '@system.fetch';         // HTTP network requests
import app from '@system.app';             // App lifecycle info
```

### Cross-File Component Imports

Capital-cased default imports from relative paths are detected as custom components:

```tsx
import StatCard from '../../components/StatCard/StatCard';
// Transpiled to: <import name="stat-card" src="../../components/StatCard/StatCard.ux">
```

---

## ⚛️ Hooks API Reference

### `useState<T>(initialValue: T): [T, (newValue: T) => void]`

Declares a reactive state variable on the QuickApp VM's `data` object.

| Parameter | Type | Description |
| :--- | :--- | :--- |
| `initialValue` | `any` | The initial value for the state variable |
| **Returns** | `[value, setter]` | Destructured array: current value and setter function |

**Compile-time behavior:**
- `const [x, setX] = useState(42)` → `protected: { x: 42 }` (page) / `data: { x: 42 }` (component)
- `setX(newVal)` → `this.x = newVal`
- `setX(x + 1)` → `this.x = this.x + 1`

---

### `useRef(initialValue: any): { current: any }`

Creates a reference to a native QuickApp DOM element.

| Parameter | Type | Description |
| :--- | :--- | :--- |
| `initialValue` | `any` | Usually `null` |
| **Returns** | `{ current }` | Object with `.current` property |

**Compile-time behavior:**
- `<div ref={myRef}>` → `<div id="myRef">`
- `myRef.current.scrollTo(...)` → `this.$element("myRef").scrollTo(...)`
- `myRef.current.focus()` → `this.$element("myRef").focus()`

---

## 🏷️ Supported HTML/QuickApp Elements

### Layout & Container Elements

| Element | Description | Notes |
| :--- | :--- | :--- |
| `<div>` | Flex container | Default layout element |
| `<stack>` | Stack container | Overlapping children |
| `<list>` | Scrollable list | Optimized for long lists |
| `<list-item>` | List child item | Must be inside `<list>` |
| `<scroll>` | Scroll container | Single-direction scroll |
| `<swiper>` | Swipeable pages | Carousel / tab switching |

### Content Elements

| Element | Description | Notes |
| :--- | :--- | :--- |
| `<text>` | Text display | Primary text rendering |
| `<span>` | Inline text | Inside `<text>` |
| `<image>` | Image display | `src` attribute for path |
| `<progress>` | Progress bar | `percent` attribute |
| `<marquee>` | Scrolling text | Auto-scrolling text |
| `<image-animator>` | Frame animation | Sprite sheet animation |

### Interactive Elements

| Element | Description | Attributes |
| :--- | :--- | :--- |
| `<input type="button">` | Button | `value`, `@click` |
| `<input type="text">` | Text input | `value`, `@change` |
| `<input type="number">` | Number input | `value`, `@change` |
| `<input type="date">` | Date picker | `value`, `@change` |
| `<switch>` | Toggle switch | `checked`, `@change` |
| `<slider>` | Slider control | `value`, `min`, `max`, `@change` |

---

## 🔀 Template Directive Reference

### Conditional Rendering

| JSX Pattern | QuickApp Output |
| :--- | :--- |
| `{cond ? <A/> : <B/>}` | `<A if="{{cond}}"/> <B else/>` |
| `{cond && <A/>}` | `<A if="{{cond}}"/>` |
| `{a ? <A/> : b ? <B/> : <C/>}` | `<A if="{{a}}"/> <B elif="{{b}}"/> <C else/>` |

### List Rendering

| JSX Pattern | QuickApp Output |
| :--- | :--- |
| `{items.map(item => <X/>)}` | `<X for="{{item in items}}"/>` |
| `{items.map((item, i) => <X/>)}` | `<X for="{{(i, item) in items}}"/>` |

### Dynamic Components

| JSX Pattern | QuickApp Output |
| :--- | :--- |
| `<component is={tabName} />` | `<component is="{{tabName}}"/>` |

---

## ⚡ Event Binding Reference

| TSX Attribute | QuickApp Attribute | Triggered When |
| :--- | :--- | :--- |
| `onClick={fn}` | `@click="fn"` | User taps element |
| `onChange={fn}` | `@change="fn"` | Input value changes |
| `onAppear={fn}` | `@appear="fn"` | Element enters viewport |
| `onDisappear={fn}` | `@disappear="fn"` | Element leaves viewport |
| `onScroll={fn}` | `@scroll="fn"` | User scrolls container |
| `onSwipe={fn}` | `@swipe="fn"` | User swipes element |
| `onLongPress={fn}` | `@longpress="fn"` | Long press detected |

---

## 📋 Lifecycle Hooks

Lifecycle hooks are automatically detected and preserved in the compiled output:

```tsx
export default function MyPage() {
  // Called when the page VM is created
  function onInit() { console.log('Page initialized'); }

  // Called when the page is fully rendered
  function onReady() { console.log('Page ready'); }

  // Called when the page becomes visible
  function onShow() { console.log('Page shown'); }

  // Called when the page is hidden
  function onHide() { console.log('Page hidden'); }

  // Called when the page is destroyed
  function onDestroy() { console.log('Page destroyed'); }

  return <div className="page"><text>Hello</text></div>;
}
```

These are emitted as top-level methods on `export default`:

```javascript
export default {
  onInit() { console.log('Page initialized'); },
  onReady() { console.log('Page ready'); },
  onShow() { console.log('Page shown'); },
  onHide() { console.log('Page hidden'); },
  onDestroy() { console.log('Page destroyed'); }
}
```

---

## 📁 Manifest Configuration (`manifest.json`)

```json
{
  "package": "com.example.kovo",
  "name": "VelaJSX",
  "versionName": "1.0.0",
  "versionCode": 1,
  "minPlatformVersion": 1070,
  "icon": "/resources/base/media/icon.png",
  "features": [
    { "name": "system.app" },
    { "name": "system.router" },
    { "name": "system.vibrator" },
    { "name": "system.fetch" }
  ],
  "permissions": [{ "origin": "*" }],
  "config": {
    "logLevel": "debug",
    "designWidth": 466
  },
  "router": {
    "entry": "pages/index",
    "pages": {
      "pages/index": { "component": "index" },
      "pages/demo": { "component": "demo" },
      "pages/network": { "component": "network" },
      "pages/settings": { "component": "settings" }
    }
  }
}
```

> [!IMPORTANT]
> The `"router"` section is **automatically generated** by `scripts/copy-static.js`. Simply create a new folder under `src-tsx/pages/mypage/mypage.tsx` and routes are auto-registered.

---

## 🔧 Troubleshooting Common Errors

### Error: `TypeError: not a function` at button click

**Cause:** Component methods were wrapped inside `methods: { ... }` instead of being placed directly on `export default`.

**Solution:** Kovo handles this automatically. If you see this error, ensure you are running `bun run build` before `aiot build`. Check the generated `.ux` file to confirm methods are top-level.

---

### Error: `[JsForCallRender] need a array`

**Cause:** A variable used in `for="{{item in myList}}"` was not registered in `data: { ... }`.

**Solution:** Kovo auto-registers top-level `const` variables into `data`. Ensure your array variable is declared inside the component function body:

```tsx
export default function MyPage() {
  const items = ['A', 'B', 'C'];  // ✅ Auto-registered in data
  return items.map(i => <text>{i}</text>);
}
```

---

### Error: `CDPQuickjs::sendCDPNetResponseEventFromFeature` crash / Data Abort

**Cause:** Using Promise-style `.then().catch()` with `fetch.fetch()` can trigger a null pointer crash in the emulator's Chrome DevTools Protocol (CDP) network inspector layer.

**Solution:** Use traditional `success` / `fail` callback functions instead of Promise chains:

```tsx
// ✅ SAFE (callback style):
fetch.fetch({
  url: 'https://example.com',
  method: 'GET',
  responseType: 'text',
  success: function(res) { self.status = 'OK: ' + res.code; },
  fail: function(data, code) { self.status = 'FAIL: ' + code; }
});

// ❌ CRASHES EMULATOR (Promise style):
fetch.fetch({ url: '...', method: 'GET' })
  .then(res => { ... })    // Triggers CDP inspector panic
  .catch(err => { ... });
```

> [!CAUTION]
> This is a **known bug in the Xiaomi Vela emulator's CDP debugger** (NuttX ARM `arm_dataabort.c`). Physical devices may handle Promises correctly, but always use callbacks for maximum compatibility.

---

### Error: `Descendant Selector not supported`

**Cause:** QuickApp CSS does not support descendant selectors like `.parent .child`.

**Solution:** Use flat class selectors only:

```css
/* ❌ Not supported: */
.card .title { color: red; }

/* ✅ Supported: */
.card-title { color: red; }
```

---

### Warning: `'ComponentName' is defined but never used`

**Cause:** A component was imported but not rendered in the template. This is a non-blocking warning from `aiot build`.

**Solution:** Remove unused component imports or ignore the warning if the component is conditionally rendered.
