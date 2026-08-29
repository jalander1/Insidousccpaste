/*
 * Boots dist/app/main.cjs — the exact bundle the packaged app runs — with the
 * Electron API stubbed out. Verifies the CommonJS bundle is valid, that the
 * migrations and web root resolve from beside the bundle, that better-sqlite3
 * loads, and that the window would be handed a URL that actually serves the
 * app. Everything except the macOS window itself.
 *
 * Run: node scripts/smoke-bundle.cjs
 */
const Module = require('node:module');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'rule-smoke-'));
let loadedUrl = null;
let readyHandler = null;

const stub = {
  app: {
    requestSingleInstanceLock: () => true,
    getPath: (name) => (name === 'userData' ? userData : os.tmpdir()),
    whenReady: () => ({ then: (fn) => { readyHandler = fn; return { catch() {} }; } }),
    on() {},
    quit() {},
  },
  BrowserWindow: class {
    constructor(opts) { this.opts = opts; this.webContents = { setWindowOpenHandler() {} }; }
    on() {}
    async loadURL(url) { loadedUrl = url; }
    static getAllWindows() { return []; }
  },
  Menu: { setApplicationMenu() {}, buildFromTemplate: (t) => t },
  shell: { showItemInFolder() {}, openExternal() {} },
};

const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'electron') return stub;
  return origLoad.apply(this, arguments);
};

require(path.resolve(__dirname, '..', 'dist', 'app', 'main.cjs'));

(async () => {
  if (!readyHandler) throw new Error('main.cjs never registered a ready handler');
  await readyHandler();
  // Give the server a moment to bind.
  for (let i = 0; i < 50 && !loadedUrl; i++) await new Promise((r) => setTimeout(r, 100));
  if (!loadedUrl) throw new Error('the window was never given a URL');

  const checks = [];
  const res = await fetch(loadedUrl);
  const html = await res.text();
  checks.push(['serves the built frontend', res.ok && html.includes('<div id="root">')]);

  const standards = await (await fetch(`${loadedUrl}/api/standards`)).json();
  checks.push(['migrations ran and seeded 10 standards', standards.length === 10]);
  checks.push(['the wake-up leads', standards[0].name === 'Wake by 09:00']);

  const dbFile = path.join(userData, 'rule.db');
  checks.push(['database written to userData', fs.existsSync(dbFile)]);

  // A write, then a read back through the API.
  const today = (await (await fetch(`${loadedUrl}/api/today`)).json()).trackingDate;
  await fetch(`${loadedUrl}/api/mark/${today}/${standards[0].id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'kept', reason: '' }),
  });
  const day = await (await fetch(`${loadedUrl}/api/day/${today}`)).json();
  checks.push(['a mark round-trips', day.cells[0].status === 'kept']);

  let failed = 0;
  for (const [name, ok] of checks) {
    console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}`);
    if (!ok) failed++;
  }
  console.log(`\n${loadedUrl}  ·  ${dbFile}`);
  fs.rmSync(userData, { recursive: true, force: true });
  process.exit(failed ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
