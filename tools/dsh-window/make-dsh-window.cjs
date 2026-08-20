#!/usr/bin/env node
'use strict';
/**
 * dsh-window launcher payload (Node SEA).
 *
 * Starts `dsh --profile web --port 0 --no-open`, waits for its readiness URL
 * line on stdout, opens the local Chromium-family browser in --app mode, and
 * tears down the dsh server when the window is closed.
 *
 * Resolution order for dsh:  CLI --dsh <entry>  >  config.txt `dsh=`  >
 *   DSH_BIN env  >  checkout found above the exe  >  dsh(.cmd/.bat) on PATH
 *   >  sibling checkout (a deepseek-harness checkout next to the exe).
 * Resolution for workspace:  CLI --workspace  >  config.txt `workspace=`
 *   >  exe directory.
 *
 * Relative paths in config.txt are resolved against the exe directory, so a
 * portable sibling-checkout setup needs no absolute paths:
 *   dsh=..\deepseek-harness\apps\cli\lib\bin.js
 *   workspace=..\deepseek-harness
 *
 * config.txt (optional, next to the exe), one key=value per line:
 *   dsh=..\path\to\apps\cli\lib\bin.js   (relative to the exe, or absolute)
 *   workspace=..\path\to\project
 *   browser=C:\Program Files\Google\Chrome\Application\chrome.exe
 *
 * Invalid (missing) paths from config.txt are ignored and the local fallbacks
 * above are used instead of aborting.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const EXE = process.execPath;
const EXE_DIR = path.dirname(EXE);

const VERSION = 'dsh-window 1.0 (dsh web window launcher for DeepSeek Harness)';

const args = process.argv.slice(2);

// Mutable launcher state, declared up front so that fatal() (used by the
// early error paths below) can tell whether a dsh process was already started
// and therefore has to be torn down before the launcher exits.
let dshChild = undefined;
let browserProc = undefined;
let browserUserData = undefined;
let shuttingDown = false;
let startedOk = false;

// ---------------------------------------------------------------------------
// Logging (must exist before --version/--help: under the GUI subsystem the
// process has no console, so stdout/stderr can be absent or throw on write).
// ---------------------------------------------------------------------------
const LOG_FILE = process.env.DSH_WINDOW_LOG || path.join(EXE_DIR, 'dsh-window.log');
const VERBOSE = Boolean(process.env.DSH_WINDOW_VERBOSE);

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try {
    fs.appendFileSync(LOG_FILE, line);
  } catch {
    /* log is best-effort */
  }
  if (VERBOSE) safeWrite(process.stderr, line);
}

function safeWrite(stream, text) {
  try {
    if (stream && typeof stream.write === 'function') stream.write(text);
  } catch {
    /* no console under GUI subsystem; nothing to do */
  }
}

// Under the GUI subsystem stdout/stderr are invalid handles; a write would
// surface as an async 'error' event and crash the launcher. Swallow them.
for (const s of [process.stdout, process.stderr]) {
  try {
    if (s && typeof s.on === 'function') s.on('error', () => {});
  } catch {
    /* ignore */
  }
}

if (args.includes('--version') || args.includes('-v')) {
  safeWrite(process.stdout, VERSION + '\n');
  log(`version requested: ${VERSION}`);
  process.exit(0);
}
if (args.includes('--help') || args.includes('-h')) {
  safeWrite(
    process.stdout,
    VERSION +
      '\n\nUsage: dsh-window.exe [options] [workspace-path]\n\n' +
      '  (no option)        open DeepSeek Harness in a window\n' +
      '  --workspace <dir>  project directory the GUI uses by default\n' +
      '  --dsh <entry>      dsh entry (node script, dsh.cmd, or node path)\n' +
      '  --browser <exe>    browser executable (Chrome/Edge/Chromium)\n' +
      '  --version          print launcher version\n\n' +
      'Optional config.txt next to the exe: dsh=, workspace=, browser=\n' +
      'Log file: dsh-window.log next to the exe (override with DSH_WINDOW_LOG)\n',
  );
  log('help requested');
  process.exit(0);
}

