/**
 * Guards against the scaffolding templates drifting from the tested compiler.
 * Fix a failure with:  node scripts/sync-templates.js
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { SHARED_FILES, SHARED, ROOT } = require('./sync-templates.js');

for (const [src, rel] of SHARED_FILES) {
  test(`templates/_shared/${rel} matches ${src}`, () => {
    const a = fs.readFileSync(path.join(ROOT, src), 'utf8');
    const b = fs.readFileSync(path.join(SHARED, rel), 'utf8');
    assert.ok(a === b, `${rel} differs — run: node scripts/sync-templates.js`);
  });
}
