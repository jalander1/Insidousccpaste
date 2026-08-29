import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { openDatabase, type DB } from './db.js';
import * as store from './store.js';
import { addDays, mondayOf, toISO, trackingDate } from '../../shared/dates.js';

export interface ServerOptions {
  dbPath: string;
  /** Directory holding the built frontend. Omitted in dev — Vite serves it. */
  webRoot?: string;
  /** Explicit in the packaged app, where the .sql files sit beside the bundle. */
  migrationsDir?: string;
  port?: number;
  /** Wired up by the Electron shell so Manage can reveal the data folder. */
  onReveal?: (target: string) => void;
}

export function createApp(db: DB, opts: ServerOptions) {
  const app = express();
  app.use(express.json({ limit: '4mb' }));

  const ok = <T>(fn: () => T) => (req: any, res: any) => {
    try {
      res.json(fn.length ? (fn as any)(req) : fn());
    } catch (err: any) {
      console.error(err);
      res.status(400).json({ error: String(err?.message ?? err) });
    }
  };

  const wrap = (fn: (req: express.Request, res: express.Response) => unknown) =>
    (req: express.Request, res: express.Response) => {
      try {
        const out = fn(req, res);
        if (!res.headersSent) res.json(out ?? { ok: true });
      } catch (err: any) {
        console.error(err);
        res.status(400).json({ error: String(err?.message ?? err) });
      }
    };

  // ------------------------------------------------------------------ meta
  app.get('/api/today', wrap(() => ({
    trackingDate: trackingDate(),
    actualDate: toISO(new Date()),
  })));

  // ------------------------------------------------------------------- day
  app.get('/api/day/:date', wrap((req) => store.getDay(db, req.params.date)));

  app.put('/api/day/:date', wrap((req) => {
    store.setDayFields(db, req.params.date, req.body ?? {});
    return store.getDay(db, req.params.date);
  }));

  app.put('/api/mark/:date/:standardId', wrap((req) => {
    const { status, reason } = req.body ?? {};
    store.setMark(db, req.params.date, Number(req.params.standardId), status, reason ?? '');
    return store.getDay(db, req.params.date);
  }));

  app.put('/api/step/:date/:stepId', wrap((req) => {
    store.setStep(db, req.params.date, Number(req.params.stepId), !!req.body?.checked);
    return store.getDay(db, req.params.date);
  }));

  app.get('/api/week/:weekStart', wrap((req) =>
    store.getWeek(db, mondayOf(req.params.weekStart))));

  // ------------------------------------------------------------- standards
  app.get('/api/standards', wrap(() => store.currentStandards(db)));
  app.post('/api/standards', wrap((req) => store.createStandard(db, req.body)));
  app.put('/api/standards/:lineageId', wrap((req) =>
    store.updateStandard(db, Number(req.params.lineageId), req.body ?? {})));
  app.post('/api/standards/reorder', wrap((req) => {
    store.reorderStandards(db, req.body?.lineageIds ?? []);
    return store.currentStandards(db);
  }));
  app.post('/api/standards/:lineageId/retire', wrap((req) => {
    store.retireStandard(db, Number(req.params.lineageId));
    return store.currentStandards(db);
  }));

  // ------------------------------------------------------------ exemptions
  app.get('/api/exemptions', wrap(() => store.listExemptions(db)));
  app.post('/api/exemption', wrap((req) => {
    const { date, lineageId, reason } = req.body ?? {};
    store.setExemption(db, date, Number(lineageId), reason ?? '');
    return store.getDay(db, date);
  }));
  app.delete('/api/exemption', wrap((req) => {
    const { date, lineageId } = req.body ?? {};
    store.clearExemption(db, date, Number(lineageId));
    return store.getDay(db, date);
  }));

  // ---------------------------------------------------------------- trends
  app.get('/api/trends', wrap((req) => {
    const to = (req.query.to as string) || toISO(new Date());
    const from = (req.query.from as string) || addDays(to, -180);
    return store.getTrends(db, from, to);
  }));

  // ---------------------------------------------------------------- export
  app.get('/api/export.json', (_req, res) => {
    res.setHeader('Content-Disposition',
      `attachment; filename="green-grass-${toISO(new Date())}.json"`);
    res.json(store.exportAll(db));
  });

  app.get('/api/export.csv', (_req, res) => {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition',
      `attachment; filename="green-grass-${toISO(new Date())}.csv"`);
    res.send(store.exportCsv(db));
  });

  app.get('/api/data-location', wrap(() => ({
    dbPath: opts.dbPath,
    backups: path.join(path.dirname(opts.dbPath), 'backups'),
    canReveal: !!opts.onReveal,
  })));

  app.post('/api/reveal', wrap(() => {
    opts.onReveal?.(opts.dbPath);
    return { ok: true, revealed: !!opts.onReveal };
  }));

  // ------------------------------------------------------------ static web
  if (opts.webRoot && fs.existsSync(opts.webRoot)) {
    app.use(express.static(opts.webRoot));
    app.get('*', (_req, res) => res.sendFile(path.join(opts.webRoot!, 'index.html')));
  }

  return app;
}

export function startServer(opts: ServerOptions) {
  const db = openDatabase(opts.dbPath, opts.migrationsDir);
  const app = createApp(db, opts);
  const port = opts.port ?? 4321;
  return new Promise<{ port: number; url: string; db: DB; close: () => void }>((resolve) => {
    const server = app.listen(port, '127.0.0.1', () => {
      const actual = (server.address() as any).port as number;
      resolve({
        port: actual,
        url: `http://127.0.0.1:${actual}`,
        db,
        close: () => { server.close(); db.close(); },
      });
    });
  });
}
