# 09. React → Vela Mapping & Platform Limits

Kovo compiles React-style components onto **native Vela ViewModel features**. This page lists every mapping the compiler performs and the Vela limits it enforces. The limits come from the official Vela JS docs (`guide/framework/*`, `components/general/style`, `guide/best-practice/memory`).

---

## 🧠 1. Script mapping

| You write (TSX) | Kovo emits (`.ux`) |
| :--- | :--- |
| `const [x, setX] = useState(1)` in a **page** | `protected: { x: 1 }` (in-app router params can override it) |
| `const [x, setX] = useState(1)` in a **component** | `data: { x: 1 }` |
| `useState(prop)` / any non-constant initial value | `x: null` + `onInit() { this.x = this.prop }` |
| `setX(v)` (anywhere: callbacks, expressions, `function(){}`) | `this.x = v` |
| `setX(prev => prev + 1)` | `this.x = this.x + 1` |
| `setX(prev => { ... })` | `this.x = (prev => { ... })(this.x)` |
| `setX` passed as a value | `v => this.x = typeof v === "function" ? v(this.x) : v` |
| `const total = a + b` (reads state/props) | `computed: { total() { return this.a + this.b } }` |
| `useMemo(() => ..., deps)` | `computed` |
| `useCallback(fn, deps)` | method |
| `function f() {}` / `const f = () => {}` | method (`f() { ... }`) |
| constant read by the template | `data` / `protected` entry |
| constant not read by the template | module-level `const` (not in the ViewModel) |
| module helper read by the template (`{fmt(x)}`) | bridged as a method (`fmt,`) |
| `useRef()` attached with `ref={r}` | `id="r"`, `r.current` → `this.$element('r')` (uses an explicit `id` if present) |
| `useRef(0)` not attached to JSX | plain field: `this.r = { current: 0 }` in `onInit` |
| `useEffect(fn, [])` | body inlined in `onInit` (or `onReady` when it touches a DOM ref) |
| `useEffect(fn, [a, obj.b])` | `kovoEffectN()` + `this.$watch('a', 'kovoEffectN')` |
| `useEffect(() => { ...; return cleanup })` | cleanup runs before re-runs and in `onDestroy` |
| child prop `onSelect` + `onSelect(a, b)` | `this.$emit('select', { kovoArgs: [a, b] })` |
| parent `<Child onSelect={fn} />` | `@select="kovoHandlerN"` → `fn(...kovoArgs(evt))` |
| custom hook `useX()` (same file or relative import) | inlined; params substituted, `const { a: b } = useX()` renames; the hook module's imports and helpers are copied into the page, and the hook import is dropped |
| TypeScript props `({ title }: { title: string })` | `props: { title: { type: String } }` |

Rewriting is **scope-aware** (Babel bindings): parameters, local variables, object keys and strings that share a name with state are never touched. Inside nested `function () {}` callbacks Kovo uses a `const kovoSelf = this` alias.

---

## 🧩 2. Template mapping

| You write (TSX) | Kovo emits |
| :--- | :--- |
| `cond && <X/>` | `<X if="{{cond}}"/>` |
| `a ? <X/> : b ? <Y/> : <Z/>` | `if` / `elif` / `else` siblings |
| `list.map(i => <X key={i.id}/>)` | `<X for="{{i in list}}" tid="id"/>` |
| `list.map(({ id, name }) => ...)` | `for="{{kovoItem in list}}"`, `kovoItem.name` |
| `list.map(i => i.ok && <X/>)` | `<block for>` + `<X if>` (Vela evaluates `if` before `for` on one tag) |
| `cond && list.map(...)` | `<block if>` around the loop |
| `list.filter(f).map(...)` | the filter moves to a generated computed (`kovoComputedN`) |
| nested `<>...</>` | `<block>` (no extra node) — the root fragment still becomes `<div>` |
| `` {`Hi ${name}`} `` / `` className={`a ${b}`} `` | `Hi {{name}}` / `class="a {{b}}"` |
| `onClick={() => { a(); b(); }}` | generated method `kovoHandlerN`, loop variables passed as arguments |
| `onChange={(e) => save(e)}` | `@change="save"` (Vela appends the event object) |
| `<StatelessCard title="x" />` | **inlined** at compile time (see below) |

### Compile-time component inlining

Vela docs advise against custom components on watches because each one gets its own ViewModel. When an imported component is **stateless** (only props, derived constants and JSX, no hooks or functions, no nested custom components) Kovo copies its template into the parent with the props substituted and merges its `style`. No `<import>` and no extra ViewModel are produced.

Opt out per component with `export const inline = false;`, or for a whole build with the option `{ inline: false }`.

Stateful components keep the normal `<import name="..." src="....ux">` path.

---

## 🚫 3. Vela limits Kovo enforces

