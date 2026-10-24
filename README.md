# ⌚ Kovo

**Write Xiaomi Vela smartwatch apps with React-style TSX, Hooks & modern tooling.**

Kovo is a compile-time engine that transforms standard React functional components (`useState`, `useRef`, custom hooks) into native Xiaomi Vela QuickApp `.ux` files — with zero runtime overhead.

---

## ⚡ Quick Start

Scaffold a new project instantly:

```bash
npx create-kovo-ux
```

```text
      ⌚  create-kovo-ux v0.1.0

  ◆  What is your project name?
  │  my-watch-app
  │
  ◆  Which template would you like to use?
  │  ● Basic — Single page, counter, minimal setup
  │  ○ Multi-Page — Dashboard with navigation, components & settings
  │  ○ Fetch — Multi-page + HTTP networking (GET, POST, PUT, DELETE)
  │
  ◆  Install dependencies?
  │  Yes
  │
  ■  Done! Your Kovo project is ready. ⌚
```

Then launch the live smartwatch emulator:

```bash
cd my-watch-app
bun run dev:emulator
```

---

## ✨ Features

- ⚛️ **React-style TSX** — Write functional components with `useState`, `useRef`, and custom hooks
- 🔄 **Zero-runtime overhead** — All hooks are inlined at compile time into native QuickApp VM objects
- 🎨 **OLED-optimized design** — 466x466 dark mode UI with vibrant neon accents out of the box
- 📡 **Network integration** — `@system.fetch` support with GET/POST/PUT/DELETE
- 🧪 **250+ automated tests** — Comprehensive compiler test suite
- ⌚ **Zero-config emulator** — Auto-detects, patches, and launches Vela Virtual Devices
- 📱 **QR deploy to real watches** — Push apps to physical Xiaomi smartwatches via Bluetooth

---

## 📦 Templates

| Template | Description |
| :--- | :--- |
| **Basic** | Single page counter with `useState` and haptic feedback |
| **Multi-Page** | Dashboard, settings, demo pages, `StatCard` component, router navigation |
| **Fetch** | Everything in Multi-Page + HTTP networking page (GET, POST, PUT, DELETE) |

---

## 🛠️ Commands

```bash
bun run dev:emulator     # Launch live hot-reloading emulator
bun run build            # Transpile TSX → .ux files
bun run aiot:build       # Build debug .rpk
bun run release          # Optimized, signed release .rpk (needs a ./sign key)
bun run test             # Run 250+ compiler tests
```

---

## 📖 Write Your First Page

```tsx
import { useState } from 'kovo-ux';
import vibrator from '@system.vibrator';

export const style = `
  .page {
    width: 466px; height: 466px;
    background-color: #06080c;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }
  .title { font-size: 22px; color: #38bdf8; font-weight: bold; }
  .btn { width: 200px; height: 48px; border-radius: 24px;
    background-color: #052e16; border-color: #16a34a;
    color: #4ade80; font-size: 15px; font-weight: bold; }
`;

export default function MyPage() {
  const [count, setCount] = useState(0);

  function increment() {
    setCount(count + 1);
    vibrator.vibrate({ mode: 'short' });
  }

  return (
    <div className="page">
      <text className="title">Count: {count}</text>
      <input className="btn" type="button" value="+1" onClick={increment} />
    </div>
  );
}
```

This compiles to a native `.ux` file with `protected: { count: 0 }` (page state) and top-level methods — zero runtime overhead!

---

## 📚 Documentation

See the full documentation in [`docs/`](./docs/README.md):

- [Getting Started](./docs/01-getting-started.md)
- [Compiler Architecture](./docs/02-architecture-and-compiler.md)
- [JSX & Templates](./docs/03-jsx-and-templates.md)
- [State & Hooks](./docs/04-state-and-hooks.md)
- [Styling & Design](./docs/05-styling-and-design-system.md)
- [System APIs & Networking](./docs/06-system-apis-and-networking.md)
- [Testing & CLI Tools](./docs/07-testing-and-cli-tools.md)
- [API Reference & Cheatsheet](./docs/08-api-reference-and-cheatsheet.md)
- [React → Vela Mapping & Limits](./docs/09-react-to-vela-mapping.md)

---

## ⌚ Supported Devices

| Device | Network | QuickApp |
| :--- | :--- | :--- |
| Xiaomi Watch S4 / S5 | ✅ | ✅ |
| REDMI Watch 5 / 6 | ✅ | ✅ |
| Xiaomi Watch S3 | ✅ | ✅ |
| Xiaomi S1 Pro | ✅ | ✅ |
| Redmi Watch 4 | ❌ | ✅ |
| Xiaomi Band 8-10 | ❌ | ⚠️ |

---

## 📄 License

MIT
