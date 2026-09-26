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
  checks.push(['migrations ran and seeded the standards', standards.length === 11]);
  checks.push(['the wake-up leads', standards[0].name === 'Wake by 09:00']);
  checks.push(['the objectives read after the morning routine',
    standards.slice(1, 5).map((s) => s.name).join('|')
      === 'Morning routine|Primary objective|Secondary objective|Tertiary objective']);
  checks.push(['the full exercise session is the one optional step',
    standards[1].steps.filter((s) => s.optional).map((s) => s.name).join() === 'Full exercise session']);

  const dbFile = path.join(userData, 'rule.db');
  checks.push(['database written to userData', fs.existsSync(dbFile)]);

  // A write, then a read back through the API. The record starts on a fixed
  // day, so mark the first date it actually covers rather than today's.
  const tracking = (await (await fetch(`${loadedUrl}/api/today`)).json()).trackingDate;
  const today = tracking > standards[0].effectiveFrom ? tracking : standards[0].effectiveFrom;
  // The objectives run every day, so this holds whichever day the record opens on.
  const daily = standards.find((s) => s.name === 'Primary objective');
  await fetch(`${loadedUrl}/api/mark/${today}/${daily.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'kept', reason: '' }),
  });
  const day = await (await fetch(`${loadedUrl}/api/day/${today}`)).json();
  const marked = day.cells.find((c) => c.name === 'Primary objective');
  checks.push(['a mark round-trips', marked.status === 'kept']);
  checks.push(['and starts a run of one', marked.streak.current === 1]);

  // Week and trends are gone: their paths now fall through to the SPA.
  const gone = await Promise.all([`/api/trends?from=${today}&to=${today}`, `/api/week/${today}`]
    .map(async (u) => (await fetch(loadedUrl + u)).headers.get('content-type') || ''));
  checks.push(['the week and trends are gone', gone.every((t) => !t.includes('json'))]);

  let failed = 0;
  for (const [name, ok] of checks) {
    console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}`);
    if (!ok) failed++;
  }
  console.log(`\n${loadedUrl}  ·  ${dbFile}`);
  fs.rmSync(userData, { recursive: true, force: true });
  process.exit(failed ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
