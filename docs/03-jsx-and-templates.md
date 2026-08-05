# 03. JSX & Templating System

This document covers all supported JSX templating features in **Kovo**, including control flow directives (`if`/`elif`/`else`), list loops (`map()`), fragments, dynamic components, event handlers, and DOM references.

---

## 🔀 1. Conditional Rendering

Kovo supports both ternary expressions (`cond ? <A/> : <B/>`) and logical `&&` short-circuit evaluation, translating them to QuickApp's `if`, `elif`, and `else` directives.

### A. Ternary Expressions

#### Input TSX:
```tsx
return (
  <div className="container">
    {isLoggedIn ? (
      <text className="user">Welcome Back!</text>
    ) : (
      <text className="guest">Please Log In</text>
    )}
  </div>
);
```

#### Output QuickApp XML:
```xml
<div class="container">
  <text class="user" if="{{isLoggedIn}}">Welcome Back!</text>
  <text class="guest" else>Please Log In</text>
</div>
```

### B. Logical `&&` Short-Circuit

#### Input TSX:
```tsx
return (
  <div className="page">
    {showWorkouts && (
      <div className="workouts-box">
        <text>Workouts Active</text>
      </div>
    )}
  </div>
);
```

#### Output QuickApp XML:
```xml
<div class="page">
  <div class="workouts-box" if="{{showWorkouts}}">
    <text>Workouts Active</text>
  </div>
</div>
```

---

## 🔄 2. List Rendering with `.map()`

Arrays rendered via `.map()` are transpiled into Xiaomi Vela's `for="{{item in array}}"` template attribute.

#### Input TSX:
```tsx
const WORKOUTS = [
  { id: 1, name: '🏃 Run' },
  { id: 2, name: '🚴 Bike' }
];

export default function WorkoutsList() {
  const items = WORKOUTS;
  return (
    <div className="list">
      {items.map((item, index) => (
        <text key={item.id} className="item">
          {index + 1}. {item.name}
        </text>
      ))}
    </div>
  );
}
```

#### Output QuickApp XML:
```xml
<div class="list">
  <text key="{{item.id}}" class="item" for="{{(index, item) in items}}">
    {{index + 1}}. {{item.name}}
  </text>
</div>
```

---

## 🧩 3. Dynamic Components (`<component is="..." />`)

In accordance with official Xiaomi Vela OS specifications, multiple components can be loaded dynamically using the `<component is={componentName} />` tag.

#### Input TSX:
```tsx
import { useState } from 'kovo-ux';
import Part1 from './part1';
import Part2 from './part2';

export default function TabSwitcher() {
  const [activeTab, setActiveTab] = useState('part1');

  return (
    <div className="page">
      <component is={activeTab} />
    </div>
  );
}
```

#### Output QuickApp XML:
```xml
<import name="part1" src="./part1.ux"></import>
<import name="part2" src="./part2.ux"></import>

<template>
  <div class="page">
    <component is="{{activeTab}}"/>
  </div>
</template>
```

---

## ⚡ 4. Event Handler Bindings

Event handler attributes (`onClick`, `onChange`, `onAppear`, `onDisappear`, `onScroll`) are converted to QuickApp `@event` attributes.

| React TSX Attribute | QuickApp XML Attribute | Description |
| :--- | :--- | :--- |
| `onClick={handleClick}` | `@click="handleClick"` | Click / Touch Event |
| `onChange={handleChange}` | `@change="handleChange"` | Input / Switch Change Event |
| `onAppear={handleAppear}` | `@appear="handleAppear"` | Element enters viewport |
| `onDisappear={handleDisappear}` | `@disappear="handleDisappear"` | Element leaves viewport |

#### Input TSX:
```tsx
function handlePress() {
  console.log('Button pressed');
}

return <input type="button" value="Submit" onClick={handlePress} />;
```

#### Output QuickApp XML:
```xml
<input type="button" value="Submit" @click="handlePress"/>
```

---

## 🎯 5. DOM References (`useRef` & `$element`)

In Kovo, `useRef()` maps directly to QuickApp's native `$element("refId")` selector.

#### Input TSX:
```tsx
import { useRef } from 'kovo-ux';

export default function ScrollDemo() {
  const listRef = useRef(null);

  function scrollToTop() {
    listRef.current.scrollTo({ top: 0, smooth: true });
  }

  return (
    <div ref={listRef} className="scroll-box">
      <input type="button" value="Top" onClick={scrollToTop} />
    </div>
  );
}
```

#### Output `.ux`:
```xml
<div id="listRef" class="scroll-box">
  <input type="button" value="Top" @click="scrollToTop"/>
</div>
```

#### Output Method Transformation:
```javascript
scrollToTop() {
  this.$element("listRef").scrollTo({ top: 0, smooth: true });
}
```
