# AGENTS.md — Building a Xiaomi Vela watch app with Kovo

> Instructions for AI coding agents (Claude Code, Codex, Cursor, Copilot, …) working in a Kovo project.
> Read this whole file before writing code. It is the contract between your code and what the watch can run.

Kovo compiles **React-style TSX** (function components + hooks) into **native Xiaomi Vela QuickApp `.ux` files** at build time. There is **no React at runtime**: the watch runs a small JS ViewModel (Vue-like: `data`, `computed`, `$watch`, `$emit`). Kovo maps React patterns onto it. Anything outside the supported subset below either fails to compile, produces a warning, or crashes on the watch.

Target devices: round/rect smartwatches (e.g. Xiaomi Watch S-series, Redmi Watch), **466×466 px design width**, very little memory. Vela **closes apps that use too much memory** — write small, flat, frugal code.

---

## 1. Golden rules (read these even if you read nothing else)

1. **Edit only `src-tsx/`.** `src/`, `build/` and `dist/` are generated and overwritten.
2. **A task is done only when** `bun run build` prints **no `[kovo]` warnings** and `bun run aiot:build` ends with `build success` and **no `🟠` lines** — except the toolkit's own `🟠 … please use AIoT-IDE …` notice, which is always printed and must be ignored. Treat every other warning as an error and fix it.
3. **One root element** per component, and **all text inside `<text>`** (or `<span>` inside `<text>`). Never put raw text in a `<div>`.
4. **No early returns** in components. Branch inside the returned JSX (`cond ? <A/> : <B/>`, `cond && <A/>`).
5. **Only flexbox.** CSS supports `.class`, `#id`, `tag` and comma lists — **no** descendant/child/sibling selectors, no `:hover`/pseudo-classes, no `*`, no `.a.b`. `display` is only `flex` or `none`.
6. **No emoji.** The watch font has none (they render as empty boxes). Use `← → ↑ ↓ ⇄ ● ○ ■ □ ▲ ▼ ◆ ★ ☆ ✓ ✕` or a PNG `<image>`.
7. **Declare every `@system.*` module** you import in `src-tsx/manifest.json` → `features` (`aiot:build` also auto-completes them). `@system.router` needs no declaration.
8. **Never name state, props or computed values** `for`, `if`, `elif`, `else`, `show`, `tid`, or anything starting with `$` or `_`.
9. **Keep memory low:** don't store whole API payloads (keep only needed fields), paginate lists (> 10–20 items), clean up timers in `useEffect` cleanups, prefer `useRef` for values the UI never shows.
10. **Custom components cost memory.** Prefer stateless components (props + JSX only): Kovo inlines them for free. Stateful components become real Vela components with their own ViewModel.

---

## 2. Project layout and commands

```
src-tsx/
  app.tsx                 # app lifecycle: export default { onCreate() {}, onDestroy() {} }
  manifest.json           # package, name, features, router.entry, config.designWidth (466)
  pages/<name>/<name>.tsx # each page; route is auto-registered as "pages/<name>"
  components/<Name>/<Name>.tsx
  hooks/*.ts              # custom hooks (inlined into callers; not emitted)
  lib/*.ts                # plain helpers/constants (emitted as .js)
  resources/              # images (png/jpg) and other static files
types/kovo.d.ts           # JSX + hook + @system typings
```

| Command | What it does |
| :--- | :--- |
| `bun run build` | `src-tsx/` → `src/` (`.ux` + `.js`), auto-registers pages in `manifest.json` |
| `bun run aiot:build` | build + official toolkit compile/lint → `dist/*.debug.*.rpk` |
| `bun run dev` | watch mode; recompiles a file and every file that imports it |
| `bun run dev:emulator` | build, boot the Vela emulator, install and launch the app, then watch |
| `bun run release` | optimized signed release (`--drop-console log,info,debug --enable-image-png8 --complete-feature`); needs `./sign/private.pem` + `certificate.pem` |
| `bun test` | project tests, if any |

**Verification loop (always):**

1. `bun run build` → fix every `[kovo] …` warning.
2. `bun run aiot:build` → must say `build success`; fix every `🟠` line (they are real runtime bugs: undefined variables, unsupported selectors…) **except** `please use AIoT-IDE`, an informational notice printed on every build. The log may show a `.temp_<project>` path; the final package is copied to `dist/`.
3. If you can, `bun run dev:emulator` and look at the screen.

Release signing key (once, keep it forever — updates must use the same key; `sign/` is git-ignored):

