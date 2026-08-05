/**
 * Copies manifest.json and resources/ from src-tsx/ to src/.
 * Run this before build-jsx.js.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC_TSX = path.join(ROOT, 'src-tsx');
const SRC_OUT = path.join(ROOT, 'src');

function copyFile(src, dst) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  console.log(`  ${path.relative(ROOT, src)}  ->  ${path.relative(ROOT, dst)}`);
}

function copyDir(srcDir, dstDir) {
  if (!fs.existsSync(srcDir)) return;
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const s = path.join(srcDir, entry.name);
    const d = path.join(dstDir, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else if (entry.isFile()) copyFile(s, d);
  }
}

function scanPages(dir, baseDir = dir) {
  const pages = [];
  if (!fs.existsSync(dir)) return pages;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      pages.push(...scanPages(full, baseDir));
    } else if (entry.isFile() && /\.(tsx|jsx)$/i.test(entry.name)) {
      const relPath = path.relative(path.join(baseDir, '..'), full).replace(/\\/g, '/');
      const pageRoute = relPath.replace(/\/[^/]+\.(tsx|jsx)$/i, '').replace(/\.(tsx|jsx)$/i, '');
      const componentName = path.basename(full, path.extname(full));
      pages.push({ pageRoute, componentName });
    }
  }
  return pages;
}

function syncManifest(manifestPath, pagesDir, outManifestPath) {
  let manifest = {};
  if (fs.existsSync(manifestPath)) {
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch (e) {
      console.warn(`[kovo] Could not parse manifest.json: ${e.message}`);
    }
  }
  manifest.router = manifest.router || {};
  manifest.router.pages = manifest.router.pages || {};

  const detectedPages = scanPages(pagesDir);
  const updatedPages = {};

  for (const p of detectedPages) {
    const existing = manifest.router.pages[p.pageRoute] || {};
    updatedPages[p.pageRoute] = {
      component: p.componentName,
      ...existing,
    };
  }

  manifest.router.pages = updatedPages;
  if (!manifest.router.entry && detectedPages.length > 0) {
    manifest.router.entry = detectedPages[0].pageRoute;
  }

  fs.mkdirSync(path.dirname(outManifestPath), { recursive: true });
  fs.writeFileSync(outManifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`  Auto-generated routes for ${Object.keys(updatedPages).length} page(s) -> ${path.relative(ROOT, outManifestPath)}`);
  return manifest;
}

function main() {
  if (!fs.existsSync(SRC_TSX)) {
    console.error(`No src-tsx/ directory at ${SRC_TSX}`);
    process.exit(1);
  }
  console.log('Copying static files & auto-generating routes from src-tsx/ -> src/');

  const manifestSrc = path.join(SRC_TSX, 'manifest.json');
  const pagesSrc = path.join(SRC_TSX, 'pages');
  const manifestDst = path.join(SRC_OUT, 'manifest.json');

  syncManifest(manifestSrc, pagesSrc, manifestDst);

  const resourcesSrc = path.join(SRC_TSX, 'resources');
  if (fs.existsSync(resourcesSrc)) {
    copyDir(resourcesSrc, path.join(SRC_OUT, 'resources'));
  }

  console.log('Done.');
}

module.exports = {
  scanPages,
  syncManifest,
  main,
};

if (require.main === module) {
  main();
}
