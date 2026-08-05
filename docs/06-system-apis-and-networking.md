# 06. System APIs & Networking

This guide details integration with Xiaomi Vela system modules: **Page Router Navigation** (`@system.router`), **Haptic Feedback Vibrator** (`@system.vibrator`), and **HTTP Network Requests** (`@system.fetch`).

---

## 🧭 1. Page Router (`@system.router`)

The page router handles screen navigation between smartwatch views.

### Importing System Router

```tsx
import router from '@system.router';
```

### Common Navigation Operations

#### A. Navigate to a Page
```tsx
function goToSettings() {
  router.push({
    uri: 'pages/settings'
  });
}
```

#### B. Navigate Back
```tsx
function goBack() {
  router.back();
}
```

#### C. Replace Current Page
```tsx
function replaceWithDashboard() {
  router.replace({
    uri: 'pages/index'
  });
}
```

---

## 📳 2. Haptic Feedback Vibrator (`@system.vibrator`)

Provide instant tactile haptic feedback when smartwatch buttons are pressed.

### Importing System Vibrator

```tsx
import vibrator from '@system.vibrator';
```

### Triggering Short Vibration

```tsx
function triggerHaptic() {
  try {
    if (vibrator && typeof vibrator.vibrate === 'function') {
      vibrator.vibrate({ mode: 'short' });
    }
  } catch (e) {
    // Graceful fallback for emulators without haptic hardware
  }
}
```

---

## 🌐 3. Network Requests (`@system.fetch`)

Xiaomi Vela applications execute HTTP network requests via `@system.fetch`.

### Manifest Permission Declaration

System modules MUST be declared under `"features"` inside `src-tsx/manifest.json`:

```json
{
  "features": [
    { "name": "system.app" },
    { "name": "system.vibrator" },
    { "name": "system.router" },
    { "name": "system.fetch" }
  ]
}
```

---

### HTTP Network Requests (GET, POST, PUT, DELETE)

#### Full Example (`pages/network/network.tsx`)

```tsx
import { useState } from 'kovo-ux';
import fetch from '@system.fetch';
import vibrator from '@system.vibrator';

const WEBHOOK_URL = 'https://keen-seal-69.webhook.cool';

export default function NetworkPage() {
  const [statusMsg, setStatusMsg] = useState('READY');
  const [lastCode, setLastCode] = useState('200 OK');

  // 📡 1. GET Request
  function sendGet() {
    setStatusMsg('SENDING GET...');
    const self = this;

    fetch.fetch({
      url: WEBHOOK_URL + '?device=XiaomiVela',
      method: 'GET',
      responseType: 'text',
      success: function(res) {
        self.statusMsg = 'GET SUCCESS (' + (res.code || 200) + ')';
        self.lastCode = 'DATA: ' + (res.data ? res.data.substring(0, 30) : 'EMPTY');
      },
      fail: function(data, code) {
        self.statusMsg = 'GET FAIL (' + code + ')';
        self.lastCode = String(data);
      }
    });
  }

  // 📤 2. POST JSON Request
  function sendPost() {
    setStatusMsg('SENDING POST...');
    const self = this;

    fetch.fetch({
      url: WEBHOOK_URL,
      method: 'POST',
      header: { 'Content-Type': 'application/json' },
      data: JSON.stringify({ device: 'Redmi Watch 5', steps: 8450, timestamp: Date.now() }),
      responseType: 'text',
      success: function(res) {
        self.statusMsg = 'POST SUCCESS (' + (res.code || 200) + ')';
        self.lastCode = 'PAYLOAD DELIVERED';
      },
      fail: function(data, code) {
        self.statusMsg = 'POST FAIL (' + code + ')';
        self.lastCode = String(data);
      }
    });
  }

  // 📝 3. PUT Data Request
  function sendPut() {
    setStatusMsg('SENDING PUT...');
    const self = this;

    fetch.fetch({
      url: WEBHOOK_URL + '?action=update',
      method: 'PUT',
      header: { 'Content-Type': 'application/json' },
      data: JSON.stringify({ status: 'ACTIVE', battery: 94 }),
      responseType: 'text',
      success: function(res) {
        self.statusMsg = 'PUT SUCCESS (' + (res.code || 200) + ')';
        self.lastCode = 'DATA UPDATED';
      },
      fail: function(data, code) {
        self.statusMsg = 'PUT FAIL (' + code + ')';
        self.lastCode = String(data);
      }
    });
  }

  // 🗑️ 4. DELETE Request
  function sendDelete() {
    setStatusMsg('SENDING DELETE...');
    const self = this;

    fetch.fetch({
      url: WEBHOOK_URL + '/resource/101',
      method: 'DELETE',
      responseType: 'text',
      success: function(res) {
        self.statusMsg = 'DELETE SUCCESS (' + (res.code || 200) + ')';
        self.lastCode = 'RESOURCE DELETED';
      },
      fail: function(data, code) {
        self.statusMsg = 'DELETE FAIL (' + code + ')';
        self.lastCode = String(data);
      }
    });
  }

  return (
    <div className="page">
      <text className="title">{statusMsg}</text>
      <text className="detail">{lastCode}</text>
      <input type="button" value="📡 GET" onClick={sendGet} />
      <input type="button" value="📤 POST" onClick={sendPost} />
      <input type="button" value="📝 PUT" onClick={sendPut} />
      <input type="button" value="🗑️ DELETE" onClick={sendDelete} />
    </div>
  );
}
```

> [!TIP]
> **Always specify `responseType: 'text'`**: For endpoints that return empty responses (`200 OK` with 0-byte body), setting `responseType: 'text'` prevents native QuickApp C++ JSON parser panics.