| Limit (official docs) | What Kovo does |
| :--- | :--- |
| Data/computed names cannot start with `$` or `_`; `for`, `if`, `show`, `tid` are reserved | compile error |
| `for` loop variables cannot start with `$` or `_` | compile error |
| `tid` only accepts a property name of the item | `key={item.prop}` → `tid="prop"`; anything else warns and falls back to the index |
| Templates cannot contain functions | hoisted to a computed, or a warning inside loops |
| Only `.class`, `#id`, `tag` and `,` selectors | warning for descendant, child, sibling, pseudo, attribute, `*` and `.a.b` selectors |
| `display` only supports `flex` and `none` | warning |
| No `<slot>` is documented | warning when children are passed to a component |
| Early `return` in a component | compile error — use a ternary in the returned JSX |
| Hooks imported from packages (non-relative paths) | warning — only same-file and relative-import hooks are inlined |

### Glyphs: no emoji in the watch font

The system font is a CJK font without emoji. Verified on the Vela emulator:

| Renders | Empty box |
| :--- | :--- |
| `← → ↑ ↓ ⇄` `● ○ ■ □ ▲ ▼ ◆ ★ ☆` `✓ ✕` `° ± × ÷ • · … — – € £ ¥ « »`, Chinese, Japanese | every emoji (`🔥 ⚡ ⌚ ⚙ ☀ ♥ ✔ ▶ ◀`…), `↻ ♡ ♪ ♫ ✗`, Korean |

Kovo warns when on-screen text (JSX text, attribute values, string and template literals outside `console.*`) contains a missing glyph and suggests a verified replacement (`✔ → ✓`, `🔄 → ⇄`, `⭐ → ★`, …). Use a PNG `<image>` for real icons (`<image>` supports png and jpg). Disable the check with the option `{ checkGlyphs: false }`.

Use `export const styleLang = 'less'` (or `'scss'`) to emit `<style lang="...">`; the CSS lint is skipped for preprocessed styles.

---

## ⚙️ 4. Vela optimization guide, applied automatically

Watches have little memory; Vela closes apps that use too much of it. Kovo applies the official recommendations (`guide/best-practice/memory`, `guide/best-practice/start`, `guide/other/tips`) at compile time:

| Guide recommendation | What Kovo does |
| :--- | :--- |
| Keep non-UI data out of the ViewModel | Constants the template does not read stay module-level. **Component** state that the template, computed values and watched deps never read becomes a plain field (`this.x`, no observers). **Page** state like that triggers a warning instead, because it may receive a router param: use `useRef()` for it. |
| Update objects in place instead of reassigning | `setList([...list, x])` → `this.list.push(x)`, `setList([x, ...list])` → `this.list.unshift(x)` |
| Mark data that never changes as `static` | Nodes whose bindings only read constants (or items of a constant list) get the `static` attribute |
| Clear timers on destroy | Effect cleanups run in `onDestroy`; a `setInterval` inside an effect without a cleanup warns |
| Remove unused CSS | Rules for classes the template never uses are dropped (inlined components bring their whole stylesheet). Skipped when a class name is only known at runtime |
| Avoid custom components on watches | Stateless components are inlined |
| `image` `src` must be one binding | `` src={`/img/${x}.png`} `` → `src="{{'/img/' + x + '.png'}}"` |
| Minimize logs, use PNG8, declare features | `bun run release` builds with `--drop-console log,info,debug --enable-image-png8 --complete-feature`; `aiot:build` uses `--complete-feature` so a missing `system.*` feature cannot break calls |

Opt out per build with the options `{ autoStatic: false, trimData: false, inPlaceUpdates: false, pruneCss: false }`.

### Release builds

`bun run release` produces `dist/<package>.release.<version>.rpk`. It must be signed with **your** key in `./sign` (`private.pem` + `certificate.pem`, ignored by git). Create it once and back it up — updates must use the same key:

```bash
mkdir sign && cd sign
openssl req -newkey rsa:2048 -nodes -keyout private.pem -x509 -days 3650 -out certificate.pem
```

### Still up to you

- Paginate lists longer than ~10–20 items; lazy-load swiper images.
- Store only the fields you need from network responses, not whole payloads.
- Avoid `setTimeout` before the first navigation and HTTP requests on the logo page (first paint must be ≤ 2 s).
- Prefer images already sized for the screen (≤ 200 KB) and fewer `border-radius` on images.

---

## ⚠️ 5. Behaviour differences from React

- **The dev watcher rebuilds importers.** Inlined components and hooks are baked into the files that use them, so `bun run dev` recompiles every importer when one of them changes. `.tsx` files without a default export (hook/helper modules) are not compiled on their own.
- **No re-render cycle.** A component body runs once at compile time. `useEffect` without a dependency array runs once (Kovo warns). Use `[deps]` to re-run through `$watch`.
- **Only state, props and computed values can be watched.** Other dependencies are ignored with a warning.
- **Event payloads.** Kovo children send `{ kovoArgs: [...] }`. Hand-written `.ux` children that `$emit('x', payload)` still work: the parent receives `payload` as its single argument.
- **Networking (`@system.fetch`) works with every React-style pattern** — callbacks (`function` or arrow), `.then()`, `async`/`await` and a `useFetch(url)` hook with `[url]` deps (verified on the emulator against a live API). Two Vela specifics: declare `{ "name": "system.fetch" }` in `manifest.json` features, and with promises/`await` the response is wrapped once more, so the body is at `res.data.data` (callbacks get it at `res.data`).
- **Pages have no props.** Router params arrive as page state (`protected`).
