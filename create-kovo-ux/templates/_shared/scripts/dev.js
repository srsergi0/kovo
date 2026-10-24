/**
 * scripts/dev.js
 * Dev Server watcher for Kovo POC.
 * Performs initial build and watches src-tsx/ for changes, recompiling modified files instantly.
 */

const fs = require('fs');
const path = require('path');
const { transformFile, findAffectedFiles, main: fullBuild, SRC_TSX, SRC_OUT } = require('./build-jsx.js');

function recompile(files, trigger) {
  for (const file of files) {
    const rel = path.relative(SRC_TSX, file);
    const start = Date.now();
    try {
      if (transformFile(file)) {
        const why = path.join(SRC_TSX, trigger) === file ? '' : ` (uses ${trigger})`;
        console.log('\x1b[32m%s\x1b[0m', `⚡ Recompiled ${rel}${why} in ${Date.now() - start}ms`);
      }
    } catch (err) {
      console.error('\x1b[31m%s\x1b[0m', `❌ Failed to recompile ${rel}: ${err.message}`);
    }
  }
}

console.log('\x1b[36m%s\x1b[0m', '⚡ Kovo Dev Server starting...');

// 1. Initial build
try {
  fullBuild();
  console.log('\x1b[32m%s\x1b[0m', '✓ Initial build completed successfully.\n');
} catch (err) {
  console.error('\x1b[31m%s\x1b[0m', `✗ Initial build failed: ${err.message}`);
}

console.log('\x1b[35m%s\x1b[0m', `👀 Watching for file changes in ${SRC_TSX}... (Press Ctrl+C to stop)`);

// Debounce map for file changes
const changeDebounce = new Map();

function handleFileChange(eventType, filename) {
  if (!filename) return;
  const fullPath = path.join(SRC_TSX, filename);
  
  if (changeDebounce.has(filename)) {
    clearTimeout(changeDebounce.get(filename));
  }

  changeDebounce.set(filename, setTimeout(() => {
    changeDebounce.delete(filename);

    const isSource = /\.(tsx|jsx|ts|js)$/i.test(filename);

    if (!fs.existsSync(fullPath)) {
      const outUx = path.join(SRC_OUT, filename.replace(/\.(t|j)sx?$/, '.ux'));
      if (fs.existsSync(outUx)) {
        fs.unlinkSync(outUx);
        console.log('\x1b[33m%s\x1b[0m', `🗑️ Deleted ${filename} -> ${path.relative(process.cwd(), outUx)}`);
      }
      // Importers may have inlined the deleted file: rebuild them so the error surfaces.
      if (isSource) recompile(findAffectedFiles(fullPath).filter((f) => f !== fullPath), filename);
      return;
    }

    if (isSource) {
      // Inlined components and hooks are baked into their importers, so rebuild those too.
      recompile(findAffectedFiles(fullPath), filename);
    } else if (filename.endsWith('manifest.json') || filename.endsWith('.png') || filename.endsWith('.jpg')) {
      try {
        const target = path.join(SRC_OUT, filename);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(fullPath, target);
        console.log('\x1b[32m%s\x1b[0m', `⚡ Copied static file ${filename}`);
      } catch (err) {
        console.error('\x1b[31m%s\x1b[0m', `❌ Failed to copy ${filename}: ${err.message}`);
      }
    }
  }, 100));
}

try {
  fs.watch(SRC_TSX, { recursive: true }, handleFileChange);
} catch (e) {
  function watchDir(dir) {
    fs.watch(dir, (evt, fn) => handleFileChange(evt, path.relative(SRC_TSX, path.join(dir, fn))));
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) watchDir(path.join(dir, entry.name));
    }
  }
  watchDir(SRC_TSX);
}
