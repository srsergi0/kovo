/**
 * Walks src-tsx/, runs the babel-plugin-vela-ux transform on every .tsx file,
 * resolves cross-file component dependencies, and writes .ux files to src/.
 */

const fs = require('fs');
const path = require('path');

const { buildUxContent } = require('./babel-plugin-vela-ux.js');

const ROOT = path.resolve(__dirname, '..');
const SRC_TSX = path.join(ROOT, 'src-tsx');
const SRC_OUT = path.join(ROOT, 'src');

// ---------------------------------------------------------------------------
// Dependency resolution
// ---------------------------------------------------------------------------

function findImportedTsxFiles(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const results = [];
  // Simple regex-based import scanner (same logic as the plugin but faster)
  const importRe = /import\s+(?:\*\s+as\s+)?\w+\s+from\s+['"]([^'"]+)['"]/g;
  let match;
  const dir = path.dirname(filePath);
  while ((match = importRe.exec(source)) !== null) {
    const resolved = path.resolve(dir, match[1]);
    // Only care about .tsx/.jsx files within src-tsx/
    if (resolved.startsWith(SRC_TSX) && /\.(tsx|jsx)$/i.test(resolved)) {
      results.push(resolved);
    }
  }
  return results;
}

function buildDependencyGraph(files) {
  const adj = {};   // file -> [dependencies]
  const visited = {};
  const order = [];

  for (const f of files) adj[f] = findImportedTsxFiles(f);

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

// ---------------------------------------------------------------------------
// File walker
// ---------------------------------------------------------------------------

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (entry.isFile() && /\.(tsx|jsx)$/.test(entry.name)) files.push(full);
  }
  return files;
}

// ---------------------------------------------------------------------------
// Transform a single file
// ---------------------------------------------------------------------------

function transformFile(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const rel = path.relative(SRC_TSX, filePath);
  const outPath = path.join(SRC_OUT, rel.replace(/\.tsx?$/, '.ux'));
  const { content, warnings } = buildUxContent(source, filePath);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, content, 'utf8');
  for (const w of warnings) console.warn(`[kovo] ${rel}: ${w}`);
  console.log(`  ${rel}  ->  ${path.relative(ROOT, outPath)}`);
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
  for (const f of buildOrder) transformFile(f);

  console.log('\nDone.');
}

module.exports = {
  transformFile,
  walk,
  buildDependencyGraph,
  main,
  SRC_TSX,
  SRC_OUT,
  ROOT,
};

if (require.main === module) {
  main();
}
