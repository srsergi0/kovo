/**
 * Copies the canonical compiler, build scripts, typings and AI-agent guide
 * from the repo root into create-kovo-ux/templates/_shared so scaffolded
 * projects ship exactly what the tests cover. Run after changing any of
 * SHARED_FILES:
 *
 *   node scripts/sync-templates.js
 *
 * scripts/template-sync.test.js fails while the copies differ.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SHARED = path.join(ROOT, 'create-kovo-ux', 'templates', '_shared');

// [source in repo root, destination in templates/_shared]
const SHARED_FILES = [
  'babel.config.js',
  'scripts/babel-plugin-vela-ux.js',
  'scripts/build-jsx.js',
  'scripts/copy-static.js',
  'scripts/dev.js',
  'scripts/dev-emulator.js',
  'scripts/release.js',
  'types/kovo.d.ts',
  ['docs/ai/app-guide.md', 'AGENTS.md'],
  ['docs/ai/CLAUDE.template.md', 'CLAUDE.md'],
].map((entry) => (Array.isArray(entry) ? entry : [entry, entry]));

function main() {
  for (const [src, rel] of SHARED_FILES) {
    const dest = path.join(SHARED, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(ROOT, src), dest);
    console.log(`  ${src}${src === rel ? '' : `  ->  ${rel}`}`);
  }
  console.log(`Synced ${SHARED_FILES.length} file(s) into ${path.relative(ROOT, SHARED)}.`);
}

module.exports = { SHARED_FILES, SHARED, ROOT };

if (require.main === module) {
  main();
}
