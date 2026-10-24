# 05. Styling & Smartwatch Design System

Xiaomi Vela smartwatches feature high-density, ultra-vibrant **OLED circular and rectangular displays** (typically **466x466 pixels**). This guide outlines the design principles, CSS rules, and component styling patterns for Kovo.

---

## 🎨 1. Smartwatch OLED Design Principles

1. **True Black Backgrounds (`#000000` / `#06080c`)**:
   OLED screens turn off pixels when rendering true black, saving battery life and creating a bezel-less visual effect.
2. **Neon Accent Colors**:
   Use high-contrast vibrant colors:
   - Cyan / Electric Blue: `#38bdf8` / `#0284c7`
   - Emerald Green: `#4ade80` / `#16a34a`
   - Purple / Neon Violet: `#c084fc` / `#7c3aed`
   - Coral Red: `#fca5a5` / `#dc2626`
3. **Pill Buttons (`border-radius: 22px`)**:
   Touch targets must be large and rounded for easy tapping with fingers on a small wrist display.
4. **Explicit Container Sizes (`width: 466px; height: 466px`)**:
   Define root canvas container bounds explicitly.

---

## 📐 2. CSS Extraction in Kovo

CSS styles in Kovo are written using the `export const style = ...` string format in your TSX file.

### Input TSX:
```tsx
export const style = `
  .page {
    width: 466px;
    height: 466px;
    background-color: #06080c;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    padding-top: 16px;
  }
  .btn-pill {
    width: 194px;
    height: 44px;
    border-radius: 22px;
    background-color: #052e16;
    border-color: #16a34a;
    border-width: 1px;
    color: #4ade80;
    font-size: 13px;
    font-weight: bold;
  }
`;

export default function StyledButton() {
  return (
    <div className="page">
      <input className="btn-pill" type="button" value="ACTION" />
    </div>
  );
}
```

### Output `.ux` `<style>` Block:
```xml
<style>
  .page {
    width: 466px;
    height: 466px;
    background-color: #06080c;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    padding-top: 16px;
  }
  .btn-pill {
    width: 194px;
    height: 44px;
    border-radius: 22px;
    background-color: #052e16;
    border-color: #16a34a;
    border-width: 1px;
    color: #4ade80;
    font-size: 13px;
    font-weight: bold;
  }
</style>
```

---

## 🧱 3. Reusable UI Components Pattern

### StatCard Component (`StatCard.tsx`)

```tsx
// src-tsx/components/StatCard/StatCard.tsx
export const style = `
  .stat-card {
    width: 400px;
    background-color: #0f172a;
    border-radius: 20px;
    padding: 14px 16px;
    flex-direction: column;
    margin-bottom: 8px;
    border-width: 1px;
    border-color: #1e293b;
  }
  .stat-header {
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
  }
  .stat-title {
    font-size: 12px;
    font-weight: bold;
    color: #94a3b8;
  }
  .stat-badge {
    font-size: 10px;
    font-weight: bold;
    color: #38bdf8;
  }
  .stat-val-row {
    flex-direction: row;
    align-items: baseline;
    margin-top: 4px;
  }
  .stat-val {
    font-size: 28px;
    font-weight: bold;
    color: #ffffff;
  }
  .stat-unit {
    font-size: 12px;
    color: #38bdf8;
    margin-left: 6px;
  }
  .progress-bg {
    width: 368px;
    height: 6px;
    background-color: #1e293b;
    border-radius: 3px;
    margin-top: 8px;
  }
  .progress-fill {
    height: 6px;
    background-color: #38bdf8;
    border-radius: 3px;
  }
`;

export default function StatCard({
  title = 'ACTIVITY',
  value = '0',
  unit = 'PTS',
  badge = 'GOAL',
  progress = '70%'
}) {
  return (
    <div className="stat-card">
      <div className="stat-header">
        <text className="stat-title">{title}</text>
        <text className="stat-badge">{badge}</text>
      </div>
      <div className="stat-val-row">
        <text className="stat-val">{value}</text>
        <text className="stat-unit">{unit}</text>
      </div>
      <div className="progress-bg">
        <div className="progress-fill" style={{ width: progress }} />
      </div>
    </div>
  );
}
```

---

## ⚠️ 4. QuickApp CSS Restrictions & Guidelines

- **Use Flexbox (`flex-direction: column` or `row`)**: QuickApp layouts rely on Flexbox defaults.
- **Avoid Universal Selectors (`*`)**: Universal selectors are not supported in QuickApp.
- **Use Class Selectors (`.my-class`)**: Prefer class selectors over deep descendant selectors.
- **`className` and `class` are Synonymous**: Both `className="btn"` and `class="btn"` work seamlessly in TSX templates.
