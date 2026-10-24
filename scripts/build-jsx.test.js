/**
 * Tests for the build script's dependency tracking (used by the dev watcher).
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { findImportedFiles, findAffectedFiles, walk } = require('./build-jsx.js');

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

  test('unrelated pages are not rebuilt', () => {
    const sources = walk(dir, [], /\.(tsx|jsx|ts|js)$/);
    assert.ok(!findAffectedFiles(card, sources).includes(about));
  });
});
