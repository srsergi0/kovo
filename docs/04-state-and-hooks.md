# 04. State Management & Hooks

This document details state management, hook composition, and reactive binding rules in **Kovo**.

---

## ⚡ 1. The `useState` Hook

State in Kovo is declared using the standard React `useState` syntax:

```tsx
const [stateName, setStateName] = useState(initialValue);
```

### Compiler Inlining Mechanics

1. **State Registration**: `initialValue` is assigned to `data: { stateName: initialValue }` on the QuickApp VM object.
2. **Setter Inlining**: Invoking `setStateName(newValue)` inside a component function or hook is transpiled to `this.stateName = newValue`.
3. **Binary Calculations**: `setStateName(stateName + 500)` transpiles to `this.stateName = this.stateName + 500`.

#### Code Comparison

##### Input TSX:
```tsx
export default function Counter() {
  const [steps, setSteps] = useState(8450);

  function add500() {
    setSteps(steps + 500);
  }

  function reset() {
    setSteps(0);
  }

  return (
    <div className="page">
      <text>{steps}</text>
      <input type="button" value="+500" onClick={add500} />
      <input type="button" value="Reset" onClick={reset} />
    </div>
  );
}
```

##### Output QuickApp `.ux` Script:
```javascript
export default {
  data: { steps: 8450 },
  add500() {
    this.steps = this.steps + 500;
  },
  reset() {
    this.steps = 0;
  }
}
```

---

## 🎯 2. The `useRef` Hook

The `useRef` hook allows direct access to native smartwatch DOM elements (such as `list`, `scroll`, `input`, `canvas`, or `swiper`).

### Ref Transformation Rules

1. **Template ID Assignment**: If an element has `ref={myRef}`, the compiler assigns `id="myRef"` to the opening tag.
2. **Current Object Dereferencing**: `myRef.current.methodName(...)` is transpiled to `this.$element("myRef").methodName(...)`.

#### Code Comparison

##### Input TSX:
```tsx
import { useRef } from 'kovo';

export default function InputFocusPage() {
  const nameInputRef = useRef(null);

  function focusInput() {
    nameInputRef.current.focus();
  }

  return (
    <div className="page">
      <input ref={nameInputRef} type="text" value="User" />
      <input type="button" value="Focus" onClick={focusInput} />
    </div>
  );
}
```

##### Output QuickApp `.ux`:
```xml
<template>
  <div class="page">
    <input id="nameInputRef" type="text" value="User"/>
    <input type="button" value="Focus" @click="focusInput"/>
  </div>
</template>

<script>
export default {
  focusInput() {
    this.$element("nameInputRef").focus();
  }
}
</script>
```

---

## 🔄 3. Creating & Composing Custom Hooks

Custom hooks enable reusable UI logic across multiple pages and components.

### Example: `useSteps` Hook

```tsx
// src-tsx/hooks/useSteps.ts
import { useState } from 'kovo';

export function useSteps(initialSteps = 8450) {
  const [steps, setSteps] = useState(initialSteps);

  function addSteps() {
    setSteps(steps + 500);
  }

  function resetSteps() {
    setSteps(0);
  }

  return { steps, addSteps, resetSteps };
}
```

### Consumption in Component

```tsx
// src-tsx/pages/index/index.tsx
import { useSteps } from '../../hooks/useSteps';

export default function SmartwatchDashboard() {
  const { steps, addSteps, resetSteps } = useSteps(10000);

  return (
    <div className="page">
      <text>Steps: {steps}</text>
      <input type="button" value="⚡ +500" onClick={addSteps} />
      <input type="button" value="🔄 RESET" onClick={resetSteps} />
    </div>
  );
}
```

#### Transpiled VM Object:
```javascript
export default {
  data: { steps: 10000 },
  addSteps() {
    this.steps = this.steps + 500;
  },
  resetSteps() {
    this.steps = 0;
  }
}
```
All hook state and methods are merged directly into the component VM without extra wrapper objects or runtime overhead!
