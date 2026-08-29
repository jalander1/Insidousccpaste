// Bundles the Electron main process (server included) to CommonJS, and copies
// the migrations beside it. better-sqlite3 stays external: it is a native
// module and must be loaded from node_modules, rebuilt for Electron's ABI.
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const outDir = path.join(root, 'dist');

await build({
  entryPoints: [path.join(root, 'app', 'main.ts')],
  outfile: path.join(outDir, 'app', 'main.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  sourcemap: true,
  external: ['electron', 'better-sqlite3'],
  logLevel: 'info',
});

const migrationsOut = path.join(outDir, 'migrations');
fs.mkdirSync(migrationsOut, { recursive: true });
for (const f of fs.readdirSync(path.join(root, 'server', 'src', 'migrations'))) {
  if (f.endsWith('.sql')) {
    fs.copyFileSync(
      path.join(root, 'server', 'src', 'migrations', f),
      path.join(migrationsOut, f),
    );
  }
}
console.log('Migrations copied to dist/migrations');
