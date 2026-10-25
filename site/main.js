import { createWatchScene, rig } from './watch.js';

const { gsap, ScrollTrigger } = window;
gsap.registerPlugin(ScrollTrigger);
// keep timelines on wall-clock time even when a weak GPU drops frames
gsap.ticker.lagSmoothing(0);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- code snippets ----------
const RE = /(\/\/[^\n]*)|('(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*")|(\{\{|\}\})|(<\/?[A-Za-z][\w-]*|\/?>)|\b(import|from|export|default|function|const|return|if|null|true|false|this)\b|\b(use[A-Z]\w*|set[A-Z]\w*)\b|(\$watch|\$element|\$emit|\bprotected\b|\bcomputed\b|\bonInit\b|\bkovo\w+)|\b(\d+)\b|([A-Za-z@:-]+)(?==)/g;
const CLS = [null, 't-c', 't-s', 't-m', 't-tag', 't-k', 't-h', 't-v', 't-n', 't-a'];
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function highlight(line) {
  let out = '', last = 0;
  for (const m of line.matchAll(RE)) {
    out += esc(line.slice(last, m.index));
    const gi = m.findIndex((v, i) => i > 0 && v !== undefined);
    out += `<span class="${CLS[gi]}">${esc(m[0])}</span>`;
    last = m.index + m[0].length;
  }
  return out + esc(line.slice(last));
}

function renderCode(pre) {
  const src = document.getElementById(pre.dataset.src).value;
  pre.innerHTML = src.split('\n').map((raw, i) => {
    const m = raw.match(/@@(\w+)$/);
    const text = m ? raw.slice(0, m.index) : raw;
    return `<span class="ln" data-n="${i + 1}"${m ? ` data-g="${m[1]}"` : ''}>${highlight(text)}</span>`;
  }).join('');
}
document.querySelectorAll('pre[data-src]').forEach(renderCode);

// ---------- hero title: split into characters ----------
document.querySelectorAll('.title .txt').forEach((line) => {
  line.innerHTML = line.textContent.split(' ').map((word) =>
    `<span style="display:inline-block;white-space:nowrap">${[...word].map((c) => `<span class="ch">${esc(c)}</span>`).join('')}</span>`,
  ).join(' ');
});

// ---------- 3D ----------
let scene = null;
try {
  scene = createWatchScene(document.getElementById('gl'));
} catch (e) {
  console.warn('WebGL unavailable', e);
}

// ---------- sections, dots, active state ----------
const sections = [...document.querySelectorAll('.panel')];
const dotsNav = document.querySelector('.dots');
sections.forEach((s, i) => {
  const a = document.createElement('a');
  a.href = `#${s.id}`;
  a.innerHTML = `<span>${s.dataset.label}</span><i></i>`;
  a.addEventListener('click', (e) => { e.preventDefault(); window.scrollTo({ top: s.offsetTop, behavior: reduced ? 'auto' : 'smooth' }); });
  dotsNav.append(a);
});
const dots = [...dotsNav.children];
let active = -1;
let autoTimer = null, gi = 0, pausedUntil = 0;
function setActive(i) {
  if (i === active) return;
  active = i;
  dots.forEach((d, k) => d.classList.toggle('on', k === i));
  if (scene) scene.setApp(sections[i].dataset.screen);
  gsap.to(rig, { hue: i * 0.13, duration: 1.2, ease: 'power2.out' });
  compileAutoplay(sections[i].id === 'compile');
}
sections.forEach((s, i) => {
  ScrollTrigger.create({ trigger: s, start: 'top 55%', end: 'bottom 55%', onToggle: (self) => self.isActive && setActive(i) });
});
setActive(0);

gsap.to('.progress span', { scaleY: 1, ease: 'none', scrollTrigger: { start: 0, end: 'max', scrub: 0.3 } });

// ---------- magnet scroll: snap to section edges when close ----------
ScrollTrigger.create({
  start: 0,
  end: 'max',
  snap: {
    snapTo: (progress, self) => {
      const max = ScrollTrigger.maxScroll(window);
      const y = progress * max, vh = window.innerHeight;
      const points = [];
      sections.forEach((s) => {
        points.push(s.offsetTop);
        if (s.offsetHeight > vh * 1.05) points.push(s.offsetTop + s.offsetHeight - vh);
      });
      let best = y, dist = Infinity;
      for (const p of points) {
        const d = Math.abs(p - y);
        if (d < dist) { dist = d; best = p; }
      }
      // only pull when near a magnet, so tall sections can still be read
      return dist < vh * 0.45 ? Math.min(1, Math.max(0, best / max)) : progress;
    },
    duration: { min: 0.35, max: 0.9 },
    delay: 0.08,
    ease: 'power3.inOut',
    directional: false,
  },
});

// ---------- watch choreography (scrubbed) ----------
let mm = null;
// World units per CSS pixel at depth z (camera: fov 35°, z = 8).
const worldPerPx = (z = 0) => (2 * Math.tan((35 / 2) * Math.PI / 180) * (8 - z)) / window.innerHeight;
// Pose that centres the watch on a section's .slot column, sized to fit it.
function slotPose(section, extra) {
  const slot = section.querySelector('.slot, .hero-slot');
  const r = slot.getBoundingClientRect();
  const k = worldPerPx(extra.z || 0);
  const cx = r.left + r.width / 2 - window.innerWidth / 2;
  const top = r.top + window.scrollY - section.offsetTop;
  const cy = top + r.height / 2 - window.innerHeight / 2;
  const fit = Math.min(r.width * k / 2.6, (window.innerHeight * 0.62) * k / 2.6);
  return { x: cx * k, y: -cy * k, s: Math.max(0.3, fit), ...extra };
}

function setupRig() {
  if (mm) mm.revert();
  mm = gsap.matchMedia();
  mm.add({ desktop: '(min-width: 901px)', mobile: '(max-width: 900px)' }, (ctx) => {
  const D = ctx.conditions.desktop;
  const S = (id, extra) => slotPose(document.getElementById(id), extra);
  // one pose per section, in order
  const poses = D ? [
    S('hero', { z: 0, rx: 0.15, ry: -0.5, rz: 0, morph: 0, spin: 0 }),
    S('write', { z: 0, rx: 0.1, ry: 0.35, rz: 0.04, morph: 0, spin: 0 }),
    { ...S('compile', { z: 0, rx: 0, ry: 0, rz: 0, morph: 0, spin: Math.PI * 2 }), s: 0.42 },
    S('hooks', { z: 0, rx: 0.2, ry: -0.35, rz: -0.05, morph: 0, spin: Math.PI * 2 }),
    S('fetch', { z: 0, rx: 0.05, ry: 0.3, rz: 0, morph: 0, spin: Math.PI * 4 }),
    { x: 4.1, y: 1.55, z: 0, rx: 0.3, ry: -0.6, rz: 0.2, s: 0.5, morph: 0, spin: Math.PI * 4 },
    (() => { const p = S('sim', { z: 0, rx: 0.05, ry: -0.12, rz: 0, morph: 1, spin: Math.PI * 4 }); return { ...p, y: p.y + 0.2, s: p.s * 0.7 }; })(),
    { x: 4.1, y: 1.55, z: 0, rx: 0.3, ry: -0.6, rz: -0.1, s: 0.5, morph: 0, spin: Math.PI * 6 },
  ] : [
    { x: 0, y: 1.25, z: 0, rx: 0.15, ry: -0.35, rz: 0, s: 0.62, morph: 0, spin: 0 },
    { x: 0, y: 1.35, z: 0, rx: 0.1, ry: 0.35, rz: 0, s: 0.55, morph: 0, spin: 0 },
    { x: 0, y: 2.6, z: -2, rx: -0.3, ry: 0, rz: 0, s: 0.001, morph: 0, spin: Math.PI * 2 },
    { x: 0, y: 1.35, z: 0, rx: 0.2, ry: 0.4, rz: 0, s: 0.55, morph: 0, spin: Math.PI * 2 },
    { x: 0, y: 1.35, z: 0, rx: 0.05, ry: -0.35, rz: 0, s: 0.55, morph: 0, spin: Math.PI * 4 },
    { x: 0, y: 1.4, z: -1, rx: 0.6, ry: 0, rz: 0, s: 0.7, morph: 0, spin: Math.PI * 4 },
    { x: 0, y: 1.3, z: 0, rx: 0.12, ry: -0.4, rz: 0, s: 0.55, morph: 1, spin: Math.PI * 4 },
    { x: 0, y: 1.45, z: -1, rx: 0.3, ry: 0, rz: 0, s: 0.6, morph: 0, spin: Math.PI * 6 },
  ];
  Object.assign(rig, poses[0]);
  sections.forEach((s, i) => {
    if (i === 0) return;
    gsap.fromTo(rig, { ...poses[i - 1] }, {
      ...poses[i],
      ease: 'power2.inOut',
      immediateRender: false,
      scrollTrigger: { trigger: s, start: 'top bottom', end: 'top top', scrub: 1.1 },
    });
  });
});
}
setupRig();
let resizeTimer = 0;
window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { setupRig(); ScrollTrigger.refresh(); }, 250); });

