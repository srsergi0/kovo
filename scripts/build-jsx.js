/**
 * Walks src-tsx/, runs the babel-plugin-vela-ux transform on every .tsx file,
 * resolves cross-file component dependencies, and writes .ux files to src/.
 *
 * .tsx/.jsx files without a default export (hook modules) are not compiled on
 * their own: the compiler inlines them into the files that use them.
 * Plain .ts/.js modules (helpers, constants) are emitted as .js next to the
 * .ux files so their imports resolve.
 */

const fs = require('fs');
const path = require('path');

const parser = require('@babel/parser');
const { buildUxContent, compileScriptModule, resolveSourceFile, sourceCandidates } = require('./babel-plugin-vela-ux.js');

const ROOT = path.resolve(__dirname, '..');
const SRC_TSX = path.join(ROOT, 'src-tsx');
const SRC_OUT = path.join(ROOT, 'src');

const SOURCE_RE = /\.(tsx|jsx|ts|js)$/i;
const COMPILE_RE = /\.(tsx|jsx)$/i;
const SCRIPT_RE = /^(?!.*\.d\.ts$).*\.(ts|js)$/i;

// ---------------------------------------------------------------------------
// Dependency resolution
// ---------------------------------------------------------------------------

// file -> { mtimeMs, specs }: the watcher re-parses only files that changed.
const importCache = new Map();

/** Relative import specifiers of a file, read from its AST (cached by mtime). */
function relativeImportSpecs(filePath) {
  const { mtimeMs } = fs.statSync(filePath);
  const cached = importCache.get(filePath);
  if (cached && cached.mtimeMs === mtimeMs) return cached.specs;
  let specs = [];
  try {
    const ast = parser.parse(fs.readFileSync(filePath, 'utf8'), {
      sourceType: 'module',
      plugins: ['jsx', 'typescript'],
      errorRecovery: true,
    });
    for (const node of ast.program.body) {
      const src = node.source && node.source.value;
      if (typeof src === 'string' && /^\.{1,2}\//.test(src)) specs.push(src);
    }
  } catch (_) {
    specs = cached ? cached.specs : []; // keep the last known edges while a file has a syntax error
  }
  importCache.set(filePath, { mtimeMs, specs });
  return specs;
}

/** Relative source files imported by `filePath` (limited to `within` when given). */
function findImportedFiles(filePath, within = SRC_TSX) {
  const results = [];
  for (const spec of relativeImportSpecs(filePath)) {
    const resolved = resolveSourceFile(spec, filePath);
    if (resolved && (!within || resolved.startsWith(within))) results.push(resolved);
  }
  return results;
}

/** Whether `filePath` imports `target`; a deleted target matches any path its imports could have meant. */
function importsFile(filePath, target) {
  const exists = fs.existsSync(target);
  return relativeImportSpecs(filePath).some((spec) => (exists
    ? resolveSourceFile(spec, filePath) === target
    : sourceCandidates(spec, filePath).includes(target)));
}

function buildDependencyGraph(files) {
  const adj = {};   // file -> [dependencies]
  const visited = {};
  const order = [];

  for (const f of files) adj[f] = findImportedFiles(f).filter((d) => COMPILE_RE.test(d));

  function dfs(file) {
    if (visited[file] === 1) return; // cycle guard
    if (visited[file] === 2) return; // already processed
    visited[file] = 1;
    for (const dep of (adj[file] || [])) {
      dfs(dep);
    }
    visited[file] = 2;
    order.push(file);
  }

  for (const f of files) {
    if (!visited[f]) dfs(f);
  }

  return order; // topological order: dependencies first
}

/**
 * Files to recompile when `changed` is edited: itself (if compilable) plus
 * every file that imports it directly or transitively. Inlined components
 * and hooks are baked into their importers, so those must be rebuilt too.
 */
function findAffectedFiles(changed, sources = walk(SRC_TSX, [], SOURCE_RE)) {
  const affected = new Set();
  const queue = [changed];
  while (queue.length) {
    const f = queue.shift();
    if (affected.has(f)) continue;
    affected.add(f);
    for (const imp of sources) if (imp !== f && !affected.has(imp) && importsFile(imp, f)) queue.push(imp);
  }
  return [...affected].filter((f) => (COMPILE_RE.test(f) || SCRIPT_RE.test(f)) && fs.existsSync(f));
}

// ---------------------------------------------------------------------------
// File walker
// ---------------------------------------------------------------------------

function walk(dir, files = [], pattern = COMPILE_RE) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files, pattern);
    else if (entry.isFile() && pattern.test(entry.name)) files.push(full);
  }
  return files;
}

// ---------------------------------------------------------------------------
// Transform a single file
// ---------------------------------------------------------------------------

function isCompilable(source) {
  return /export\s+default\b/.test(source);
}

function transformFile(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const rel = path.relative(SRC_TSX, filePath);
  if (SCRIPT_RE.test(filePath)) {
    const exported = [...source.matchAll(/export\s+(?:default\s+)?(?:async\s+)?(?:function\*?|const|let|var|class)\s+([\w$]+)/g)]
      .map((m) => m[1]);
    if (exported.length && exported.every((n) => /^use[A-Z]/.test(n))) {
      console.log(`  ${rel}  (hook module: inlined where it is used)`);
      return false;
    }
    const outPath = path.join(SRC_OUT, rel.replace(/\.ts$/i, '.js'));
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, compileScriptModule(source, filePath) + '\n', 'utf8');
    console.log(`  ${rel}  ->  ${path.relative(ROOT, outPath)}`);
    return true;
  }
  if (!isCompilable(source)) {
    console.log(`  ${rel}  (no default export: inlined where it is used)`);
    return false;
  }
  const outPath = path.join(SRC_OUT, rel.replace(/\.(t|j)sx?$/, '.ux'));
  const { content, warnings } = buildUxContent(source, filePath);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, content, 'utf8');
  for (const w of warnings) console.warn(`[kovo] ${rel}: ${w}`);
  console.log(`  ${rel}  ->  ${path.relative(ROOT, outPath)}`);
  return true;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  if (!fs.existsSync(SRC_TSX)) {
    console.error(`No src-tsx/ directory at ${SRC_TSX}`);
    process.exit(1);
  }

  const allFiles = walk(SRC_TSX);
  if (allFiles.length === 0) {
    console.error('No .tsx files found in src-tsx/.');
    process.exit(1);
  }

  console.log(`Resolving dependencies for ${allFiles.length} file(s)...`);
  const buildOrder = buildDependencyGraph(allFiles);

  console.log(`Build order (${buildOrder.length} files):`);
  for (const f of buildOrder) {
    console.log(`  ${path.relative(SRC_TSX, f)}`);
  }

  console.log('\nTransforming...');
  for (const f of walk(SRC_TSX, [], SCRIPT_RE)) transformFile(f);
  for (const f of buildOrder) transformFile(f);

  console.log('\nDone.');
}

module.exports = {
  transformFile,
  walk,
  buildDependencyGraph,
  findImportedFiles,
  findAffectedFiles,
  main,
  SRC_TSX,
  SRC_OUT,
  ROOT,
};

if (require.main === module) {
  main();
}
