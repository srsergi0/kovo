# 07. Testing & CLI Tools

This document covers the **Kovo automated test suite**, the **zero-config emulator launcher**, and **deploying to physical Xiaomi smartwatches**.

---

## 🧪 1. Compiler Unit Test Suite

Kovo ships with **230+ automated tests** across four test files that exhaustively validate every compiler transformation, edge case, and error path.

### Running Tests

```bash
bun test
```

Expected output:

```text
scripts\babel-plugin-vela-ux.test.js:
(pass) React Functional Components > functional component with useState...
(pass) React Functional Components > custom hook inlining (useCounter)...
(pass) CRUEL: conditional rendering > ternary with if/else...
...

scripts\hpd.test.js:
(pass) HPD: Producción > 1. app.tsx sin template...
(pass) HPD: Producción > 2. contador completo...
...

 168 pass
 0 fail
Ran 168 tests across 2 files. [540.00ms]
```

### Test File Structure

| File | Purpose | Test Count |
| :--- | :--- | :--- |
| `scripts/babel-plugin-vela-ux.test.js` | Core compiler transformations, edge cases, error paths, React hooks, dynamic components, event handlers, unicode, fragments, boolean attributes | ~125 |
| `scripts/hpd.test.js` | Full production integration tests: real-world app scenarios, lifecycle hooks, watchers, computed, cross-file components, source maps | ~43 |

### Test Categories Covered

- **State & Hooks**: `useState` inlining, `useRef` DOM access, custom hook composition
- **JSX Serialization**: Conditional rendering (`if`/`else`/`elif`), `.map()` loops, fragments, dynamic `<component is="..." />`
- **Event Handlers**: `onClick`, `onChange`, multi-argument handlers, anonymous functions
- **Style Extraction**: Multiline CSS strings, template literals, error on non-string styles
- **VM Compliance**: Top-level methods (NOT inside `methods: {}`), lifecycle hooks (`onInit`, `onReady`, `onShow`, `onHide`, `onDestroy`)
- **Import Resolution**: `@system.*` modules, extensionless component imports, `<import>` tag positioning
- **Error Handling**: Friendly error messages with filename, line numbers, invalid patterns (spread, missing imports)
- **Source Maps**: `sectionRanges` generation, `lineMap` `.ux` → `.tsx` line mapping

### Writing a New Test

```javascript
// scripts/babel-plugin-vela-ux.test.js
const { transformVelaUx } = require('./babel-plugin-vela-ux');

test('my new feature works correctly', () => {
  const input = `
    import { useState } from 'kovo-ux';

    export const style = \`
      .page { width: 466px; height: 466px; }
    \`;

    export default function MyPage() {
      const [value, setValue] = useState(42);

      function increment() {
        setValue(value + 1);
      }

      return (
        <div className="page">
          <text>{value}</text>
          <input type="button" value="Inc" onClick={increment} />
        </div>
      );
    }
  `;

  const result = transformVelaUx(input, { filename: 'test.tsx' });

  // Verify template output
  expect(result.template).toContain('<text>{{value}}</text>');
  expect(result.template).toContain('@click="increment"');

  // Verify script output
  expect(result.script).toContain('data: { value: 42 }');
  expect(result.script).toContain('increment()');
  expect(result.script).toContain('this.value = this.value + 1');

  // Vela OS compliance: methods must NOT be inside methods: {}
  expect(result.script).not.toMatch(/methods\s*:\s*\{/);
});
```

---

## 🚀 2. Zero-Config Emulator Launcher (`dev-emulator.js`)

The emulator launcher script (`scripts/dev-emulator.js`) provides a **fully automated workflow** that handles everything from TSX compilation to live hot-reloading on the smartwatch emulator.

### What It Does (In Order)

1. **`bun run build`**: Transpiles all TSX files → `.ux` files and auto-generates `manifest.json` routes.
2. **VVD Auto-Configuration**: Detects existing Vela Virtual Devices (VVD). If `config.ini` is missing `image.sysdir.1` or `image.sysdir.2` paths, it auto-patches them.
3. **VVD Auto-Creation**: If no virtual device exists (e.g., fresh repository clone), it creates a default `Vela_Virtual_Device` with Redmi Watch skin (466x466, arm, rect, 320dpi).
4. **`aiot build`**: Compiles the `.ux` project into a signed `.rpk` binary package.
5. **Push to Emulator**: Installs the `.rpk` onto the running virtual device.
6. **File Watcher**: Watches `src-tsx/` for changes and automatically rebuilds + hot-pushes on every save.

### Running the Emulator

```bash
bun run dev:emulator
```

### NPM Scripts Reference

```json
{
  "scripts": {
    "build": "bun run build:copy && bun run build:jsx",
    "build:copy": "node scripts/copy-static.js",
    "build:jsx": "node scripts/build-jsx.js",
    "aiot:build": "bun run build && aiot build --enable-custom-component",
    "dev": "node scripts/dev.js",
    "dev:emulator": "node scripts/dev-emulator.js"
  }
}
```

---

## ⌚ 3. Deploying to Physical Xiaomi Smartwatches

Xiaomi smartwatches do not have USB ports. Deployment uses your **Android phone as a Bluetooth bridge**.

### Prerequisites

- Android phone with **Mi Fitness** app installed
- Xiaomi smartwatch paired via Bluetooth to your phone
- Your PC and phone connected to the **same Wi-Fi network**

### Step 1: Enable Developer Mode on Mi Fitness

1. Open **Mi Fitness** on your phone.
2. Go to **Profile → Settings → About**.
3. Tap the **version number 7 times** rapidly until you see "Developer mode activated".
4. A new **Developer Tools** menu will appear.

### Step 2: Build the Production `.rpk` Package

```bash
bun run aiot:build
```

This generates the signed binary at:

```
dist/com.example.kovo.debug.1.0.0.rpk
```

### Step 3: Deploy via QR Code (Recommended)

1. Start the AIoT development server on your PC:
   ```bash
   npx aiot server
   ```
2. A **QR code** will appear in your terminal.
3. In Mi Fitness, go to **Developer Tools → Scan QR / Install RPK**.
4. Scan the QR code with your phone's camera.
5. The phone downloads the `.rpk` over Wi-Fi and pushes it to your watch via Bluetooth.

### Step 4: Deploy via USB + ADB (Alternative)

If your phone is connected to your PC via USB with **USB Debugging** enabled:

```bash
# Verify phone is detected
adb devices

# Push the app package
npx aiot push
```

### Supported Devices

| Device | Network (`@system.fetch`) | QuickApp Support |
| :--- | :--- | :--- |
| Xiaomi Watch S4 | ✅ Supported | ✅ |
| Xiaomi Watch S5 | ✅ Supported | ✅ |
| REDMI Watch 5 | ✅ Supported | ✅ |
| REDMI Watch 6 | ✅ Supported | ✅ |
| Xiaomi Watch S3 | ✅ Supported | ✅ |
| Xiaomi S1 Pro | ✅ Supported | ✅ |
| Redmi Watch 4 | ❌ Not supported | ✅ |
| Xiaomi Band 8 Pro | ❌ Not supported | ⚠️ Limited |
| Xiaomi Band 9 / 9 Pro | ❌ Not supported | ⚠️ Limited |
| Xiaomi Band 10 | ❌ Not supported | ⚠️ Limited |

> [!WARNING]
> **Network fetch (`@system.fetch`) is NOT available on all devices.** Redmi Watch 4 and all Xiaomi Band models do not support network requests. Always check device compatibility before relying on network features.