// ---------- hero intro + scroll-out ----------
const chars = gsap.utils.toArray('.title .ch');
const intro = gsap.timeline({ defaults: { ease: 'expo.out' } });
intro
  .from(chars, { yPercent: 120, rotateX: -80, opacity: 0, duration: 1.3, stagger: 0.028 })
  .to('.title .txt.mark', { backgroundSize: '100% 86%', duration: 0.9, ease: 'power3.inOut' }, '-=0.7')
  .from('#hero .reveal', { y: 30, opacity: 0, duration: 1, stagger: 0.1 }, '-=0.6')
  .from(rig, { s: 0.2, ry: -4, duration: 2, ease: 'expo.out' }, 0);
if (reduced) intro.progress(1);

gsap.fromTo(chars, { x: 0, y: 0, rotate: 0, opacity: 1 }, {
  immediateRender: false,
  y: () => gsap.utils.random(-260, 120),
  x: () => gsap.utils.random(-120, 120),
  rotate: () => gsap.utils.random(-70, 70),
  opacity: 0,
  ease: 'none',
  stagger: { each: 0.01, from: 'random' },
  scrollTrigger: { trigger: '#hero', start: 'top top', end: 'bottom 30%', scrub: 0.8 },
});

// ---------- per-section reveals ----------
sections.slice(1).forEach((s) => {
  const tl = gsap.timeline({ scrollTrigger: { trigger: s, start: 'top 65%', end: 'bottom 35%', toggleActions: 'play reverse play reverse' } });
  if (s.querySelector('.reveal')) tl.from(s.querySelectorAll('.reveal'), { y: 40, opacity: 0, duration: 0.8, stagger: 0.08, ease: 'power3.out' });
  const marks = s.querySelectorAll('h2 .mark');
  if (marks.length) tl.fromTo(marks, { backgroundSize: '0% 86%' }, { backgroundSize: '100% 86%', duration: 0.8, ease: 'power3.inOut' }, 0.35);
  s.querySelectorAll('.reveal-code').forEach((fig, k) => {
    tl.from(fig, { y: 60, rotateX: 12, opacity: 0, duration: 0.9, ease: 'power3.out', transformPerspective: 1200 }, 0.1 + k * 0.15);
    tl.fromTo(fig.querySelectorAll('.face:not(.back) .ln, pre:not(.face) .ln'), { x: -24, autoAlpha: 0 }, { x: 0, autoAlpha: 1, duration: 0.5, stagger: 0.025, ease: 'power2.out', clearProps: 'opacity,visibility,transform' }, 0.3 + k * 0.15);
  });
});

