#!/usr/bin/env node
/**
 * Kovo simulator dev server.
 *
 *   node simulator/server.js [--dir build] [--port 4466] [--open]
 *
 * Serves the simulator UI, the toolkit output (`build/`, produced by
 * `aiot build`) under /app/, a CORS-free proxy for @system.fetch, and a
 * server-sent event that reloads the page whenever build/ changes.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const arg = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const ROOT = process.cwd();
const BUILD = path.resolve(ROOT, arg('dir', 'build'));
const PORT = Number(arg('port', process.env.PORT || 4466));
const PUBLIC = path.join(__dirname, 'public');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ttf': 'font/ttf', '.otf': 'font/otf', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
};

function sendFile(res, file) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end(`Not found: ${path.relative(ROOT, file)}`);
      return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
}

/** Resolves `rel` inside `base`, refusing paths that escape it. */
function safeJoin(base, rel) {
  const p = path.resolve(base, `.${path.posix.normalize(`/${decodeURIComponent(rel)}`)}`);
  return p === base || p.startsWith(base + path.sep) ? p : null;
}

const clients = new Set();
let reloadTimer = null;
function watchBuild() {
  if (!fs.existsSync(BUILD)) return;
  try {
    fs.watch(BUILD, { recursive: true }, () => {
      clearTimeout(reloadTimer);
      // The toolkit writes many files; reload once it settles.
      reloadTimer = setTimeout(() => clients.forEach((c) => c.write('data: reload\n\n')), 400);
    });
  } catch (e) {
    console.warn('[kovo-sim] build/ watch unavailable:', e.message);
  }
}

async function proxy(req, res, target) {
  if (!/^https?:\/\//.test(target || '')) {
    res.writeHead(400);
    res.end('bad url');
    return;
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (!['host', 'origin', 'referer', 'connection', 'accept-encoding', 'content-length', 'cookie'].includes(k) && !k.startsWith('sec-')) headers[k] = v;
  }
  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks),
      redirect: 'follow',
    });
    const out = {};
    upstream.headers.forEach((v, k) => {
      if (!['content-encoding', 'content-length', 'transfer-encoding', 'connection'].includes(k)) out[k] = v;
    });
    res.writeHead(upstream.status, out);
    res.end(Buffer.from(await upstream.arrayBuffer()));
  } catch (e) {
    res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end(`proxy error: ${e.message}`);
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;
  if (p === '/' || p === '/index.html') return sendFile(res, path.join(PUBLIC, 'index.html'));
  if (p === '/__events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
    res.write(': connected\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return undefined;
  }
  if (p === '/__proxy') return proxy(req, res, url.searchParams.get('url'));
  if (p.startsWith('/sim/')) {
    const f = safeJoin(PUBLIC, p.slice(5));
    return f ? sendFile(res, f) : res.writeHead(403).end();
  }
  if (p.startsWith('/app/')) {
    const f = safeJoin(BUILD, p.slice(5));
    return f ? sendFile(res, f) : res.writeHead(403).end();
  }
  res.writeHead(404);
  res.end();
  return undefined;
});

if (!fs.existsSync(path.join(BUILD, 'manifest.json'))) {
  console.warn(`[kovo-sim] ${path.relative(ROOT, BUILD) || BUILD}/manifest.json not found — run "bun run aiot:build" first.`);
}
watchBuild();
server.listen(PORT, '127.0.0.1', () => {
  console.log(`⌚ Kovo simulator: http://localhost:${PORT}  (serving ${path.relative(ROOT, BUILD) || BUILD})`);
});
