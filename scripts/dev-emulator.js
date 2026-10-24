/**
 * scripts/dev-emulator.js
 * Launches the incremental TSX watcher AND starts the Redmi Watch Vela Virtual Device (emulator)
 * with live hot-reloading! Includes automatic zero-config setup for cloned repositories.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

function ensureVelaEmulatorReady(VelaAvdUtils) {
  const vvdManager = VelaAvdUtils.vvdManager;
  let vvdList = vvdManager.getVvdList();

  // 1. Auto-fix any VVD config.ini missing image.sysdir.2 or image.sysdir.1
  for (const vvd of vvdList) {
    try {
      const vvdDir = vvdManager.getVvdDir(vvd.name);
      const iniPath = path.join(vvdDir, 'config.ini');
      if (fs.existsSync(iniPath)) {
        let content = fs.readFileSync(iniPath, 'utf8');
        let modified = false;

        const sysdir1Match = content.match(/image\.sysdir\.1=(.+)/m);
        const sysdir2Match = content.match(/image\.sysdir\.2=(.+)/m);
        const sysdir1 = sysdir1Match ? sysdir1Match[1].trim() : '';
        const sysdir2 = sysdir2Match ? sysdir2Match[1].trim() : '';

        // If sysdir.2 is empty but sysdir.1 exists
        if (!sysdir2 && sysdir1) {
          content = content.replace(/image\.sysdir\.2=\s*$/m, `image.sysdir.2=${sysdir1}`);
          modified = true;
        }
        // If sysdir.1 is empty but sysdir.2 exists
        if (!sysdir1 && sysdir2) {
          content = content.replace(/image\.sysdir\.1=\s*$/m, `image.sysdir.1=${sysdir2}`);
          modified = true;
        }

        if (modified) {
          fs.writeFileSync(iniPath, content, 'utf8');
          console.log('\x1b[32m%s\x1b[0m', `  ✓ Auto-configured emulator paths in ${vvd.name}/config.ini`);
        }
      }
    } catch (e) {
      // Ignore read errors
    }
  }

  vvdList = vvdManager.getVvdList();

  // 2. If no VVD exists at all (e.g. fresh clone), auto-create default Vela_Virtual_Device
  if (!vvdList || vvdList.length === 0) {
    console.log('\x1b[33m%s\x1b[0m', '⚙ No Vela Virtual Device found. Auto-creating default Redmi Watch emulator...');
    const defaultImagePath = path.join(vvdManager.sdkHome, 'system-images', 'vela-watch-5.0');
    const defaultSkinPath = path.join(vvdManager.sdkHome, 'skins', 'builtin', 'redmi_watch');

    try {
      vvdManager.createVvd({
        name: 'Vela_Virtual_Device',
        arch: 'arm',
        shape: 'rect',
        flavor: 'watch',
        density: 320,
        imageDir: defaultImagePath,
        imageType: 'vela-watch-5.0',
        skin: 'redmi_watch',
        'skin.path': defaultSkinPath,
      });
      console.log('\x1b[32m%s\x1b[0m', '  ✓ Auto-created Redmi Watch Virtual Device (Vela_Virtual_Device)');
    } catch (e) {
      console.warn('\x1b[33m%s\x1b[0m', `  ⚠ Note on VVD creation: ${e.message || e}`);
    }

    vvdList = vvdManager.getVvdList();
  }

  return vvdList;
}

async function main() {
  console.log('\x1b[36m%s\x1b[0m', '🚀 Step 1: Initializing TSX build & auto-routes...');
  execSync('bun run build', { cwd: ROOT, stdio: 'inherit' });

  // Require AIoT toolkit VelaAvdUtils
  let VelaAvdUtils;
  try {
    VelaAvdUtils = require(require.resolve('aiot-toolkit/lib/utils/VelaAvdUtils', { paths: [ROOT] })).default;
  } catch (err) {
    console.error('\x1b[31m%s\x1b[0m', `❌ Could not load AIoT Toolkit emulator modules (is aiot-toolkit installed?): ${err.message}`);
    process.exit(1);
  }

  // Ensure emulator & VVD config are ready
  const vvdList = ensureVelaEmulatorReady(VelaAvdUtils);

  if (!vvdList || vvdList.length === 0) {
    console.error('\x1b[31m%s\x1b[0m', '❌ No Vela Virtual Device available. Run `aiot createVVD` to initialize.');
    process.exit(1);
  }

  const selectedVvd = vvdList[0];
  console.log('\x1b[32m%s\x1b[0m', `⌚ Starting Xiaomi Vela Smartwatch Emulator (${selectedVvd.name} - ${selectedVvd.skin || 'watch'})...`);

  try {
    // Run aiot build to get initial RPK
    const aiotBin = require.resolve('aiot-toolkit/lib/bin.js', { paths: [ROOT] });
    execSync(`"${process.execPath}" "${aiotBin}" build --enable-custom-component`, {
      cwd: ROOT,
      stdio: 'inherit',
    });

    const manifestPath = path.join(ROOT, 'src', 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const packageName = manifest.package;
    const rpkDir = path.join(ROOT, 'dist');
    const rpkCandidates = fs.existsSync(rpkDir)
      ? fs.readdirSync(rpkDir).filter((f) => f.endsWith('.rpk'))
      : [];
    const rpkFile = rpkCandidates.sort().pop();
    const rpkPath = rpkFile ? path.join(rpkDir, rpkFile) : null;

    console.log('\x1b[35m%s\x1b[0m', `📱 Launching RPK package (${packageName}) on smartwatch emulator...`);

    const startRes = await VelaAvdUtils.vvdManager.startVvd({
      vvdName: selectedVvd.name,
      origin: 'Terminal',
    });

    const emulatorInstance = startRes.emulatorInstance;
    if (!rpkPath) {
      console.warn('\x1b[33m%s\x1b[0m', '⚠ No .rpk found in dist/ — the aiot build did not produce a package.');
    }
    if (emulatorInstance && rpkPath) {
      const targetPath = await emulatorInstance.pushRpk(rpkPath, packageName);
      await emulatorInstance.install(targetPath, { packageName });
      await emulatorInstance.startApp(packageName);
      console.log('\x1b[32m%s\x1b[0m', '✨ App launched on Xiaomi Vela Smartwatch emulator!');
    }

    console.log('\x1b[36m%s\x1b[0m', '⚡ Step 2: Starting live TSX incremental file watcher (bun run dev)...');
    require('./dev.js');

  } catch (err) {
    console.error('\x1b[31m%s\x1b[0m', `❌ Error launching emulator: ${err.message}`);
  }
}

main();