// cards fly in like a deck, then tilt with the pointer
gsap.from('.card', {
  y: 120, rotateX: -70, opacity: 0, transformOrigin: '50% 0%', duration: 1, ease: 'back.out(1.4)',
  stagger: { each: 0.08, grid: [3, 2], from: 'start' },
  scrollTrigger: { trigger: '#hooks', start: 'top 60%', toggleActions: 'play none none reverse' },
});
document.querySelectorAll('.card').forEach((card) => {
  card.addEventListener('pointermove', (e) => {
    const r = card.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
    gsap.to(card, { rotateY: px * 14, rotateX: -py * 14, z: 20, duration: 0.4, ease: 'power2.out' });
  });
  card.addEventListener('pointerleave', () => gsap.to(card, { rotateY: 0, rotateX: 0, z: 0, duration: 0.6, ease: 'elastic.out(1, 0.5)' }));
});

// stats count up
document.querySelectorAll('.stat b').forEach((b) => {
  const target = Number(b.dataset.count);
  const o = { v: 0 };
  ScrollTrigger.create({
    trigger: '#perf', start: 'top 60%',
    onEnter: () => gsap.fromTo(o, { v: target === 0 ? 99 : 0 }, { v: target, duration: 1.6, ease: 'power3.out', onUpdate: () => { b.textContent = Math.round(o.v); } }),
    onEnterBack: () => { b.textContent = target; },
  });
});
gsap.from('.stat', { y: 80, opacity: 0, scale: 0.9, duration: 0.9, stagger: 0.1, ease: 'power3.out', scrollTrigger: { trigger: '#perf', start: 'top 60%', toggleActions: 'play none none reverse' } });

