#!/usr/bin/env node

import * as p from '@clack/prompts';
import pc from 'picocolors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMPLATES_DIR = path.join(__dirname, 'templates');

const VERSION = '0.1.0';

// ── Banner ──────────────────────────────────────────────────
console.log();
console.log(pc.cyan(`      ⌚  ${pc.bold('create-kovo-ux')} ${pc.dim(`v${VERSION}`)}`));
console.log(pc.dim('      Build Xiaomi Vela smartwatch apps with React TSX'));
console.log();

p.intro(pc.bgCyan(pc.black(' kovo ')));

// ── Step 1: Project Name ────────────────────────────────────
const projectName = await p.text({
  message: 'What is your project name?',
  placeholder: 'my-watch-app',
  defaultValue: 'my-watch-app',
  validate: (value) => {
    if (!value || !value.trim()) return 'Project name is required.';
    if (/[^a-zA-Z0-9_\-.]/.test(value.trim())) return 'Use only letters, numbers, hyphens, dots, or underscores.';
  },
});

if (p.isCancel(projectName)) {
  p.cancel('Operation cancelled.');
  process.exit(0);
}

// ── Step 2: Template Selection ──────────────────────────────
const template = await p.select({
  message: 'Which template would you like to use?',
  options: [
    {
      value: 'basic',
      label: `${pc.cyan('Basic')}`,
      hint: 'Single page, counter, minimal setup',
    },
    {
      value: 'multi-page',
      label: `${pc.green('Multi-Page')}`,
      hint: 'Dashboard with navigation, components & settings',
    },
    {
      value: 'fetch',
      label: `${pc.magenta('Fetch')}`,
      hint: 'Multi-page + HTTP networking (GET, POST, PUT, DELETE)',
    },
  ],
});

if (p.isCancel(template)) {
  p.cancel('Operation cancelled.');
  process.exit(0);
}

// ── Step 3: Install Dependencies ────────────────────────────
const installDeps = await p.confirm({
  message: 'Install dependencies?',
  initialValue: true,
});

if (p.isCancel(installDeps)) {
  p.cancel('Operation cancelled.');
  process.exit(0);
}

// ── Scaffolding ─────────────────────────────────────────────
const targetDir = path.resolve(process.cwd(), projectName.trim());

const s = p.spinner();
s.start('Scaffolding project...');

// Create target directory
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

// Copy shared files
copyDir(path.join(TEMPLATES_DIR, '_shared'), targetDir);

// Copy template files
copyDir(path.join(TEMPLATES_DIR, template), targetDir);

// Generate package.json with the user's project name
const pkgName = projectName.trim().toLowerCase().replace(/\s+/g, '-');
const pkg = {
  name: pkgName,
  version: '1.0.0',
  description: `Xiaomi Vela smartwatch app built with Kovo`,
  private: true,
  scripts: {
    test: 'bun test',
    dev: 'node scripts/dev.js',
    'dev:emulator': 'node scripts/dev-emulator.js',
    'build:copy': 'node scripts/copy-static.js',
    'build:jsx': 'node scripts/build-jsx.js',
    build: 'bun run clean && bun run build:copy && bun run build:jsx',
    'aiot:build': 'bun run build && aiot build --complete-feature',
    release: 'node scripts/release.js',
    clean: "node -e \"require('fs').rmSync('src',{recursive:true,force:true})\"",
  },
  devDependencies: {
    '@aiot-toolkit/velasim': '^0.1.26',
    '@babel/core': '^7.24.0',
    '@babel/preset-env': '^7.24.0',
    '@babel/preset-react': '^7.24.0',
    '@babel/preset-typescript': '^7.24.0',
    'aiot-toolkit': '^2.0.5',
    typescript: '^5.4.0',
  },
};

// Update manifest package name
const manifestPath = path.join(targetDir, 'src-tsx', 'manifest.json');
if (fs.existsSync(manifestPath)) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.package = `com.kovo.${pkgName.replace(/[^a-z0-9]/g, '')}`;
  manifest.name = projectName.trim();
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
}

fs.writeFileSync(path.join(targetDir, 'package.json'), JSON.stringify(pkg, null, 2) + '\n', 'utf8');

s.stop('Project scaffolded!');

// ── Install Dependencies ────────────────────────────────────
if (installDeps) {
  const s2 = p.spinner();

  // Detect package manager
  const pm = detectPackageManager();
  s2.start(`Installing dependencies with ${pm}...`);

  try {
    execSync(`${pm} install`, { cwd: targetDir, stdio: 'pipe' });
    s2.stop(`Dependencies installed with ${pm}!`);
  } catch (e) {
    s2.stop(pc.yellow(`Could not install dependencies automatically. Run "${pm} install" manually.`));
  }
}

// ── Done ────────────────────────────────────────────────────
const relativeDir = path.relative(process.cwd(), targetDir) || '.';

p.note(
  [
    `cd ${relativeDir}`,
    installDeps ? '' : 'bun install',
    'bun run dev:emulator',
    '',
    'Using an AI coding agent? AGENTS.md (and CLAUDE.md) in the',
    'project tell it everything Kovo and the watch support.',
  ]
    .filter((line, i) => line || i > 2)
    .join('\n'),
  'Next steps'
);

p.outro(pc.green(`Done! Your Kovo project "${pc.bold(projectName.trim())}" is ready. ⌚`));

// ─── Utility Functions ──────────────────────────────────────

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;

  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    // npm drops .gitignore files from published packages, so templates ship it as `gitignore`.
    const destName = entry.name === 'gitignore' ? '.gitignore' : entry.name;
    const destPath = path.join(dest, destName);

    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      copyDir(srcPath, destPath);
    } else {
      // Ensure parent dir exists
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function detectPackageManager() {
  const ua = process.env.npm_config_user_agent || '';
  if (ua.startsWith('bun')) return 'bun';
  if (ua.startsWith('pnpm')) return 'pnpm';
  if (ua.startsWith('yarn')) return 'yarn';

  // Check if bun exists on PATH
  try {
    execSync('bun --version', { stdio: 'pipe' });
    return 'bun';
  } catch {}

  // Check if pnpm exists on PATH
  try {
    execSync('pnpm --version', { stdio: 'pipe' });
    return 'pnpm';
  } catch {}

  return 'npm';
}
