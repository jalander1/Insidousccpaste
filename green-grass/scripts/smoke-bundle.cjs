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
  checks.push(['migrations ran and seeded the standards', standards.length === 9]);
  checks.push(['the wake-up leads', standards[0].name === 'Wake by 09:00']);
  checks.push(['the morning is a run, a sit and a read',
    standards[1].steps.slice(0, 3).map((s) => s.name).join('|')
      === 'Run|Meditate — 15 minutes|Read']);
  checks.push(['the weekend morning is the light',
    standards[1].steps[3].weekdays === '-----SS']);

  const dbFile = path.join(userData, 'rule.db');
  checks.push(['database written to userData', fs.existsSync(dbFile)]);

  // A write, then a read back through the API. The record starts on a fixed
  // day, so mark the first date it actually covers rather than today's.
  const tracking = (await (await fetch(`${loadedUrl}/api/today`)).json()).trackingDate;
  const today = tracking > standards[0].effectiveFrom ? tracking : standards[0].effectiveFrom;
  // The objectives run every day, so this holds whichever day the record opens on.
  const daily = standards.find((s) => s.name === 'Supplements');
  await fetch(`${loadedUrl}/api/mark/${today}/${daily.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'kept', reason: '' }),
  });
  const day = await (await fetch(`${loadedUrl}/api/day/${today}`)).json();
  const marked = day.cells.find((c) => c.name === 'Supplements');
  checks.push(['a mark round-trips', marked.status === 'kept']);
  checks.push(['and starts a run of one', marked.streak.current === 1]);

  // One night off a week, on the evening routine and nowhere else.
  const ev = standards.find((s) => s.name === 'Evening routine');
  checks.push(['the evening routine carries one veto a week',
    ev.vetoesPerWeek === 1 && standards.filter((s) => s.vetoesPerWeek > 0).length === 1]);
  const vetoed = await (await fetch(`${loadedUrl}/api/veto/${today}/${ev.lineageId}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ on: true }),
  })).json();
  const night = vetoed.cells.find((c) => c.name === 'Evening routine');
  checks.push(['and spending it puts the night out of play',
    night.status === 'vetoed' && night.veto.left === 0]);

  // A block puts the sheet away and ends the run; a pinned standard ignores it.
  await fetch(`${loadedUrl}/api/block`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ startDate: today, endDate: today, reason: 'Italy' }),
  });
  const blocked = await (await fetch(`${loadedUrl}/api/day/${today}`)).json();
  const obj = blocked.cells.find((c) => c.name === 'Supplements');
  const pin = blocked.cells.find((c) => c.name === 'No porn');
  checks.push(['a block puts the day away', obj.status === 'away' && obj.awayReason === 'Italy']);
  checks.push(['and ends the run it was on', obj.streak.current === 0 && obj.streak.best === 0]);
  checks.push(['a pinned standard ignores the block',
    pin.status === 'unanswered' && pin.awayReason === null]);

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
