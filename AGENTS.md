# AGENTS.md — Working on the Kovo repository

> For AI coding agents. Two kinds of work happen here:
> - **Writing app code** (the demo in `src-tsx/` or a template in `create-kovo-ux/templates/*/src-tsx/`): follow **[docs/ai/app-guide.md](docs/ai/app-guide.md)** — it is the same file every scaffolded project gets as its `AGENTS.md`.
> - **Changing the compiler/tooling**: follow this file.

## What this repo is

Kovo compiles React-style TSX (function components + hooks) into native Xiaomi Vela QuickApp `.ux` files at build time — no runtime. It is published as two npm packages:

- `kovo-ux` (repo root): the compiler (`scripts/babel-plugin-vela-ux.js`), build scripts and typings.
- `create-kovo-ux` (`create-kovo-ux/`): the scaffolder; templates live in `create-kovo-ux/templates/` (`_shared/` + `basic`, `multi-page`, `fetch`).

## Map

| Path | Role |
| :--- | :--- |
| `scripts/babel-plugin-vela-ux.js` | The compiler. Entry `buildUxContent(source, filename, options)`; also `compileScriptModule` for `.ts/.js` helpers and a Babel plugin wrapper |
| `scripts/build-jsx.js` | Walks `src-tsx/`, dependency order, writes `src/` (`.ux` + `.js`), `findAffectedFiles` for the watcher |
| `scripts/copy-static.js` | Copies resources and auto-generates `manifest.json` routes from `src-tsx/pages/` |
| `scripts/dev.js`, `dev-emulator.js` | Watcher (rebuilds importers) and emulator launcher |
| `simulator/` | Browser simulator prototype (`bun run sim`): runs the toolkit's `build/` output with a DOM implementation of `aiot.__ce__/__cf__/__ci__`, see `docs/10-browser-simulator.md` |
| `scripts/release.js` | Signed optimized release via `aiot release` |
| `scripts/sync-templates.js` | Copies canonical files into `create-kovo-ux/templates/_shared/` |
| `types/kovo.d.ts` | JSX intrinsic elements, hooks, `@system.*` typings |
| `docs/` | Human docs; `docs/09-react-to-vela-mapping.md` is the semantic reference; `docs/ai/` holds agent guides |
| `src-tsx/` | Demo app compiled by `bun run build` |

## Compiler architecture (babel-plugin-vela-ux.js)

1. Parse TSX → collect prop types from TS annotations → `stripTypes` → `checkGlyphs`.
2. Function components: `analyzeFunctionComponent` builds a **model** (`props`, `eventProps`, `state`, `setters`, `refs`, `computed`, `methods`, `constants`, `effects`, `hoisted`). Custom hooks are inlined (`inlineHook`, `resolveHook` handles relative imports and copies module dependencies via `importModuleDependency`).
3. Template: `serializeJSXElement` & co. with a `ctx` (loops stack, component model, class tracking). Inline handlers → `kovoHandlerN` methods; functions in bindings → `kovoComputedN`; stateless imported components inlined (`loadInlineComponent`).
4. Script: `buildFunctionScript` emits `props`, `data`/`protected`, `computed`, methods, effects (`kovoEffectN`, `kovoCleanupN`, `$watch`), lifecycles. Every function body goes through **`rewriteFunction`** — scope-aware (Babel bindings), never regex: state → `this.x`, setters → assignments / `push` / `unshift`, DOM refs → `this.$element()`, event props → `$emit({ kovoArgs })`, nested `function(){}` → `kovoSelf`.
5. Output assembly: `<import>` tags, template, CSS (lint + unused-class pruning), script (imports, helpers, hoisted constants, export default).

Object-style components (`export default { data, template, … }`) take the legacy path and are passed through mostly unchanged.

## Rules for changes

- **Never regex-rewrite JS.** Use Babel AST + scope (`rewriteFunction`, `path.scope`). Template-only substitutions may use `rewriteTree`/`substituteIdentifiers`.
- **Respect Vela limits** (official docs mirrored in the maintainer's `vela-docs/`, online at https://iot.mi.com/vela/quickapp/en/): single root, text only in `<text>`, `if` beats `for` on one tag, `tid` takes a property name, no `$`/`_` names, CSS subset, no emoji glyphs, memory guide.
- Generated names use the `kovo` prefix (`kovoHandlerN`, `kovoEffectN`, `kovoCleanupN`, `kovoComputedN`, `kovoSelf`, `kovoArgs`, `kovoItem`) — never `$`/`_`.
- New behaviour needs a test in `scripts/react-semantics.test.js` (or `build-jsx.test.js` for build tooling). Optimizations must be switchable through `options`.
- After editing any file listed in `scripts/sync-templates.js`, run **`node scripts/sync-templates.js`** (a test fails otherwise). `docs/ai/app-guide.md` is synced to the templates as `AGENTS.md`.
- Keep `docs/09-react-to-vela-mapping.md` and `docs/ai/app-guide.md` in sync with compiler behaviour.

## Verify

```bash
bun run test          # node --test over all suites (must be green)
bun run build         # demo app: no [kovo] warnings expected
bun run aiot:build    # official toolkit compile + lint: "build success", no 🟠 lines
```

Templates: copy `_shared` + a template into a temp dir, link `node_modules`, run `node scripts/copy-static.js && node scripts/build-jsx.js && aiot build --complete-feature`.

Runtime (when a Vela emulator is installed): `bun run dev:emulator`, or install manually with adb:

```bash
MSYS_NO_PATHCONV=1 adb -s emulator-5554 push dist/<pkg>.debug.1.0.0.rpk /data/app/<pkg>.rpk
adb -s emulator-5554 shell pm install /data/app/<pkg>.rpk
adb -s emulator-5554 shell am stop <pkg>; adb -s emulator-5554 shell am start <pkg>   # start twice if the screen stays black
adb -s emulator-5554 emu screenrecord screenshot <dir>                               # screenshot without window focus
```

Avoid `pm uninstall` on the emulator (it can freeze the Vela shell; restart the emulator if `adb shell` stops answering). A self-checking page that renders `OK`/`FAIL` per feature is the fastest runtime test.

## Commits

Conventional commits (`feat(compiler): …`, `fix(compiler): …`, `docs: …`). Explain the Vela constraint behind a change in the body.
