// Serves the built app exactly as the packaged Electron shell does, minus the
// window. Useful for verifying a build, and as a fallback if you ever want the
// app in a plain browser tab.
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../server/src/server.js';

const root = path.resolve(import.meta.dirname, '..');

startServer({
  dbPath: process.env.RULE_DB ?? path.join(os.homedir(), '.the-rule', 'rule.db'),
  webRoot: path.join(root, 'dist', 'web'),
  migrationsDir: path.join(root, 'dist', 'migrations'),
  port: Number(process.env.PORT ?? 4321),
}).then(({ url }) => console.log(`The Rule — ${url}`));
