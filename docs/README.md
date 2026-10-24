# ⚡ Kovo: High-Performance React/TSX Engine for Xiaomi Vela Smartwatches

> **The ultimate developer guide and reference for building modern, reactive, ultra-fast Xiaomi Vela smartwatch applications using React-style TSX, Hooks, and modern web developer ergonomics.**

---

## 📌 Executive Summary

**Kovo** is an advanced compile-time JSX/TSX engine designed specifically for **Xiaomi Vela OS** (QuickApp smartwatch platform). It allows developers to write clean, modular, strongly-typed React functional components with custom hooks, `useState`, `useRef`, and standard CSS, transpiling them seamlessly into production-ready Xiaomi Vela `.ux` files.

---

## 📚 Documentation Index

| Module | Topic | Description |
| :--- | :--- | :--- |
| [01. Getting Started](./01-getting-started.md) | **Quick Start & Setup** | Prerequisites, project structure, zero-config emulator launcher, and building your first page. |
| [02. Compiler Architecture](./02-architecture-and-compiler.md) | **Deep Dive into AST Pipeline** | Babel transformation rules, custom hook inlining, top-level statement filtering, and Xiaomi Vela VM protocol compliance. |
| [03. JSX & Templates](./03-jsx-and-templates.md) | **Templating & Directives** | Conditional rendering (`if`/`elif`/`else`), list rendering (`.map()`), fragments, dynamic components (`<component is="..." />`), and event bindings (`@click`). |
| [04. State & Hooks](./04-state-and-hooks.md) | **State Management** | `useState`, `useRef`, auto-registration of top-level component variables, and custom hook composition. |
| [05. Styling & Design System](./05-styling-and-design-system.md) | **Smartwatch OLED Design** | 466x466 OLED dark mode aesthetics, pill buttons, stat cards, progress bars, and CSS extraction rules. |
| [06. System APIs & Networking](./06-system-apis-and-networking.md) | **Device APIs & Network** | Navigation (`@system.router`), haptics (`@system.vibrator`), HTTP requests (`@system.fetch`), and permissions manifest. |
| [07. Testing & CLI Tools](./07-testing-and-cli-tools.md) | **Test Suite & Hardware Deployment** | Running `bun run test` (250+ edge case tests), zero-config emulator auto-patching, and QR code deployment to physical watches. |
| [08. API Reference & Cheatsheet](./08-api-reference-and-cheatsheet.md) | **Reference & Troubleshooting** | Complete API cheat sheet, compiler flags, and solutions to common pitfalls (`need a array`, VM method binding, CDP debugger panics). |
| [09. React → Vela Mapping & Limits](./09-react-to-vela-mapping.md) | **Compiler Semantics** | How hooks, effects, events and JSX map onto native Vela features, compile-time component inlining, and the platform limits Kovo enforces. |
| [AI Agent App Guide](./ai/app-guide.md) | **For AI coding agents** | The `AGENTS.md` shipped in every project: rules, supported/unsupported patterns, APIs, performance rules and compiler message fixes. |

---

## ✨ Key Features at a Glance

- ⚛️ **Modern React Ergonomics**: Write functional components with `useState`, `useRef`, and custom hooks.
- ⚡ **Zero-Runtime Overhead**: Hooks and state setters are completely inlined into native QuickApp VM data structures at build time.
- 🛡️ **Xiaomi Vela OS VM Compliant**: Generates top-level method bindings on `export default` for 100% native execution speed.
- 🎨 **466x466 OLED Dark Mode System**: Beautiful glowing neon pill buttons, stat cards, and status bars out of the box.
- 📡 **Robust Network Integration**: Safe `@system.fetch` integration with support for GET, POST (JSON), PUT, and DELETE methods.
- 🧪 **Ultra-Robust Test Suite**: Covered by 250+ automated unit and integration tests (`bun run test`).
- ⌚ **Zero-Config Emulator & QR Hardware Deploy**: Automatically launches Redmi Watch / Xiaomi Watch S4 emulators and generates instant QR codes for physical watches.

---

## 🚀 Quick Command Reference

```bash
# 1. Install dependencies
bun install

# 2. Transpile TSX to Xiaomi Vela .ux files
bun run build

# 3. Launch live hot-reloading smartwatch emulator
bun run dev:emulator

# 4. Build native signed .rpk binary for production
bun run aiot:build

# 5. Run full compiler unit test suite (250+ tests)
bun test
```
