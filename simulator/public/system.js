// Simulated @system.* modules. Callback style (success/fail/complete) as on
// the watch; fetch also returns a Promise whose value wraps the response once
// more ({ data: { code, data, headers } }), matching the device.

const log = (...a) => window.simLog && window.simLog('log', ...a);
const warn = (...a) => window.simLog && window.simLog('warn', ...a);

function done(o, ok, value, code) {
  try {
    if (ok) o.success && o.success(value);
    else o.fail && o.fail(value, code);
  } finally {
    o.complete && o.complete();
  }
}

export function createSystemModules(sim) {
  const pkg = sim.manifest.package || 'app';
  const storeKey = (k) => `kovo-sim:${pkg}:${k}`;

  const fetchModule = {
    fetch(o = {}) {
      const method = (o.method || 'GET').toUpperCase();
      let url = o.url;
      let body;
      if (o.data != null) {
        if (method === 'GET') {
          const qs = typeof o.data === 'string' ? o.data : new URLSearchParams(o.data).toString();
          url += (url.includes('?') ? '&' : '?') + qs;
        } else {
          body = typeof o.data === 'string' ? o.data : JSON.stringify(o.data);
        }
      }
      const headers = Object.assign({}, o.header || {});
      if (body && !Object.keys(headers).some((h) => h.toLowerCase() === 'content-type')) headers['Content-Type'] = 'application/json';
      log(`fetch ${method} ${o.url}`);
      // Proxied through the dev server: the watch has no CORS restrictions.
      const p = fetch(`/__proxy?url=${encodeURIComponent(url)}`, { method, headers, body })
        .then(async (res) => {
          const text = await res.text();
          let data = text;
          if (o.responseType === 'json') {
            try {
              data = JSON.parse(text);
            } catch (e) {
              data = text;
            }
          }
          const result = { code: res.status, data, headers: Object.fromEntries(res.headers.entries()) };
          done(o, true, result);
          return { data: result };
        })
        .catch((e) => {
          warn(`fetch failed: ${e.message}`);
          done(o, false, e.message, 1000);
          throw { data: e.message, code: 1000 };
        });
      p.catch(() => {});
      return p;
    },
  };

  const storage = {
    get(o = {}) {
      const v = localStorage.getItem(storeKey(o.key));
      done(o, true, v == null ? (o.default !== undefined ? o.default : '') : v);
    },
    set(o = {}) {
      if (o.value === undefined || o.value === '') localStorage.removeItem(storeKey(o.key));
      else localStorage.setItem(storeKey(o.key), String(o.value));
      done(o, true);
    },
    delete(o = {}) {
      localStorage.removeItem(storeKey(o.key));
      done(o, true);
    },
    clear(o = {}) {
      Object.keys(localStorage).filter((k) => k.startsWith(storeKey(''))).forEach((k) => localStorage.removeItem(k));
      done(o, true);
    },
    key(o = {}) {
      const keys = Object.keys(localStorage).filter((k) => k.startsWith(storeKey('')));
      done(o, true, (keys[o.index] || '').slice(storeKey('').length));
    },
    get length() {
      return Object.keys(localStorage).filter((k) => k.startsWith(storeKey(''))).length;
    },
  };

  const prompt = {
    showToast(o = {}) {
      const el = document.createElement('div');
      el.className = 'sim-toast';
      el.textContent = o.message;
      document.getElementById('vela-screen').append(el);
      setTimeout(() => el.remove(), o.duration === 1 ? 3500 : 2000);
    },
    showDialog(o = {}) {
      const ok = window.confirm(`${o.title || ''}\n${o.message || ''}`);
      done(o, true, { index: ok ? 0 : 1 });
    },
  };

  const vibrator = {
    vibrate(o = {}) {
      const frame = document.getElementById('device');
      frame.classList.remove('sim-vibrate');
      void frame.offsetWidth;
      frame.classList.add('sim-vibrate');
      log(`vibrate ${o.mode || 'long'}`);
    },
    start() {
      vibrator.vibrate();
    },
    stop() {},
  };

  const device = {
    getInfo(o = {}) {
      done(o, true, {
        brand: 'Xiaomi', manufacturer: 'Xiaomi', model: sim.device.name, product: sim.device.id,
        osType: 'vela', osVersionName: 'simulator', platformVersionCode: 1000, APILevel: 4,
        deviceType: sim.device.type, screenShape: sim.device.shape,
        screenWidth: sim.device.width, screenHeight: sim.device.height, screenDensity: 2,
        language: navigator.language.split('-')[0], region: (navigator.language.split('-')[1] || '').toUpperCase(),
      });
    },
    getDeviceId(o = {}) {
      done(o, true, { deviceId: 'simulator' });
    },
    getSerial(o = {}) {
      done(o, true, { serial: 'SIM0000' });
    },
    getTotalStorage(o = {}) {
      done(o, true, { totalStorage: 4e9 });
    },
    getAvailableStorage(o = {}) {
      done(o, true, { availableStorage: 2e9 });
    },
  };

  const app = {
    getInfo() {
      return { packageName: pkg, name: sim.manifest.name, versionName: sim.manifest.versionName, versionCode: sim.manifest.versionCode };
    },
    terminate() {
      log('app.terminate()');
      sim.destroyAll && sim.destroyAll();
    },
  };

  let ic = null;
  const interconnect = {
    instance() {
      if (ic) return ic;
      ic = {
        onmessage: null,
        onopen: null,
        onclose: null,
        onerror: null,
        getReadyState(o = {}) {
          done(o, true, { status: 1 });
        },
        diagnosis(o = {}) {
          done(o, true, { status: 0 });
        },
        send(o = {}) {
          log(`interconnect.send → phone: ${JSON.stringify(o.data)}`);
          window.dispatchEvent(new CustomEvent('sim:interconnect', { detail: o.data }));
          done(o, true);
        },
      };
      window.simPhoneSend = (data) => ic.onmessage && ic.onmessage({ data: typeof data === 'string' ? data : JSON.stringify(data) });
      return ic;
    },
  };

  const sensorSubs = {};
  const subscribe = (name, gen, interval = 200) => (o = {}) => {
    clearInterval(sensorSubs[name]);
    sensorSubs[name] = setInterval(() => o.callback && o.callback(gen()), interval);
  };
  const unsubscribe = (name) => () => clearInterval(sensorSubs[name]);
  const sensor = {
    subscribeAccelerometer: subscribe('acc', () => ({ x: Math.sin(Date.now() / 500), y: Math.cos(Date.now() / 700), z: 9.8 })),
    unsubscribeAccelerometer: unsubscribe('acc'),
    subscribeCompass: subscribe('compass', () => ({ direction: (Date.now() / 50) % 360, accuracy: 3 })),
    unsubscribeCompass: unsubscribe('compass'),
    subscribePressure: subscribe('pressure', () => ({ pressure: 1013 + Math.sin(Date.now() / 3000) })),
    unsubscribePressure: unsubscribe('pressure'),
  };

  const battery = {
    getStatus(o = {}) {
      done(o, true, { charging: false, level: 0.8 });
    },
  };

  const network = {
    getType(o = {}) {
      done(o, true, { type: navigator.onLine ? 'wifi' : 'none', metered: false });
    },
    subscribe() {},
    unsubscribe() {},
  };

  const modules = {
    'system.router': sim.router ? sim.router : null,
    'system.fetch': fetchModule,
    'system.storage': storage,
    'system.prompt': prompt,
    'system.vibrator': vibrator,
    'system.device': device,
    'system.app': app,
    'system.interconnect': interconnect,
    'system.sensor': sensor,
    'system.battery': battery,
    'system.network': network,
    __missing(name) {
      return new Proxy({}, {
        get(_, fn) {
          return (o = {}) => {
            warn(`${name}.${String(fn)}() is not simulated`);
            done(o, false, 'not simulated', 1000);
          };
        },
      });
    },
  };
  // router is created after the modules: resolve it lazily.
  Object.defineProperty(modules, 'system.router', { get: () => sim.router, enumerable: true });
  return modules;
}
