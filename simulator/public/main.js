import { startApp } from './runtime.js';

// Screen sizes from the Vela device docs / emulator; designWidth scales px.
const PROFILES = [
  { id: 'round-466', name: 'Round 466 (Watch S series)', width: 466, height: 466, shape: 'circle', type: 'watch' },
  { id: 'rect-432x514', name: 'Rect 432×514 (Vela emulator)', width: 432, height: 514, shape: 'rect', type: 'watch' },
  { id: 'rect-390x450', name: 'Rect 390×450 (Redmi Watch)', width: 390, height: 450, shape: 'rect', type: 'watch' },
  { id: 'band-212x520', name: 'Band 212×520 (Smart Band)', width: 212, height: 520, shape: 'pill', type: 'band' },
];

const logEl = document.getElementById('log');
window.simLog = (level, ...args) => {
  const line = document.createElement('div');
  line.className = level;
  line.textContent = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  logEl.append(line);
  logEl.scrollTop = logEl.scrollHeight;
  (console[level] || console.log)('[sim]', ...args);
};
// App console.log goes to the panel too.
for (const level of ['log', 'info', 'warn', 'error']) {
  const orig = console[level].bind(console);
  console[level] = (...a) => {
    orig(...a);
    if (a[0] === '[sim]') return;
    const line = document.createElement('div');
    line.className = level === 'error' ? 'error' : level === 'warn' ? 'warn' : '';
    line.textContent = a.map((x) => (typeof x === 'string' ? x : safeJson(x))).join(' ');
    logEl.append(line);
    logEl.scrollTop = logEl.scrollHeight;
  };
}
function safeJson(x) {
  try {
    return JSON.stringify(x);
  } catch (e) {
    return String(x);
  }
}

const select = document.getElementById('profile');
PROFILES.forEach((p) => select.append(new Option(p.name, p.id)));
const params = new URLSearchParams(location.search);
let saved = null;
try {
  saved = localStorage.getItem('kovo-sim:profile');
} catch (e) { /* storage blocked */ }
select.value = params.get('device') || saved || PROFILES[0].id;

const device = document.getElementById('device');
const viewport = document.getElementById('viewport');
const screen = document.getElementById('vela-screen');
const errorEl = document.getElementById('error');
let current = null;

function layout(profile, design) {
  const h = Math.round((design * profile.height) / profile.width);
  screen.style.width = `${design}px`;
  screen.style.height = `${h}px`;
  const stage = document.getElementById('stage').getBoundingClientRect();
  const fit = Math.min(1, (stage.width - 80) / profile.width, (stage.height - 80) / profile.height);
  const px = profile.width * fit;
  viewport.style.width = `${px}px`;
  viewport.style.height = `${profile.height * fit}px`;
  window.simScale = px / design;
  screen.style.transform = `scale(${window.simScale})`;
  device.className = profile.shape;
}

async function boot() {
  const profile = PROFILES.find((p) => p.id === select.value) || PROFILES[0];
  if (current) current.sim.destroyAll();
  screen.innerHTML = '';
  errorEl.style.display = 'none';
  try {
    current = await startApp({ screen, styleEl: document.getElementById('page-style'), device: profile });
    layout(profile, current.design);
    const display = current.sim.manifest.display || {};
    viewport.style.background = display.backgroundColor || '#000';
    screen.style.color = display.textColor || '';
  } catch (e) {
    errorEl.textContent = `${e.message}\n\n${e.stack || ''}`;
    errorEl.style.display = 'block';
    window.simLog('error', e.message);
  }
}

window.addEventListener('sim:page', (e) => {
  document.getElementById('route').textContent = `${e.detail.route}  (stack ${e.detail.depth})`;
});
window.addEventListener('error', (e) => window.simLog('error', e.message));
window.addEventListener('unhandledrejection', (e) => window.simLog('error', String(e.reason && e.reason.message || e.reason)));
select.addEventListener('change', () => {
  try {
    localStorage.setItem('kovo-sim:profile', select.value);
  } catch (e) { /* storage blocked */ }
  boot();
});
document.getElementById('reload').addEventListener('click', boot);
document.getElementById('back').addEventListener('click', () => current && current.sim.router.back());
window.addEventListener('resize', () => {
  const profile = PROFILES.find((p) => p.id === select.value);
  if (current) layout(profile, current.design);
});
document.getElementById('phone').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = document.getElementById('phone-msg');
  if (window.simPhoneSend) window.simPhoneSend(input.value);
  else window.simLog('warn', 'the app has not called interconnect.instance()');
  input.value = '';
});

// Live reload when the toolkit rewrites build/ (off with ?static=1, e.g. headless screenshots).
if (!params.has('static')) try {
  const es = new EventSource('/__events');
  es.onmessage = (e) => {
    if (e.data === 'reload') {
      window.simLog('log', '↻ build changed, reloading');
      boot();
    }
  };
} catch (e) { /* no SSE */ }

// Scripted interactions for automated checks: ?run=click:.btn-step;wait:300;back
async function runScript(script) {
  for (const step of script.split(';').filter(Boolean)) {
    const [cmd, ...rest] = step.split(':');
    const arg = rest.join(':');
    if (cmd === 'wait') await new Promise((r) => setTimeout(r, Number(arg) || 100));
    else if (cmd === 'back') current.sim.router.back();
    else if (cmd === 'click') {
      const pages = [...screen.querySelectorAll('.vela-page')].filter((p) => p.style.display !== 'none');
      const el = pages.length && pages[pages.length - 1].querySelector(arg);
      if (el) el.click();
      else window.simLog('warn', `run: no element ${arg}`);
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  window.simLog('log', 'run: done');
}

boot().then(() => params.get('run') && runScript(params.get('run')));
