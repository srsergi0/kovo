// Watch-screen "apps" drawn on a 2D canvas that becomes the 3D screen texture.
// Each one mimics what the compiled Vela page renders for the section's snippet.

const C = { bg: '#06080c', cyan: '#38bdf8', violet: '#a78bfa', orange: '#ff6a2b', green: '#4ade80', pink: '#f472b6', ink: '#e2e8f0', muted: '#64748b', btn: '#0c4a6e' };
const FONT = (w, px) => `${w} ${px}px "IBM Plex Sans", system-ui, sans-serif`;
const MONO = (px) => `500 ${px}px "IBM Plex Mono", ui-monospace, monospace`;

function pill(ctx, x, y, w, h, r, fill) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
}
const ease = (x) => 1 - Math.pow(1 - Math.min(Math.max(x, 0), 1), 3);

export const apps = {
  face(ctx, w, h, t) {
    const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.42;
    const now = new Date();
    const sec = now.getSeconds() + now.getMilliseconds() / 1000;
    // rings
    const rings = [[C.orange, 0.78], [C.green, 0.62], [C.cyan, 0.9]];
    rings.forEach(([col, p], i) => {
      const r = R - i * 22;
      ctx.lineWidth = 14; ctx.lineCap = 'round';
      ctx.strokeStyle = col + '22';
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = col;
      const k = p * (0.85 + 0.15 * Math.sin(t * 0.8 + i));
      ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); ctx.stroke();
    });
    // seconds tick
    const a = (sec / 60) * Math.PI * 2 - Math.PI / 2;
    ctx.fillStyle = C.ink;
    ctx.beginPath(); ctx.arc(cx + Math.cos(a) * (R + 16), cy + Math.sin(a) * (R + 16), 5, 0, Math.PI * 2); ctx.fill();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = C.ink; ctx.font = FONT(700, w * 0.2);
    const hh = String(now.getHours()).padStart(2, '0'), mm = String(now.getMinutes()).padStart(2, '0');
    ctx.fillText(`${hh}:${mm}`, cx, cy - 6);
    ctx.font = MONO(w * 0.04); ctx.fillStyle = C.cyan;
    ctx.fillText('KOVO · VELA', cx, cy + w * 0.13);
  },

  counter(ctx, w, h, t, s) {
    const cx = w / 2, cy = h / 2;
    // auto-tap every 1.1s
    const period = 1.1;
    const n = Math.floor(t / period);
    const local = (t % period) / period;
    const count = n % 21;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const pop = 1 + 0.18 * Math.max(0, 1 - local * 4);
    ctx.save(); ctx.translate(cx, cy - h * 0.12); ctx.scale(pop, pop);
    ctx.fillStyle = C.cyan; ctx.font = FONT(700, w * 0.26);
    ctx.fillText(String(count), 0, 0);
    ctx.restore();
    ctx.fillStyle = C.ink; ctx.font = FONT(500, w * 0.065);
    ctx.fillText(`x2 = ${count * 2}`, cx, cy + h * 0.06);
    // button with press ripple
    const bw = w * 0.38, bh = w * 0.13, by = cy + h * 0.17;
    const press = local < 0.15 ? 0.94 : 1;
    ctx.save(); ctx.translate(cx, by + bh / 2); ctx.scale(press, press);
    pill(ctx, -bw / 2, -bh / 2, bw, bh, bh / 2, C.btn);
    ctx.fillStyle = '#fff'; ctx.font = FONT(600, w * 0.06); ctx.fillText('+1', 0, 2);
    ctx.restore();
    if (local < 0.5) {
      ctx.strokeStyle = `rgba(56,189,248,${0.6 * (1 - local * 2)})`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(cx, by + bh / 2, bh * (0.5 + local * 2.5), 0, Math.PI * 2); ctx.stroke();
    }
    // vibrate flash every 10
    if (count > 0 && count % 10 === 0 && local < 0.6) {
      ctx.strokeStyle = C.orange; ctx.lineWidth = 6;
      ctx.globalAlpha = 1 - local / 0.6;
      ctx.beginPath(); ctx.arc(cx, cy, Math.min(w, h) * 0.47, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.font = MONO(w * 0.035); ctx.fillStyle = C.orange; ctx.fillText('vibrator.vibrate()', cx, h * 0.17);
    }
    s.count = count;
  },

  compile(ctx, w, h, t) {
    const cx = w / 2, cy = h / 2;
    const cyc = t % 4;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (cyc < 2.2) {
      // code rain → compiling
      ctx.font = MONO(w * 0.032);
      const tokens = ['useState', 'protected', '$watch', 'computed', '<text>', 'onInit', 'kovoHandler0', '{{count}}', 'this.count', '<template>'];
      for (let i = 0; i < 14; i++) {
        const y = ((t * 90 + i * 53) % (h + 40)) - 20;
        ctx.fillStyle = i % 3 === 0 ? C.cyan : i % 3 === 1 ? C.violet : C.muted;
        ctx.globalAlpha = 0.25 + 0.5 * Math.sin((y / h) * Math.PI);
        ctx.fillText(tokens[i % tokens.length], ((i * 97) % (w * 0.7)) + w * 0.15, y);
      }
      ctx.globalAlpha = 1;
      const p = ease(cyc / 2.2);
      ctx.lineWidth = 10; ctx.lineCap = 'round';
      ctx.strokeStyle = '#ffffff14';
      ctx.beginPath(); ctx.arc(cx, cy, w * 0.2, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = C.cyan;
      ctx.beginPath(); ctx.arc(cx, cy, w * 0.2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p); ctx.stroke();
      ctx.fillStyle = C.ink; ctx.font = MONO(w * 0.05);
      ctx.fillText(`${Math.round(p * 100)}%`, cx, cy);
    } else {
      const k = ease((cyc - 2.2) / 0.5);
      ctx.globalAlpha = k;
      ctx.fillStyle = C.green; ctx.font = FONT(700, w * 0.16);
      ctx.fillText('✓', cx, cy - h * 0.1);
      ctx.fillStyle = C.ink; ctx.font = MONO(w * 0.048);
      ctx.fillText('counter.ux', cx, cy + h * 0.05);
      ctx.fillStyle = C.muted; ctx.font = MONO(w * 0.034);
      ctx.fillText('0 KB runtime', cx, cy + h * 0.13);
      ctx.globalAlpha = 1;
    }
  },

  hooks(ctx, w, h, t) {
    const cx = w / 2, cy = h / 2;
    const pairs = [['useState', 'protected', C.green], ['useEffect', '$watch', C.orange], ['useMemo', 'computed', C.violet], ['useRef', '$element', C.pink], ['onSelect()', '$emit', C.cyan]];
    const i = Math.floor(t / 1.6) % pairs.length;
    const local = (t % 1.6) / 1.6;
    const [a, b, col] = pairs[i];
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    // orbit dots
    for (let k = 0; k < 24; k++) {
      const ang = (k / 24) * Math.PI * 2 + t * 0.6;
      ctx.fillStyle = k % 2 ? col : '#ffffff22';
      ctx.beginPath(); ctx.arc(cx + Math.cos(ang) * w * 0.4, cy + Math.sin(ang) * w * 0.4, 3, 0, Math.PI * 2); ctx.fill();
    }
    const inK = ease(local * 3), outK = ease((local - 0.8) * 5);
    ctx.globalAlpha = inK * (1 - outK);
    ctx.font = MONO(w * 0.06); ctx.fillStyle = C.ink;
    ctx.fillText(a, cx, cy - h * 0.1 - (1 - inK) * 20);
    ctx.fillStyle = C.muted; ctx.font = FONT(500, w * 0.07);
    ctx.fillText('↓', cx, cy);
    ctx.font = MONO(w * 0.07); ctx.fillStyle = col;
    ctx.fillText(b, cx, cy + h * 0.11 + (1 - inK) * 20);
    ctx.globalAlpha = 1;
  },

  weather(ctx, w, h, t) {
    const cyc = t % 6;
    ctx.textBaseline = 'middle';
    if (cyc < 1.4) {
      const cx = w / 2, cy = h / 2;
      ctx.lineWidth = 8; ctx.lineCap = 'round'; ctx.strokeStyle = C.cyan;
      ctx.beginPath(); ctx.arc(cx, cy - 16, w * 0.08, t * 6, t * 6 + Math.PI * 1.4); ctx.stroke();
      ctx.textAlign = 'center'; ctx.fillStyle = C.muted; ctx.font = FONT(500, w * 0.055);
      ctx.fillText('Loading…', cx, cy + w * 0.1);
      return;
    }
    const days = [['Mon', 27], ['Tue', 24], ['Wed', 29], ['Thu', 21], ['Fri', 26]];
    const rowH = h * 0.105, top = h / 2 - (days.length * rowH) / 2;
    ctx.textAlign = 'center'; ctx.fillStyle = C.cyan; ctx.font = MONO(w * 0.035);
    ctx.fillText('fetch · 200 OK', w / 2, top - rowH * 0.7);
    days.forEach(([d, temp], i) => {
      const k = ease((cyc - 1.4 - i * 0.12) / 0.5);
      const y = top + i * rowH + rowH / 2;
      const x0 = w * 0.2 + (1 - k) * 60;
      ctx.globalAlpha = k;
      pill(ctx, x0, y - rowH * 0.42, w * 0.6, rowH * 0.84, rowH * 0.42, '#ffffff0d');
      ctx.textAlign = 'left'; ctx.fillStyle = C.ink; ctx.font = FONT(500, w * 0.055);
      ctx.fillText(d, x0 + w * 0.05, y + 2);
      ctx.textAlign = 'right'; ctx.fillStyle = temp > 25 ? C.orange : C.cyan; ctx.font = FONT(700, w * 0.06);
      ctx.fillText(`${temp}°`, x0 + w * 0.55, y + 2);
    });
    ctx.globalAlpha = 1;
  },

  perf(ctx, w, h, t) {
    const cx = w / 2, cy = h / 2;
    const used = 0.32 + 0.06 * Math.sin(t * 1.3);
    ctx.lineWidth = 18; ctx.lineCap = 'round';
    const a0 = Math.PI * 0.75, span = Math.PI * 1.5;
    ctx.strokeStyle = '#ffffff12';
    ctx.beginPath(); ctx.arc(cx, cy + 10, w * 0.33, a0, a0 + span); ctx.stroke();
    const g = ctx.createLinearGradient(cx - w * 0.3, 0, cx + w * 0.3, 0);
    g.addColorStop(0, C.green); g.addColorStop(1, C.cyan);
    ctx.strokeStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy + 10, w * 0.33, a0, a0 + span * used); ctx.stroke();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = C.ink; ctx.font = FONT(700, w * 0.15);
    ctx.fillText(`${Math.round(used * 100)}%`, cx, cy);
    ctx.fillStyle = C.muted; ctx.font = MONO(w * 0.036);
    ctx.fillText('memory', cx, cy + w * 0.11);
    ctx.fillStyle = C.green; ctx.fillText('● healthy', cx, cy + w * 0.18);
  },

  sim(ctx, w, h, t) {
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    const items = ['Workout', 'Heart rate', 'Weather', 'Timer', 'Music', 'Settings', 'Workout', 'Heart rate'];
    const cols = [C.orange, C.pink, C.cyan, C.violet, C.green, C.muted];
    const rowH = h * 0.14, off = (t * 26) % (rowH * 6);
    ctx.save();
    ctx.beginPath(); ctx.rect(0, h * 0.18, w, h * 0.72); ctx.clip();
    items.forEach((name, i) => {
      const y = h * 0.22 + i * rowH - off + rowH * 0.5;
      pill(ctx, w * 0.12, y - rowH * 0.4, w * 0.76, rowH * 0.8, rowH * 0.25, '#ffffff0b');
      ctx.fillStyle = cols[i % cols.length];
      ctx.beginPath(); ctx.arc(w * 0.12 + rowH * 0.45, y, rowH * 0.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = C.ink; ctx.font = FONT(500, w * 0.055);
      ctx.fillText(name, w * 0.12 + rowH * 0.85, y + 2);
    });
    ctx.restore();
    ctx.textAlign = 'center'; ctx.fillStyle = C.ink; ctx.font = FONT(700, w * 0.06);
    ctx.fillText('Apps', w / 2, h * 0.11);
  },

  start(ctx, w, h, t) {
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    const lines = ['$ npm create kovo-ux', '✓ template: basic', '$ bun run build', '✓ 0 warnings', '$ aiot build', '✓ build success'];
    const shown = Math.min(lines.length, Math.floor((t % 7) / 0.7) + 1);
    ctx.font = MONO(w * 0.042);
    lines.slice(0, shown).forEach((l, i) => {
      ctx.fillStyle = l.startsWith('✓') ? C.green : C.ink;
      ctx.fillText(l, w * 0.14, h * 0.28 + i * h * 0.085);
    });
    if (Math.floor(t * 2) % 2) {
      ctx.fillStyle = C.cyan;
      ctx.fillRect(w * 0.14, h * 0.28 + shown * h * 0.085 - 12, 14, 26);
    }
  },
};

// Renders one app (with a cross-fade from the previous one) into a canvas of any size.
export function createScreen(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const state = {};
  let current = 'face', previous = null, switchedAt = 0;
  return {
    canvas,
    set(name, time) {
      if (name === current || !apps[name]) return;
      previous = current; current = name; switchedAt = time;
    },
    draw(time, shape) {
      const w = canvas.width, h = canvas.height;
      ctx.fillStyle = C.bg;
      ctx.fillRect(0, 0, w, h);
      // subtle vignette glow
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.6);
      g.addColorStop(0, '#0f1a2a'); g.addColorStop(1, C.bg);
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      const k = Math.min(1, (time - switchedAt) / 0.45);
      if (previous && k < 1) {
        ctx.save(); ctx.globalAlpha = 1 - k;
        ctx.translate(w / 2, h / 2); ctx.scale(1 + k * 0.15, 1 + k * 0.15); ctx.translate(-w / 2, -h / 2);
        apps[previous](ctx, w, h, time, state, shape);
        ctx.restore();
      }
      ctx.save(); ctx.globalAlpha = k;
      ctx.translate(w / 2, h / 2); ctx.scale(0.9 + 0.1 * k, 0.9 + 0.1 * k); ctx.translate(-w / 2, -h / 2);
      apps[current](ctx, w, h, time, state, shape);
      ctx.restore();
    },
  };
}
