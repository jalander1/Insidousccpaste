import { app, BrowserWindow, Menu, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { startServer } from '../server/src/server.js';

// One window, one database. A second launch focuses the window you already have.
if (!app.requestSingleInstanceLock()) app.quit();

const ROOT = __dirname;                       // dist/app inside the bundle
const DIST = path.join(ROOT, '..');           // dist/

let win: BrowserWindow | null = null;

/** Window size is remembered so the app opens where you left it. */
function windowStatePath() {
  return path.join(app.getPath('userData'), 'window.json');
}

function readWindowState(): { width: number; height: number; x?: number; y?: number } {
  try {
    const s = JSON.parse(fs.readFileSync(windowStatePath(), 'utf8'));
    if (typeof s.width === 'number' && typeof s.height === 'number') return s;
  } catch { /* first run */ }
  return { width: 900, height: 1000 };
}

function saveWindowState(w: BrowserWindow) {
  try {
    const b = w.getNormalBounds();
    fs.writeFileSync(windowStatePath(), JSON.stringify(b));
  } catch { /* never block quitting over this */ }
}

/**
 * macOS derives the data folder from the app's name, so renaming the app
 * would otherwise leave the existing record behind in the old folder. Carry
 * it across once, and only when there is nothing here to overwrite.
 */
function adoptPreviousData(userData: string): void {
  try {
    if (fs.existsSync(path.join(userData, 'rule.db'))) return;
    const previous = path.join(path.dirname(userData), 'The Rule');
    if (!fs.existsSync(path.join(previous, 'rule.db'))) return;
    fs.mkdirSync(userData, { recursive: true });
    for (const name of fs.readdirSync(previous)) {
      fs.cpSync(path.join(previous, name), path.join(userData, name), { recursive: true });
    }
    console.log(`Adopted the record from ${previous}`);
  } catch (err) {
    // Starting fresh would be bad; failing to start would be worse.
    console.error('Could not carry over the previous data folder:', err);
  }
}

async function boot() {
  const userData = app.getPath('userData');
  adoptPreviousData(userData);
  const dbPath = path.join(userData, 'rule.db');

  const { url } = await startServer({
    dbPath,
    webRoot: path.join(DIST, 'web'),
    migrationsDir: path.join(DIST, 'migrations'),
    port: 0, // let the OS pick — nothing else on the machine can collide with us
    onReveal: (target) => shell.showItemInFolder(target),
  });

  const state = readWindowState();
  win = new BrowserWindow({
    ...state,
    minWidth: 420,
    minHeight: 560,
    title: 'Green Grass',
    backgroundColor: '#0C121C',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 16 },
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });

  win.on('close', () => win && saveWindowState(win));
  win.on('closed', () => { win = null; });

  // Links to anywhere else open in the real browser, not inside the ledger.
  win.webContents.setWindowOpenHandler(({ url: target }) => {
    void shell.openExternal(target);
    return { action: 'deny' };
  });

  await win.loadURL(url);
}

app.on('second-instance', () => {
  if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { role: 'appMenu' },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [{
        label: 'Show data folder',
        click: () => shell.showItemInFolder(path.join(app.getPath('userData'), 'rule.db')),
      }],
    },
  ]));
  void boot();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) void boot();
});

// On macOS ⌘Q quits properly rather than leaving the process behind.
app.on('window-all-closed', () => app.quit());
