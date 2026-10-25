/**
 * Tests for the build script's dependency tracking (used by the dev watcher).
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { findImportedFiles, findAffectedFiles, walk } = require('./build-jsx.js');
const { resolveSourceFile } = require('./babel-plugin-vela-ux.js');

describe('build-jsx dependency tracking', () => {
  let dir;
  const file = (rel, src) => {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, src);
    return full;
  };
  let card;
  let hooks;
  let home;
  let about;
  let lib;

  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kovo-build-'));
    lib = file('lib/format.ts', 'export const pad = (n) => n;');
    hooks = file('hooks/index.ts', "import { pad } from '../lib/format';\nexport function useX() {}");
    card = file('components/Card/Card.tsx', 'export default function Card() { return <div/>; }');
    home = file('pages/home/home.tsx', [
      "import Card from '../../components/Card/Card';",
      "import { useX } from '../../hooks';",
      "import router from '@system.router';",
      'export default function Home() { return <Card/>; }',
    ].join('\n'));
    about = file('pages/about/about.tsx', 'export default function About() { return <div/>; }');
  });
  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  test('imports resolve without extensions and through index files', () => {
    assert.deepEqual(findImportedFiles(home, null).sort(), [card, hooks].sort());
  });

  test('editing a component rebuilds it and its importers', () => {
    const sources = walk(dir, [], /\.(tsx|jsx|ts|js)$/);
    assert.deepEqual(findAffectedFiles(card, sources).sort(), [card, home].sort());
  });

  test('editing a helper re-emits it and rebuilds importing pages transitively', () => {
    const sources = walk(dir, [], /\.(tsx|jsx|ts|js)$/);
    assert.deepEqual(findAffectedFiles(lib, sources).sort(), [hooks, home, lib].sort());
  });

  test('deleting an imported file rebuilds its importers', () => {
    const badge = file('components/Badge/Badge.tsx', 'export default function Badge() { return <div/>; }');
    const page = file('pages/b/b.tsx', "import Badge from '../../components/Badge/Badge';\nexport default function B() { return <Badge/>; }");
    fs.rmSync(badge);
    const sources = walk(dir, [], /\.(tsx|jsx|ts|js)$/);
    assert.deepEqual(findAffectedFiles(badge, sources), [page]);
    fs.rmSync(page);
  });

  test('imports resolve with the same extension order as the compiler', () => {
    const tsx = file('lib/util.tsx', 'export const a = 1;');
    file('lib/util.ts', 'export const a = 2;');
    const user = file('pages/u/u.tsx', "import { a } from '../../lib/util';\nexport default function U() { return <div/>; }");
    assert.deepEqual(findImportedFiles(user, null), [tsx]);
    assert.equal(resolveSourceFile('../../lib/util', user), tsx);
    for (const f of [tsx, path.join(dir, 'lib/util.ts'), user]) fs.rmSync(f);
  });

  test('import specifiers come from the AST, not from strings or comments', () => {
    const f = file('pages/s/s.tsx', [
      "import router from '@system.router';",
      "// import X from './nope'",
      "const s = \"export default from './nope2'\";",
      'export default function S() { return <div/>; }',
    ].join('\n'));
    assert.deepEqual(findImportedFiles(f, null), []);
    fs.rmSync(f);
  });

  test('unrelated pages are not rebuilt', () => {
    const sources = walk(dir, [], /\.(tsx|jsx|ts|js)$/);
    assert.ok(!findAffectedFiles(card, sources).includes(about));
  });
});
