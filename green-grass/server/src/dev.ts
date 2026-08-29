// Dev entry: runs the API alone on 4321; Vite serves the frontend on 5173 and
// proxies /api here. The packaged app boots the same server from app/main.ts.
import os from 'node:os';
import path from 'node:path';
import { startServer } from './server.js';

const dbPath = process.env.RULE_DB
  ?? path.join(os.homedir(), '.green-grass', 'rule.db');

startServer({ dbPath, port: Number(process.env.PORT ?? 4321) }).then(({ url }) => {
  console.log(`Green Grass — API on ${url}`);
  console.log(`Database: ${dbPath}`);
});
