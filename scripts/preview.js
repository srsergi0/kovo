/**
 * scripts/preview.js
 * Builds TSX -> .ux, compiles .ux -> .rpk via aiot build, and launches preview.
 */

const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');

console.log('\x1b[36m%s\x1b[0m', '🚀 Step 1: Compiling React TSX -> Xiaomi Vela .ux...');
try {
  execSync('bun run build', { cwd: ROOT, stdio: 'inherit' });
} catch (e) {
  console.error('\x1b[31m%s\x1b[0m', '❌ TSX compilation failed.');
  process.exit(1);
}

console.log('\x1b[36m%s\x1b[0m', '\n📦 Step 2: Compiling .ux -> .rpk package (aiot build)...');
try {
  execSync('aiot build --complete-feature', { cwd: ROOT, stdio: 'inherit' });
  console.log('\x1b[32m%s\x1b[0m', '✓ .rpk package generated successfully in dist/!');
} catch (e) {
  console.error('\x1b[31m%s\x1b[0m', '❌ aiot build failed.');
  process.exit(1);
}

console.log('\x1b[35m%s\x1b[0m', '\n⌚ Step 3: Launching Xiaomi Vela simulator server (aiot server)...');
try {
  const child = spawn('aiot', ['server', '--watch', '--open-nuttx', '--enable-custom-component'], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: true,
  });

  child.on('error', (err) => {
    console.error('\x1b[31m%s\x1b[0m', `Failed to start simulator: ${err.message}`);
  });
} catch (e) {
  console.error('\x1b[31m%s\x1b[0m', `Failed to start aiot server: ${e.message}`);
}