// marquee of supported building blocks
const words = ['<div>', '<text>', '<image>', '<list>', '<swiper>', '<scroll>', '<stack>', '<slider>', '<switch>', '<picker>', '<progress>', '<marquee>', '<chart>', '<qrcode>', 'useState', 'useEffect', 'useMemo', 'useRef', 'useCallback', '@system.fetch', '@system.storage', '@system.vibrator', '@system.interconnect', '@system.sensor', '@system.router'];
const track = document.querySelector('.track');
track.innerHTML = [...words, ...words].map((w) => `<span>${esc(w)}</span>`).join('');
if (!reduced) gsap.to(track, { xPercent: -50, duration: 40, ease: 'none', repeat: -1 });

// terminal lines
gsap.from('.tline', { x: -30, opacity: 0, duration: 0.6, stagger: 0.35, ease: 'power2.out', scrollTrigger: { trigger: '#start', start: 'top 55%', toggleActions: 'play none none reverse' } });

// ---------- compile: TSX ↔ .ux line mapping ----------
const groups = ['state', 'derived', 'effect', 'handler', 'jsx'];
const compilePres = [...document.querySelectorAll('#compile pre')];
const legend = [...document.querySelectorAll('.legend button')];
function focusGroup(g) {
  legend.forEach((b) => b.classList.toggle('on', b.dataset.g === g));
  compilePres.forEach((pre) => {
    pre.classList.toggle('focus', !!g);
    pre.dataset.g = g || '';
    let first = null;
    pre.querySelectorAll('.ln').forEach((ln) => {
      const on = ln.dataset.g === g;
      ln.classList.toggle('hl', on);
      if (on && !first) first = ln;
    });
    if (first) gsap.to(pre, { scrollTop: Math.max(0, first.offsetTop - 40), duration: 0.6, ease: 'power2.inOut' });
  });
}
function compileAutoplay(on) {
  clearInterval(autoTimer);
  if (!on) return;
  autoTimer = setInterval(() => {
    if (Date.now() < pausedUntil) return;
    focusGroup(groups[gi++ % groups.length]);
  }, 2200);
}
legend.forEach((b) => {
  const pick = () => { pausedUntil = Date.now() + 6000; focusGroup(b.dataset.g); };
  b.addEventListener('mouseenter', pick);
  b.addEventListener('click', pick);
});
compilePres.forEach((pre) => pre.addEventListener('pointerover', (e) => {
  const ln = e.target.closest('.ln');
  if (ln && ln.dataset.g) { pausedUntil = Date.now() + 6000; focusGroup(ln.dataset.g); }
}));

// ---------- fetch: flip between TSX and .ux ----------
const flip = document.querySelector('.code.flip');
const faces = flip.querySelector('.faces');
const fname = flip.querySelector('.fname');
document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => {
  const back = b.dataset.tab === '1';
  document.querySelectorAll('.tabs button').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
  gsap.to(faces, { rotateY: back ? 180 : 0, duration: 0.9, ease: 'power3.inOut' });
  gsap.to(fname, { opacity: 0, duration: 0.2, onComplete: () => { fname.textContent = back ? 'src/pages/weather/weather.ux' : 'pages/weather/weather.tsx'; gsap.to(fname, { opacity: 1, duration: 0.3 }); } });
}));

// ---------- misc ----------
document.querySelectorAll('[data-copy]').forEach((btn) => btn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(btn.dataset.copy);
    btn.classList.add('copied');
    btn.querySelector('i').textContent = 'copied ✓';
    setTimeout(() => { btn.classList.remove('copied'); btn.querySelector('i').textContent = 'copy'; }, 1800);
  } catch (e) { /* clipboard blocked */ }
}));


// magnetic buttons
document.querySelectorAll('.btn, .cmd').forEach((el) => {
  el.addEventListener('pointermove', (e) => {
    const r = el.getBoundingClientRect();
    gsap.to(el, { x: (e.clientX - r.left - r.width / 2) * 0.25, y: (e.clientY - r.top - r.height / 2) * 0.35, duration: 0.4, ease: 'power3.out' });
  });
  el.addEventListener('pointerleave', () => gsap.to(el, { x: 0, y: 0, duration: 0.7, ease: 'elastic.out(1, 0.4)' }));
});

document.fonts && document.fonts.ready.then(() => { setupRig(); ScrollTrigger.refresh(); });
