/**
 * Tests for the browser simulator: the reactivity core and the dev server.
 *
 * Run with:  node --test scripts/simulator.test.js
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('simulator reactivity', () => {
  let R;
  before(async () => {
    R = await import(pathToFileURL(path.join(__dirname, '..', 'simulator', 'public', 'reactivity.js')).href);
  });

  test('effects re-run after a batched update', async () => {
    const s = R.reactive({ n: 1 });
    const seen = [];
    R.effect(() => seen.push(s.n));
    s.n = 2;
    s.n = 3;
    await tick();
    assert.deepEqual(seen, [1, 3]);
  });

  test('in-place array push notifies readers of the list', async () => {
    const s = R.reactive({ list: [1] });
    const lengths = [];
    R.effect(() => lengths.push(s.list.map((x) => x).length));
    s.list.push(2);
    await tick();
    assert.deepEqual(lengths, [1, 2]);
  });

  test('computed values are lazy and follow their dependencies', async () => {
    const s = R.reactive({ a: 2 });
    let runs = 0;
    const doubled = R.computed(() => {
      runs++;
      return s.a * 2;
    });
    assert.equal(runs, 0);
    assert.equal(doubled.value, 4);
    s.a = 5;
    assert.equal(doubled.value, 10);
    assert.equal(runs, 2);
  });

  test('stopping a scope stops the effects created inside it', async () => {
    const s = R.reactive({ n: 0 });
    let runs = 0;
    const stop = R.scope(() => R.effect(() => {
      runs++;
      return s.n;
    }));
    stop();
    s.n = 1;
    await tick();
    assert.equal(runs, 1);
  });
});

describe('simulator server', () => {
  let dir;
  let proc;
  const port = 46000 + Math.floor(Math.random() * 1000);
  const get = (p) => new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: p }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode, body, type: res.headers['content-type'] }));
    }).on('error', reject);
  });

  before(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kovo-sim-'));
    fs.mkdirSync(path.join(dir, 'build', 'pages', 'index'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'build', 'manifest.json'), '{"package":"x"}');
    fs.writeFileSync(path.join(dir, 'build', 'pages', 'index', 'index.js'), 'export default function () {}');
    fs.writeFileSync(path.join(dir, 'secret.txt'), 'nope');
    proc = spawn(process.execPath, [path.join(__dirname, '..', 'simulator', 'server.js'), '--port', String(port)], { cwd: dir });
    await new Promise((resolve) => proc.stdout.on('data', (d) => /simulator/.test(String(d)) && resolve()));
  });
  after(async () => {
    // Windows keeps the directory locked (cwd + fs.watch) until the server exits.
    await new Promise((resolve) => {
      proc.on('exit', resolve);
      proc.kill();
    });
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  test('serves the toolkit build under /app/ with a JS content type', async () => {
    const r = await get('/app/pages/index/index.js');
    assert.equal(r.status, 200);
    assert.match(r.type, /javascript/);
  });

  test('serves the simulator UI', async () => {
    const r = await get('/');
    assert.equal(r.status, 200);
    assert.match(r.body, /Kovo Simulator/);
  });

  test('refuses paths outside build/', async () => {
    for (const p of ['/app/../secret.txt', '/app/..%2fsecret.txt', '/app/%2e%2e/secret.txt']) {
      const r = await get(p);
      assert.notEqual(r.status, 200, p);
      assert.doesNotMatch(r.body, /nope/, p);
    }
  });
});
