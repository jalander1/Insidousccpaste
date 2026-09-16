/**
 * Reads the record the installed app is actually using and says what is in it.
 * Opens read-only and runs no migrations, so it can never change anything —
 * it is only here to answer "what does the app see?" without guessing.
 *
 *   npm run doctor
 */
import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SUPPORT = path.join(os.homedir(), 'Library', 'Application Support');
const CANDIDATES = [
  process.argv[2],
  path.join(SUPPORT, 'Green Grass', 'rule.db'),
  path.join(SUPPORT, 'The Rule', 'rule.db'),
].filter(Boolean) as string[];

const dbPath = CANDIDATES.find((p) => fs.existsSync(p));
if (!dbPath) {
  console.error('No database found. Looked in:\n  ' + CANDIDATES.join('\n  '));
  process.exit(1);
}

console.log('RECORD     ', dbPath);
console.log('last written', fs.statSync(dbPath).mtime.toISOString());

for (const app of ['/Applications/Green Grass.app', path.join(os.homedir(), 'Applications', 'Green Grass.app')]) {
  if (fs.existsSync(app)) console.log('INSTALLED  ', app, '— built', fs.statSync(app).mtime.toISOString());
}

const db = new Database(dbPath, { readonly: true });

const applied = db.prepare('SELECT name FROM migrations ORDER BY name').all() as { name: string }[];
console.log('\nMIGRATIONS APPLIED');
for (const m of applied) console.log('  ', m.name);
const shipped = fs.readdirSync(path.join(process.cwd(), 'server', 'src', 'migrations'))
  .filter((f) => f.endsWith('.sql')).sort();
const missing = shipped.filter((f) => !applied.some((a) => a.name === f));
console.log(missing.length ? '  NOT YET APPLIED: ' + missing.join(', ')
  : '  (up to date with this checkout)');

const rows = db.prepare(
  `SELECT id, lineage_id, display_order, name, effective_from, effective_to
     FROM standard ORDER BY effective_to IS NOT NULL, display_order, id`,
).all() as any[];

const live = rows.filter((r) => r.effective_to === null);
console.log(`\nLIVE STANDARDS (${live.length}) — this is exactly what Manage lists`);
for (const r of live) {
  console.log(`  ord ${String(r.display_order).padStart(3)}  lin ${String(r.lineage_id).padStart(3)}` +
    `  id ${String(r.id).padStart(3)}  ${r.name}`);
}

const seen = new Map<number, number>();
for (const r of live) seen.set(r.lineage_id, (seen.get(r.lineage_id) ?? 0) + 1);
const dupes = [...seen].filter(([, n]) => n > 1);
console.log('\nDUPLICATE LIVE LINEAGES:', dupes.length ? dupes.map(([l, n]) => `${l} x${n}`).join(', ') : 'none');

const objectives = ['Primary objective', 'Secondary objective', 'Tertiary objective'];
console.log('\nTHE OBJECTIVES');
for (const name of objectives) {
  const all = rows.filter((r) => r.name === name);
  if (!all.length) { console.log(`   ${name}: NOT IN THE DATABASE AT ALL`); continue; }
  for (const r of all) {
    console.log(`   ${name}: lineage ${r.lineage_id}, id ${r.id}, order ${r.display_order}, ` +
      (r.effective_to === null ? 'LIVE' : `RETIRED on ${r.effective_to}`));
  }
}

const retired = rows.filter((r) => r.effective_to !== null);
if (retired.length) {
  console.log(`\nCLOSED VERSIONS (${retired.length}) — kept so old days keep their wording`);
  for (const r of retired) {
    console.log(`  lin ${String(r.lineage_id).padStart(3)}  id ${String(r.id).padStart(3)}` +
      `  ${r.effective_from} → ${r.effective_to}  ${r.name}`);
  }
}
