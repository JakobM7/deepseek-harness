#!/usr/bin/env node
/**
 * build.mjs — builds the repo-root dsh-window.exe from make-dsh-window.cjs
 *
 * Pipeline (verified on this machine):
 *   1. node --experimental-sea-config  -> dsh-window.blob (SEA preparation blob)
 *   2. copy the installed node.exe     -> repo-root/dsh-window.exe (fresh copy, no payload)
 *   3. postject injects the blob with the Node SEA sentinel fuse
 *      (single-binary SEA: the launcher IS a Node runtime; no separate files,
 *       no Node install required on the target machine)
 *   4. patch-exe.mjs embeds icon.ico + version info and flips the PE
 *      subsystem CONSOLE -> WINDOWS_GUI, so double-clicking the exe opens
 *      no console window. Runs automatically on every build.
 *
 * Requires: node (>=22), postject, resedit. They are installed once via npm into
 *   ./.npminstall with the cache redirected into ./.npm-cache (network-safe
 *   on machines whose global npm cache is on a blocked volume).
 *
 * Usage:
 *   node build.mjs
 *   node build.mjs --out MyName.exe      (custom output name)
 */
import { readFileSync, writeFileSync, cpSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
let outName = 'dsh-window.exe';
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === '--out' && process.argv[i + 1]) outName = process.argv[++i];
}
const out = join(repoRoot, outName);
const payload = join(here, 'make-dsh-window.cjs');
const seaConfigFile = join(here, 'sea-config.json');
const dshEntry = join(repoRoot, 'apps', 'cli', 'lib', 'bin.js');

const FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';

// --- postject provisioning -----------------------------------------------
function ensureBuildDependencies() {
  const bin = join(here, '.npminstall', 'node_modules', '.bin', 'postject.cmd');
  const resedit = join(here, '.npminstall', 'node_modules', 'resedit', 'dist', 'index.js');
  if (existsSync(bin) && existsSync(resedit)) return bin;
  const cache = join(here, '.npm-cache');
  mkdirSync(cache, { recursive: true });
  console.log('build dependencies not present; installing (cache inside workspace)…');
  const r = spawnSync('npm', ['install', 'postject', 'resedit', '--prefix', '.npminstall', '--cache', cache, '--no-audit', '--no-fund'], {
    cwd: here,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (r.status !== 0) throw new Error('npm install postject failed');
  return bin;
}

if (!existsSync(dshEntry)) {
  throw new Error(`missing ${dshEntry}; run build-dsh-window.bat or pnpm run build first`);
}

// --- SEA config ------------------------------------------------------------
writeFileSync(
  seaConfigFile,
  JSON.stringify({ main: payload, output: 'dsh-window.blob', disableExperimentalSEAWarning: true }, null, 2),
);

// --- 1. blob ---------------------------------------------------------------
console.log('building SEA blob…');
const r = spawnSync('node', ['--experimental-sea-config', seaConfigFile], { cwd: here, stdio: 'inherit' });
if (r.status !== 0) throw new Error('failed to create SEA blob');

// --- 2. copy node.exe -------------------------------------------------------
console.log(`copying ${process.execPath} -> ${out}`);
cpSync(process.execPath, out);

// --- 3. inject --------------------------------------------------------------
const postjectBin = ensureBuildDependencies();
console.log('injecting SEA blob (single-binary)…');
const inject = spawnSync(
  postjectBin,
  [out, 'NODE_SEA_BLOB', join(here, 'dsh-window.blob'), '--sentinel-fuse', FUSE],
  { cwd: here, stdio: 'inherit', shell: process.platform === 'win32' },
);
if (inject.status !== 0) throw new Error('postject injection failed');

// --- 4. patch: icon, version info, CONSOLE -> WINDOWS_GUI ---------------------
// Runs on every build so the exe always gets the GUI subsystem (no console
// window on double-click) plus icon and version resources.
console.log('patching exe (icon, version info, GUI subsystem)…');
const patch = spawnSync(process.execPath, [join(here, 'patch-exe.mjs'), out], {
  cwd: here,
  stdio: 'inherit',
});
if (patch.status !== 0) {
  throw new Error(`patch-exe.mjs failed (exit code ${patch.status})`);
}

console.log(`\nbuilt ${outName}  (${(readFileSync(out).length / 1048576).toFixed(1)} MB)`);
console.log('log file will be: ' + join(repoRoot, 'dsh-window.log'));
console.log('put config.txt (dsh=, workspace=, browser=) next to the exe to override auto-detection.');
