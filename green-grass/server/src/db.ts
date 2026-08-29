import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { toISO } from '../../shared/dates.js';

export type DB = Database.Database;

/**
 * Where the .sql files live. The packaged app passes this explicitly (they sit
 * beside the bundle); in dev and tests they are found from the project root.
 * Deliberately free of `import.meta`, so this module also compiles to the
 * CommonJS bundle the Electron main process loads.
 */
function resolveMigrations(explicit?: string): string {
  const candidates = [
    explicit,
    process.env.RULE_MIGRATIONS,
    path.join(process.cwd(), 'server', 'src', 'migrations'),
    path.join(process.cwd(), 'dist', 'migrations'),
    path.join(process.cwd(), 'migrations'),
  ].filter(Boolean) as string[];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  throw new Error(`No migrations directory found (looked in ${candidates.join(', ')})`);
}

export function openDatabase(dbPath: string, migrationsDir?: string): DB {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const existed = fs.existsSync(dbPath);
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  if (existed) backup(dbPath);
  migrate(db, migrationsDir);
  return db;
}

export function migrate(db: DB, migrationsDir?: string): void {
  db.exec(`CREATE TABLE IF NOT EXISTS migrations (
    name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)`);
  const applied = new Set<string>(
    db.prepare('SELECT name FROM migrations').all().map((r: any) => r.name),
  );
  const dir = resolveMigrations(migrationsDir);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const record = db.prepare('INSERT INTO migrations (name, applied_at) VALUES (?, ?)');
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      record.run(file, new Date().toISOString());
    })();
  }
}

/**
 * Copy the database beside itself on every launch, keeping the last 30 days.
 * Months of honest self-reporting is not something to lose to a bad write.
 */
export function backup(dbPath: string, keep = 30): void {
  try {
    const dir = path.join(path.dirname(dbPath), 'backups');
    fs.mkdirSync(dir, { recursive: true });
    const target = path.join(dir, `rule-${toISO(new Date())}.db`);
    if (!fs.existsSync(target)) fs.copyFileSync(dbPath, target);
    const old = fs.readdirSync(dir)
      .filter((f) => f.startsWith('rule-') && f.endsWith('.db'))
      .sort()
      .slice(0, -keep);
    for (const f of old) fs.rmSync(path.join(dir, f), { force: true });
  } catch (err) {
    // A failed backup must never stop the app from opening.
    console.error('Backup failed:', err);
  }
}
