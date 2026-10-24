/**
 * scripts/release.js
 * Builds a signed release .rpk with the optimizations the Vela best-practice
 * guide recommends (guide/best-practice/start, guide/best-practice/memory):
 *   --drop-console log,info,debug   fewer logs (warn/error are kept)
 *   --enable-image-png8             smaller images, better frame rate
 *   --complete-feature              declares used @system.* features in the manifest
 *
 * A release package must be signed with YOUR key in ./sign. Keep that key:
 * updates to a published app must be signed with the same one.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SIGN = path.join(ROOT, 'sign');

if (!fs.existsSync(path.join(SIGN, 'private.pem')) || !fs.existsSync(path.join(SIGN, 'certificate.pem'))) {
  console.error('\x1b[31m%s\x1b[0m', '❌ No signing key in ./sign (private.pem + certificate.pem).');
  console.error('Create one with OpenSSL (Vela docs, guide/start/use-ide) and back it up:\n');
  console.error('  mkdir sign && cd sign');
  console.error('  openssl req -newkey rsa:2048 -nodes -keyout private.pem -x509 -days 3650 -out certificate.pem\n');
  process.exit(1);
}

execSync('node scripts/copy-static.js', { cwd: ROOT, stdio: 'inherit' });
execSync('node scripts/build-jsx.js', { cwd: ROOT, stdio: 'inherit' });
const aiot = require.resolve('aiot-toolkit/lib/bin.js', { paths: [ROOT] });
execSync(
  `"${process.execPath}" "${aiot}" release --complete-feature --enable-image-png8 --drop-console log,info,debug`,
  { cwd: ROOT, stdio: 'inherit' },
);
