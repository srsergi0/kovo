# Browser simulator (prototype)

Run a Kovo app in the browser in seconds, without booting the Vela emulator.

```bash
bun run aiot:build     # produces build/ (the toolkit output that goes into the .rpk)
bun run sim            # http://localhost:4466
```

Options: `node simulator/server.js --dir <build dir> --port <port>`.

## How it works

The simulator does not re-implement the `.ux` compiler. It runs the exact JavaScript that `aiot build` writes to `build/` — the same code that is packed into the `.rpk`:

- Each page is a bundle whose template is a render function calling `aiot.__ce__` (element), `__cf__` (for), `__ci__` (if), `__cb__` (block) and `__cc__` (component). `simulator/public/runtime.js` implements those primitives on the DOM.
- The ViewModel (`data`/`protected`, `computed`, `$watch`, `$emit`, `$element`, lifecycles) is rebuilt on a small reactivity core (`simulator/public/reactivity.js`), batched per microtask like the device.
- Compiled CSS (`$app_style$`) is turned back into scoped CSS; Vela layout defaults are applied with zero specificity (every element is a flex container, `row`, `align-items: stretch` as measured on the device).
- `@system.*` modules are simulated in `simulator/public/system.js`: `router` (real page stack, params as strings), `fetch` (real requests through a CORS-free dev-server proxy, `res.data.data` with promises), `storage` (localStorage), `prompt`, `vibrator` (frame shake), `device` (current profile), `app`, `interconnect` (phone panel in the sidebar), `sensor` (synthetic values), `battery`, `network`. Unknown modules log "not simulated" and call `fail`.

The page reloads automatically when `build/` changes.

Device profiles: round 466, rect 432×514 (Vela emulator), rect 390×450, band 212×520. `designWidth` from the manifest scales `px` as on the watch.

### Scripted checks

`?run=` drives taps for automated screenshots, e.g.

```
http://localhost:4466/?device=rect-432x514&static=1&run=click:.btn-step;wait:300;click:.btn-toggle
```

`static=1` disables live reload (needed for headless Chrome `--screenshot`). Steps: `click:<css selector>`, `wait:<ms>`, `back`.

## Verified

Against the Vela emulator: the review self-check page renders the same 5/5 `OK` and quoting results, and the demo app matches the emulator layout (including the `LIST` button overflow) with working `if`, lists, events, page navigation and `fetch`.

## Not simulated yet (prototype limits)

- Custom components (`__cc__`, stateful components with their own ViewModel) render as a placeholder; stateless components are inlined by Kovo and work.
- Exact text metrics and the watch font, LVGL rendering details, animations/keyframes, `swiper`/`picker`/`chart`/`qrcode` behaviour, crown/key events.
- Memory limits and performance. The device runs QuickJS with an 8 MB limit and closes apps that exceed it; use the emulator or a watch to check memory.

Treat the simulator as a fast feedback loop; the emulator or a real watch remains the reference before release.