```bash
mkdir sign && cd sign
openssl req -newkey rsa:2048 -nodes -keyout private.pem -x509 -days 3650 -out certificate.pem
```

---

## 3. File kinds

| File | Rule |
| :--- | :--- |
| **Page** `pages/x/x.tsx` | `export default function X()` with **no props**. State becomes `protected` data, so **router params override state with the same name**. Params arrive as **strings** and are already set when effects first run (`onInit`). Declare them with a **literal** initial value (`const [id] = useState('')` — the setter is optional): a non-literal initial value is assigned in `onInit` and would overwrite the param. |
| **Component** `components/X/X.tsx` | `export default function X({ a = 1, onPick })` — destructured props with defaults; `on*` props are events. |
| **Hook module** `.ts`/`.tsx` without default export | `export function useX(...)`. Inlined into each caller at compile time (relative imports only). |
| **Helper module** `.ts`/`.js` | Plain functions/constants. Emitted as `.js`; import with relative paths. |
| **App** `app.tsx` | Object form only: `export default { onCreate() {}, onDestroy() {} }`. |

Styles: `export const style = \`...css...\`` in the same file (optionally `export const styleLang = 'less'`).

---

## 4. Canonical page

```tsx
import { useState, useEffect } from 'kovo-ux';
import router from '@system.router';
import fetch from '@system.fetch';            // needs { "name": "system.fetch" } in manifest features
import { useFetch } from '../../hooks/useFetch';

export const style = `
  .page { width: 466px; height: 466px; background-color: #06080c;
          flex-direction: column; align-items: center; justify-content: center; }
  .title { font-size: 26px; color: #38bdf8; font-weight: bold; }
  .row { font-size: 18px; color: #e2e8f0; }
  .btn { width: 200px; height: 52px; border-radius: 26px; background-color: #0c4a6e; color: #ffffff; font-size: 18px; }
`;

const API = 'https://example.com/api';

export default function Home() {
  const [page, setPage] = useState(1);
  // refetches when page changes; `pick` keeps only the fields the UI renders (memory rule 9)
  const { data: items, loading, error } = useFetch(
    `${API}/items?page=${page}&limit=10`,
    (res) => res.items.map((it) => ({ id: it.id, name: it.name })),
  );

  function openItem(id: number) {
    router.push({ uri: 'pages/detail', params: { id } });                 // arrives as the string "id"
  }

  return (
    <div className="page">
      <text className="title">Items {page}</text>
      {loading && <text className="row">Loading…</text>}
      {error ? <text className="row">Network error</text> : null}
      {(items || []).map((it) => (
        <text key={it.id} className="row" onClick={() => openItem(it.id)}>{it.name}</text>
      ))}
      <input className="btn" type="button" value="Next →" onClick={() => setPage(page + 1)} />
    </div>
  );
}
```

```ts
// hooks/useFetch.ts
import { useState, useEffect } from 'kovo-ux';
import fetch from '@system.fetch';

// `pick` trims the response before it is stored: keep only what you render.
// Pass '' as url to skip fetching (e.g. while a router param is still empty).
export function useFetch(url: string, pick?: (body: any) => any) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!url) return;
    setLoading(true);
    setError('');
    fetch.fetch({
      url,
      responseType: 'json',
      success: (res) => { setData(pick ? pick(res.data) : res.data); setLoading(false); },
      fail: (msg, code) => { setError('fail ' + code); setLoading(false); },
    });
  }, [url]);
  return { data, loading, error };
}
```

Hooks are inlined at compile time, so passing an arrow function (`pick`) or any expression as an argument is free — it is substituted into the hook body.

```tsx
// pages/detail/detail.tsx — receives { id } from router.push(...)
export default function Detail() {
  const [id] = useState('');   // router param: literal initial value, setter optional
  const { data: post, loading } = useFetch(
    id ? `${API}/items/${id}` : '',
    (p) => ({ title: p.title, body: p.body }),
  );
  return (
    <scroll className="page" scroll-y={true}>
      <text className="title">{loading ? 'Loading…' : post && post.title}</text>
      <text className="row">{post ? post.body : ''}</text>
      <input className="btn" type="button" value="← Back" onClick={() => router.back()} />
    </scroll>
  );
}
```

---

## 5. React → Vela: what works

| You write | Becomes |
| :--- | :--- |
| `const [x, setX] = useState(v)` | page: `protected: { x }` · component: `data: { x }` (non-constant initial values are set in `onInit`) |
| `setX(v)` anywhere (callbacks, `function(){}`, expressions, timers) | `this.x = v` |
| `setX(p => p + 1)` | `this.x = this.x + 1` |
| `setList([...list, a])` / `setList([a, ...list])` | `this.list.push(a)` / `this.list.unshift(a)` (in-place, memory guide) |
| `const total = a + b` (reads state/props) | `computed` |
| `useMemo(() => …, deps)` | `computed` |
| `useCallback(fn, deps)` / inner `function f(){}` / `const f = () => {}` | method |
| `useRef()` with `ref={r}` on an element | `r.current` → `this.$element('r')` (DOM node methods: `focus()`, `scrollTo()`, `getBoundingClientRect()`…) |
| `useRef(0)` not attached to JSX | plain non-reactive field `this.r = { current: 0 }` |
| `useEffect(fn, [])` | runs in `onInit` (in `onReady` if it touches a DOM ref) |
| `useEffect(fn, [a, obj.b, \`${x}\`])` | runs once, then re-runs via `$watch` on every state/prop/computed it reads |
| `useEffect(() => { …; return cleanup }, …)` | cleanup runs before re-runs and in `onDestroy` |
| `useLayoutEffect` | same as `useEffect` |
| Custom hook `useX()` (same file or relative import) | inlined; destructuring aliases rename (`const { a: b } = useX()`) |
| Child prop `onSelect` called as `onSelect(a, b)` | `this.$emit('select', …)`; parent `onSelect={fn}` receives `(a, b)` |
| TS prop types (`{ title: string }`) | `props: { title: { type: String } }` |
| Module-level constants/helpers used in JSX | bridged onto the ViewModel automatically |

## 6. What does NOT work (and what to do instead)

| Not supported | Use instead |
| :--- | :--- |
| Early `return` in a component | Ternary / `&&` inside the single returned JSX |
| `useContext`, `useReducer`, `useId`, `useTransition`, `useDeferredValue`, context providers, portals, `memo`, `forwardRef` | Props + events; shared app data via `app.tsx` (`this.$app.$def` in hand-written code) or a helper module |
| `useEffect` without deps expecting re-runs after every render | There is no render loop. Pass explicit `[deps]` |
| Spread props `{...props}`, `{...style}`, spread children | Pass props explicitly |
| `children` / slots | No `<slot>` in Vela. Pass data as props |
| Hooks from npm packages | Copy the hook into `src-tsx/hooks/` (only relative imports are inlined) |
| Class components | Function components |
| `className` computed from arbitrary runtime strings (`className={cls}`) | Works, but disables unused-CSS pruning for the file; prefer `cond ? 'a' : 'b'` |
| Functions inside JSX bindings inside loops (`items.map(i => <text>{i.tags.filter(f).length}</text>)`) | Precompute in a derived value (computed) |
| `key` with expressions (`key={'k' + i.id}`) | `key={item.prop}` (becomes `tid="prop"`) |
| `display: block/grid`, CSS grid, floats, `position: fixed` | Flexbox (`flex-direction`, `justify-content`, `align-items`), `<stack>` for overlays |
| Emoji, Korean text, `↻ ♡ ♪ ✗` | Supported glyphs or PNG icons |
| Node APIs (`fs`, `path`, `Buffer`), `window`, `document`, `localStorage` | `@system.file`, `@system.storage` |
| `<input type="text">` / keyboard input | Not available on the watch: use buttons, `picker`, `slider`, or receive text from the phone via `interconnect` |

---

## 7. JSX rules

- **Elements:** `div`, `text`, `span` (inside `text`), `image` (png/jpg only), `input` (`type`: `button`, `checkbox`, `radio` only — there is no text input on the watch), `stack`, `scroll`, `list` + `list-item`, `swiper`, `slider`, `switch`, `picker`, `progress`, `marquee`, `chart`, `qrcode`, `barcode`, `image-animator`, `block`. Official reference: https://iot.mi.com/vela/quickapp/en/components/
- **Events:** `onClick`, `onLongPress`, `onSwipe`, `onTouchStart/Move/End/Cancel`, `onChange`, `onFocus`, `onBlur`, `onAppear`, `onDisappear`, `onScroll`, `onKey`; any other `onFooBar` becomes the Vela event `@foobar` (e.g. `onScrollBottom` on `<list>`, `onSwipeStart`/`onSwipeEnd` on `<swiper>` — check the component page for its event names). Inline arrows are fine (Kovo generates methods and passes loop variables). `(e) => save(e)` passes the event object.
- **Lists:** `{list.map((item, i) => <X key={item.id} …/>)}`. The callback body must be one JSX element (or `cond && <X/>`, a ternary, or `{ return <X/>; }`). Destructuring `({ id, name }) =>` works. Loop variable names cannot start with `$`/`_`.
- **Conditionals:** `cond && <X/>` → `if`; ternary chains → `if/elif/else`; `show={x}` hides without removing the node (cheaper for frequent toggles).
- **Fragments** `<>…</>` are fine when nested (become `<block>`); a root fragment becomes a `<div>`.
- **Attributes:** `className` (or `class`), `style` as string or object (`{{ width: '100px' }}`), template literals work in text and attributes. `image src` with a template literal is fine (compiled to one binding).
- **Refs:** `ref={myRef}` sets the element `id` (an explicit `id="x"` wins).
- **Dynamic components:** `<component is={name} />` with imported components.

## 8. Scrolling and long content

The screen is 466×466. Anything taller does not scroll by itself:

- **Scrollable page:** make the root (or a child) a `<scroll scroll-y={true}>` with a fixed height (e.g. the `.page` class with `height: 466px`) and `flex-direction: column`. `scroll` exists from API level 2 (see §10 API levels).
- **Long uniform lists:** use `<list>` with `<list-item type="row">` children (all items must share the same structure; avoid `if`/`show` inside `list-item`). Render at most 10–20 items and load more on demand (a "More" button, or `onScrollBottom` on the `<list>`).
- **Many images in a `swiper`:** keep ~3 slides and swap their data while swiping.
- Long legal text: split it into chunks rendered progressively, or show a QR code instead.

## 9. Styling

- Design width is set in `manifest.json` (`config.designWidth`, 466 in the templates); sizes in `px` scale with the screen. `dp` units need API level 3+ (§10 API levels).
- Selectors: `.class`, `#id`, `tag`, `a, b`. Anything else is ignored by the device (Kovo warns).
- Layout: everything is a flex container; default `flex-direction` is row — set `flex-direction: column` explicitly on vertical containers.
- `border-radius` on images and large dynamic styles cost frame rate: prefer pre-rounded images sized exactly to the component.
- Unused classes are removed from the compiled CSS automatically.

---

## 10. System APIs (`@system.*`)

Import: `import fetch from '@system.fetch'`. Callbacks: `success(data)`, `fail(data, code)`, `complete()`. `fetch` also returns a Promise (the resolved value wraps the response: `res.data.data`). For callback-only APIs such as `storage`, wrap them in a Promise yourself (see the `promisify` helper in the official startup guide) if you want `await`.

| Module | Manifest feature | Docs |
| :--- | :--- | :--- |
| router (`push`, `replace`, `back`, `clear`, `getLength`, `getState`, `getPages`) | none | features/basic/router |
| app | none | features/basic/app |
| device | `system.device` | features/basic/device |
| fetch | `system.fetch` | features/network/fetch |
| request (download/upload) | `system.request` | features/network/request |
| uploadtask (API 3+) | `system.uploadtask` | features/network/uploadtask |
| interconnect (phone ↔ watch) | `system.interconnect` | features/network/interconnect |
| storage (key/value) | `system.storage` | features/data/storage |
| file | `system.file` | features/data/file |
| prompt (`showToast`) | `system.prompt` | features/other/prompt |
| audio | `system.audio` | features/other/audio |
| record | `system.record` | features/system/record |
| vibrator | `system.vibrator` | features/system/vibrator |
| sensor | `system.sensor` | features/system/sensor |
| geolocation | `system.geolocation` | features/system/geolocation |
| battery | `system.battery` | features/system/battery |
| brightness | `system.brightness` | features/system/brightness |
| volume | `system.volume` | features/system/volume |
| network (connection info) | `system.network` | features/system/network |
| bluetooth (BLE) | `system.bluetooth.ble` | features/system/bluetooth |
| alarm | `system.alarm` | features/system/alarm |
| event (API 4+) | `system.event` | features/system/event |
| crypto | `system.crypto` | features/security/crypto |
| zip | `system.zip` | features/system/zip |
| protobuf | `system.protobuf` | features/other/protobuf |

Docs base URL: `https://iot.mi.com/vela/quickapp/en/` + the path above + `.html`.

**API levels.** The official docs tag newer features with `2+`, `3+` or `4+` (e.g. `scroll`, `qrcode`, `barcode`, `image-animator` and `device.getInfo().APILevel` are 2+; `box-shadow`, `dp` units, `$canIUse`, `uploadtask` are 3+; `@system.event` is 4+). Using one means the app needs a device with at least that level: set `"minAPILevel": N` in `src-tsx/manifest.json` (default 1; `minPlatformVersion` is a different, older field) so the store/device rejects incompatible watches, or check at runtime with `device.getInfo()` → `APILevel`.

**Gotchas:**
- **fetch:** `responseType: 'json'` gives an object in `res.data`; with `.then`/`await` it is `res.data.data`. `fail(msg, code)`. Some bands (Band 8 Pro, 9, 10, Redmi Watch 4) have **no network** — handle failure.
- **router params** are converted to **strings** and only reach the target page if a state with the same name exists (`const [id] = useState('')` in the target page, literal initial value). They are available when effects first run, so `useEffect(..., [id])` / `useFetch(id ? url : '')` work; convert with `Number(id)` when needed.
- **Screen-on re-triggers `onShow`** on the watch; Kovo uses `onInit` for effects, so fetches in effects do not repeat on wake.
- Capability checks: `this.$canIUse('@system.fetch')` in hand-written code; check `device.getInfo()` → `APILevel` (2+), `deviceType` (`watch`/`band`), `screenShape` (`rect`/`circle`/`pill-shaped`).

---

## 11. Performance and memory (Vela best-practice guide)

Kovo applies automatically: in-place array updates, `static` on constant nodes, unused-CSS removal, non-UI component state out of the ViewModel, inlining of stateless components, timer cleanups on destroy, release builds without logs and with PNG8.

You must still:
- Store **only the fields you render** from network responses.
- **Paginate** lists (≤ 10–20 items per page); for `swiper` with many images keep ~3 slides and swap data.
- Use **`useRef`** for page values the UI never shows (pages keep all state reactive so router params work; Kovo warns).
- Return a **cleanup** from effects that start timers/subscriptions (`return () => clearInterval(id)`).
- Keep first paint **≤ 2 s**: no `setTimeout` before the first navigation, no HTTP requests on a splash/logo page, show UI first and load data after.
- Images: local, sized to the screen, **≤ 200 KB**, PNG8 when possible; avoid large remote images.
- Avoid long/JSON `console.log`s (release builds drop `log/info/debug`).
- Prevent double taps on buttons that send requests (disable while `loading`).
- Wrap risky code in `try/catch`; show a message when there is no network.

---

## 12. Compiler messages → fix

| Message (contains) | Fix |
| :--- | :--- |
| `Early returns are not supported` | Move the branch into the returned JSX |
| `cannot start with $ or _` / `reserved Vela name` | Rename the state/prop/loop variable |
| `map() callback body must be a single JSX element` | Return one element (or `cond && <X/>`), move logic to a derived value |
| `Spread {...obj} is not supported` | Pass attributes explicitly |
| `CSS selector "…" uses …` | Give the element its own class; use one simple selector |
| `CSS "display: …" is not supported` | Use flexbox or `display: none` |
| `cannot draw … render as empty boxes` | Replace the characters (suggestions are in the message) or use `<image>` |
| `useEffect() without a dependency array` | Add `[]` or `[deps]` |
| `starts a setInterval without a cleanup` | `const id = setInterval(…); return () => clearInterval(id);` |
| `dependency "…" cannot be watched` | Depend on state/props/computed values |
| `Custom hook …() could not be inlined` | Use a relative import to a file in `src-tsx/`, or define it in the same file |
| `State "x" is never shown` (page) | `useRef` unless it receives a router param |
| `Children passed to <X>` | No slots: pass data as props |
| `<X> has no prop "y"` | Add the prop to the component or remove the attribute |
| `Statement ignored in component body` | Move it into a function or `useEffect` |
| `Component returns no JSX` | Wrap multi-line JSX after `return` in parentheses |
| `key={…} cannot become a Vela tid` | `key={item.someProperty}` |
| `Template expression … contains a function` | Precompute it as a derived value |
| `useContext() is not supported` (and similar) | Props/events or a helper module |
| toolkit `🟠 … is not defined` | Usually a value used before it exists — check the generated `src/**/*.ux` |

When something is unclear, open the generated `src/pages/<x>/<x>.ux` — it is readable and shows exactly what runs on the watch.

---

## 13. References

- Kovo mapping and limits: `docs/09-react-to-vela-mapping.md` in the Kovo repo (https://github.com/srsergi0/kovo)
- Official Vela JS docs: https://iot.mi.com/vela/quickapp/en/ (framework: `guide/framework/`, components: `components/`, APIs: `features/`, best practices: `guide/best-practice/`)
- Typings for JSX, hooks and `@system.*`: `types/kovo.d.ts`