if (process.platform !== 'win32') {
  safeWrite(process.stderr, 'dsh-window: this launcher targets Windows.\n');
  process.exit(1);
}

function notifyUser(title, body) {
  const text = `DeepSeek Harness Window\r\n\r\n${title}\r\n\r\n${body}\r\n\r\nDetails: ${LOG_FILE}`;
  try {
    const p = spawn('msg.exe', ['*', text], { stdio: 'ignore', windowsHide: true });
    p.on('error', () => {});
    p.unref();
  } catch {
    /* msg.exe may be unavailable; the log file is the fallback record */
  }
}

function fatal(title, body) {
  log(`FATAL ${title}: ${body}`);
  notifyUser(title, body);
  if (dshChild && dshChild.pid !== undefined && !shuttingDown) {
    // A dsh process (possibly a whole tree under a cmd/bat wrapper) is still
    // running: stop it first so no orphan server is left behind, then exit
    // with the error code. Early fatal paths before the dsh spawn keep the
    // direct process.exit(1) below.
    shutdown(1);
  } else {
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// config.txt
// ---------------------------------------------------------------------------
function readConfig() {
  const out = {};
  const file = path.join(EXE_DIR, 'config.txt');
  try {
    for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const line = raw.trim();
      if (line === '' || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq > 0) out[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
    }
  } catch {
    /* no config file is fine */
  }
  // Resolve relative paths in config.txt against the exe directory so the
  // config stays portable (e.g. dsh=..\deepseek-harness\apps\cli\lib\bin.js).
  // Absolute Windows paths (C:\...), UNC (\\server) and rooted (/x, \x) stay
  // as they are.
  for (const key of ['dsh', 'workspace', 'browser']) {
    const v = out[key];
    if (!v) continue;
    if (/^[a-zA-Z]:[\\/]/.test(v) || /^\\\\/.test(v) || /^[\\/]/.test(v)) continue;
    out[key] = path.resolve(EXE_DIR, v);
  }
  return out;
}

const config = readConfig();

function optionValue(flag) {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : undefined;
}

const valueFlags = new Set(['--workspace', '--dsh', '--browser']);
let positionalWs;
for (let i = 0; i < args.length; i++) {
  if (valueFlags.has(args[i])) {
    i++;
    continue;
  }
  if (!args[i].startsWith('--')) {
    positionalWs = args[i];
    break;
  }
}
const cliWorkspace = optionValue('--workspace');
let workspacePath;
if (cliWorkspace) {
  workspacePath = cliWorkspace;
} else if (config.workspace && fs.existsSync(config.workspace)) {
  workspacePath = config.workspace;
} else {
  if (config.workspace) log(`ignoring configured workspace (not found): ${config.workspace}`);
  workspacePath = positionalWs ? path.resolve(positionalWs) : EXE_DIR;
}
const browserOverride = optionValue('--browser') || config.browser;
const dshEntry = optionValue('--dsh') || config.dsh || process.env.DSH_BIN;

if (!fs.existsSync(workspacePath)) {
  fatal('Workspace not found', `The workspace directory does not exist:\n${workspacePath}\n\nSet it with --workspace or in config.txt.`);
}

// ---------------------------------------------------------------------------
// Locate dsh
// ---------------------------------------------------------------------------
function fileInDir(dir, names) {
  for (const n of names) {
    const p = path.join(dir, n);
    try {
      if (fs.statSync(p).isFile()) return p;
    } catch {
      /* keep looking */
    }
  }
  return undefined;
}

function isNodeScript(p) {
  const c = tryReadHead(p);
  return /node/i.test(c);
}
function tryReadHead(p) {
  try {
    return fs.readFileSync(p, 'utf8').slice(0, 64);
  } catch {
    return '';
  }
}

function resolveDsh() {
  if (dshEntry) {
    if (fs.existsSync(dshEntry)) return { kind: 'explicit', value: dshEntry };
    log(`ignoring dsh entry (not found): ${dshEntry}`);
    // fall through to auto-detection instead of failing on a stale path
  }

  // Prefer the checkout containing the exe. This makes the repo-root build
  // deterministic even when another dsh is installed globally.
  let dir = EXE_DIR;
  for (let i = 0; i < 12; i++) {
    const candidate = path.join(dir, 'apps', 'cli', 'lib', 'bin.js');
    if (fs.existsSync(candidate) && fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
      return { kind: 'nodeEntry', value: candidate };
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  for (const d of (process.env.PATH || '').split(path.delimiter)) {
    if (!d) continue;
    const hit = fileInDir(d, ['dsh.cmd', 'dsh.bat', 'dsh']);
    if (hit) {
      if (/\.cmd$|\.bat$/i.test(hit)) return { kind: 'script', value: hit };
      if (isNodeScript(hit) || !/\.[a-z0-9]{1,5}$/i.test(hit)) continue;
      return { kind: 'file', value: hit };
    }
  }

  // Sibling checkout: a deepseek-harness checkout living next to the exe
  // (e.g. <parent>\deepseek-harness\apps\cli\lib\bin.js).
  const parentDir = path.dirname(EXE_DIR);
  try {
    for (const name of fs.readdirSync(parentDir)) {
      if (name === path.basename(EXE_DIR)) continue;
      const candidate = path.join(parentDir, name, 'apps', 'cli', 'lib', 'bin.js');
      if (fs.existsSync(candidate) && fs.existsSync(path.join(parentDir, name, 'pnpm-workspace.yaml'))) {
        return { kind: 'nodeEntry', value: candidate };
      }
    }
  } catch {
    /* parent dir not readable; keep looking */
  }

  dir = EXE_DIR;
  for (let i = 0; i < 12; i++) {
    const candidate = path.join(dir, 'apps', 'cli', 'lib', 'bin.js');
    if (fs.existsSync(candidate) && fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
      return { kind: 'nodeEntry', value: candidate };
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Locate node (used to run dsh when it is a script; never the SEA exe itself)
// ---------------------------------------------------------------------------
function resolveNode() {
  if (process.env.NODE) return process.env.NODE;
  const d = fileInDirFromPath(['node.exe']);
  return d || 'node';
}
function fileInDirFromPath(names) {
  for (const d of (process.env.PATH || '').split(path.delimiter)) {
    if (!d) continue;
    const p = path.join(d, names[0]);
    try {
      if (fs.statSync(p).isFile()) return p;
    } catch {
      /* keep looking */
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Browser discovery (Chromium family, --app capable)
// ---------------------------------------------------------------------------
function findBrowser() {
  if (browserOverride) {
    if (fs.existsSync(browserOverride)) return browserOverride;
    log(`ignoring configured browser (not found): ${browserOverride}`);
    // fall through to auto-discovery instead of aborting on a stale path
  }
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  for (const base of [
    path.join(os.homedir(), 'AppData', 'Local', 'ms-playwright'),
    path.join(os.homedir(), 'ms-playwright'),
  ]) {
    let entries = [];
    try {
      entries = fs.readdirSync(base).filter((d) => /^chromium-\d+$/.test(d));
    } catch {
      continue;
    }
    entries.sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
    for (const d of entries) {
      const exe = path.join(base, d, 'chrome-win64', 'chrome.exe');
      if (fs.existsSync(exe)) return exe;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
const dsh = resolveDsh();
if (!dsh) {
  fatal(
    'Could not find dsh',
    'No dsh was found on PATH and no checkout was discovered.\nInstall it (npm i -g @deepseek-ai/dsh) or set the entry in config.txt:\n  dsh=C:\\path\\to\\apps\\cli\\lib\\bin.js',
  );
}

// Node scripts — a locally found bin.js (kind nodeEntry) or an explicit *.js
// entry — run through the Node runtime, never through cmd.exe/shell. Anything
// else (dsh.cmd/dsh.bat on PATH, an explicit non-JS entry) is launched via
// cmd.exe, which wraps the real process in a shell; that wrapping decides how
// the process tree is torn down later (taskkill /T instead of a plain kill).
const isNodeScriptEntry =
  dsh.kind === 'nodeEntry' || (dsh.kind === 'explicit' && /\.(m?js|c?mjs)$/i.test(dsh.value));
const browser = findBrowser();
if (!browser) {
  fatal('No browser found', 'No Chrome, Edge or Playwright Chromium was found.\nInstall one, or set the executable in config.txt:\n  browser=C:\\path\\to\\chrome.exe');
}

const nodeExe = resolveNode();
log(`startup: exe=${EXE}`);
log(`startup: dsh=${JSON.stringify(dsh)}`);
log(`startup: node=${nodeExe}`);
log(`startup: browser=${browser}`);
log(`startup: workspace=${workspacePath}`);

const spawnEnv = { ...process.env };

function launchDsh() {
  const extra = ['--profile', 'web', '--port', '0', '--no-open'];
  if (isNodeScriptEntry) {
    log(`spawning: ${nodeExe} ${dsh.value} ${extra.join(' ')}`);
    return spawn(nodeExe, [dsh.value, ...extra], { cwd: workspacePath, env: spawnEnv, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  }
  // script (dsh.cmd/dsh.bat) or plain file: run through cmd.exe
  const target = JSON.stringify(dsh.value);
  log(`spawning (cmd): ${target} ${extra.join(' ')}`);
  return spawn(`${target} ${extra.join(' ')}`, { cwd: workspacePath, env: spawnEnv, windowsHide: true, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
}

dshChild = launchDsh();
let url = undefined;
let urlWaiters = [];
let lastErrTail = [];

const urlReady = new Promise((resolve) => {
  urlWaiters.push(resolve);
});
urlReady.catch(() => {});

const URL_TIMEOUT_MS = 90000;
let bootFired = false; // Timeout#active is undefined on modern Node; track firing explicitly
const bootTimer = setTimeout(() => {
  bootFired = true;
  if (url === undefined) fatal('dsh web did not start', `No URL was printed within ${Math.floor(URL_TIMEOUT_MS / 1000)}s.\nCheck the log file for the server output.`);
}, URL_TIMEOUT_MS);

dshChild.stdout.on('data', (chunk) => {
  const s = String(chunk);
  for (const line of s.split(/\r?\n/)) if (line.trim() !== '') log('dsh: ' + line.trim());
  if (url === undefined) {
    const m = s.match(/(https?:\/\/127\.0\.1\.1:\d+|https?:\/\/127\.0\.0\.1:\d+)/);
    if (m) {
      url = m[1];
      clearTimeout(bootTimer);
      log(`server ready at ${url}`);
      for (const w of urlWaiters) w(url);
    }
  }
});
dshChild.stderr.on('data', (chunk) => {
  const s = String(chunk);
  for (const line of s.split(/\r?\n/)) {
    const t = line.trim();
    if (t === '') continue;
    log('dsh-err: ' + t);
    lastErrTail.push(t);
    if (lastErrTail.length > 5) lastErrTail.shift();
  }
});
dshChild.on('error', (err) => {
  fatal('Failed to start dsh', err && err.message ? err.message : String(err));
});
dshChild.on('spawn', () => {
  log(`dsh pid=${dshChild.pid}`);
});

function stopDshTree(pid, done) {
  let finished = false;
  const finish = (how) => {
    if (finished) return;
    finished = true;
    log(`dsh tree stopped (${how})`);
    done();
  };

  // Spawn failed or the process already exited: nothing left to tear down.
  if (!pid) return finish('no-process');
  if (dshChild.exitCode !== null || dshChild.signalCode !== null) return finish('already-exited');

  if (!isNodeScriptEntry) {
    // Wrapper (cmd.exe running a dsh.cmd/dsh.bat or another entry): a plain
    // kill() only terminates the shell and orphans the real dsh below it, so
    // kill the whole tree with taskkill /T /F immediately — while the parent
    // process still exists and taskkill can still enumerate the tree.
    log(`stopping wrapper tree (pid ${pid}) via taskkill /T`);
    const t = spawn('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    const watchdog = setTimeout(() => finish('taskkill-timeout'), 8000);
    t.on('exit', () => {
      clearTimeout(watchdog);
      finish('taskkill');
    });
    t.on('error', () => {
      clearTimeout(watchdog);
      try {
        dshChild.kill();
      } catch {
        /* already gone */
      }
      finish('taskkill-error');
    });
    dshChild.once('exit', () => finish('child-exit'));
    return;
  }

  // Direct Node spawn: graceful kill first, escalate to taskkill /T /F only
  // when the process does not exit within the grace period.
  const grace = setTimeout(() => {
    const t = spawn('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    t.on('exit', () => finish('taskkill'));
    t.on('error', () => finish('taskkill-error'));
  }, 4000);
  try {
    dshChild.kill();
  } catch {
    /* already gone */
  }
  dshChild.once('exit', () => {
    clearTimeout(grace);
    finish('kill');
  });
}

function shutdown(exitCode) {
  if (shuttingDown) return;
  shuttingDown = true;
  log(`shutdown: exitCode=${exitCode}`);
  try {
    if (browserProc) browserProc.unref();
  } catch {
    /* already gone */
  }
  stopDshTree(dshChild && dshChild.pid, () => {
    const tmp = browserUserData;
    if (tmp) rmRf(tmp);
    process.exit(exitCode);
  });
}

function rmRf(p) {
  try {
    fs.rmSync(p, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
}

urlReady
  .then((readyUrl) => {
    try {
      browserUserData = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-window-'));
    } catch (err) {
      // Never start the browser without an isolated profile: --app without
      // --user-data-dir would piggyback on the user's default Chrome profile.
      fatal(
        'Browser profile error',
        `Could not create a temporary browser profile:\n${err && err.message ? err.message : String(err)}`,
      );
      return;
    }
    const browserArgs = [
      `--app=${readyUrl}`,
      `--user-data-dir=${browserUserData}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--window-size=1440,920',
      '--window-position=24,24',
    ];
    log(`opening browser: ${browser} ${browserArgs.join(' ')}`);
    try {
      browserProc = spawn(browser, browserArgs, { stdio: 'ignore', detached: true });
    } catch (err) {
      fatal('Browser failed to launch', err && err.message ? err.message : String(err));
    }
    browserProc.on('error', (err) => {
      log(`browser error: ${err && err.message ? err.message : err}`);
      fatal('Browser failed to launch', `The browser could not be started:\n${err && err.message ? err.message : err}`);
    });
    browserProc.on('exit', (code) => {
      log(`browser window closed (code ${code}); stopping dsh web`);
      startedOk = true;
      shutdown(0);
    });
    browserProc.unref();
    startedOk = true;
    log('browser launched; launcher idle (window drives lifecycle)');
  })
  .catch(() => {});

dshChild.on('exit', (code, sig) => {
  if (shuttingDown) return;
  if (url !== undefined) {
    // server died while the user was looking at it
    log(`dsh exited unexpectedly (code=${code} sig=${sig}); closing window`);
    try {
      if (browserProc) browserProc.kill();
    } catch {
      /* already gone */
    }
    notifyUser('dsh web stopped unexpectedly', `The server process exited (code ${code}).\nLast output:\n${lastErrTail.slice(-3).join('  |  ') || '(see log)'}`);
    const tmp = browserUserData;
    if (tmp) rmRf(tmp);
    process.exit(1);
  }
  if (!bootFired) {
    clearTimeout(bootTimer);
    fatal('dsh web failed to start', `The dsh process exited (code ${code}).\nLast output:\n${lastErrTail.slice(-5).join('  |  ') || '(no output)'}`);
  }
});
