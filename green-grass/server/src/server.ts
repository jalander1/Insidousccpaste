import Anthropic from '@anthropic-ai/sdk';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { openDatabase, type DB } from './db.js';
import * as store from './store.js';
import * as reflect from './reflect.js';
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

  // --------------------------------------------------------------- reflect
  app.get('/api/chat/:date', wrap((req) => ({
    messages: reflect.getChat(db, req.params.date),
    key: reflect.apiKeyStatus(db),
  })));

  app.delete('/api/chat/:date', wrap((req) => {
    reflect.clearChat(db, req.params.date);
    return { ok: true };
  }));

  app.get('/api/chat-dates', wrap(() => reflect.chatDates(db)));

  app.get('/api/api-key', wrap(() => reflect.apiKeyStatus(db)));
  app.put('/api/api-key', wrap((req) => {
    reflect.setSetting(db, 'anthropic_api_key', String(req.body?.key ?? '').trim());
    return reflect.apiKeyStatus(db);
  }));

  /**
   * Streams a reply over SSE so a long answer arrives a sentence at a time
   * rather than after a silent minute. The key never leaves this process.
   */
  app.post('/api/chat/:date', async (req, res) => {
    const date = req.params.date;
    const message = String(req.body?.message ?? '').trim();
    const apiKey = reflect.getSetting(db, 'anthropic_api_key');

    if (!apiKey) {
      res.status(400).json({ error: 'No API key set. Add one under Manage.' });
      return;
    }
    if (!message) {
      res.status(400).json({ error: 'Nothing to send.' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    const send = (event: string, data: unknown) =>
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

    try {
      // Nothing is written until there is an answer to write beside it — a
      // failed call must not leave his message stranded without a reply.
      const history = reflect.getChat(db, date);

      const client = new Anthropic({ apiKey });
      let answer = '';

      const stream = client.beta.messages.stream({
        model: reflect.MODEL,
        max_tokens: 1500,
        // The record is stable within a conversation, so cache it and pay for
        // those tokens once rather than on every turn.
        system: [{
          type: 'text',
          text: `${reflect.SYSTEM_PROMPT}\n\n# His record\n\n${reflect.buildContext(db, date)}`,
          cache_control: { type: 'ephemeral' },
        }],
        output_config: { effort: 'medium' },
        betas: ['server-side-fallback-2026-06-01'],
        fallbacks: [{ model: 'claude-opus-4-8' }],
        messages: [...history, { role: 'user', content: message }],
      });

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          answer += event.delta.text;
          send('delta', { text: event.delta.text });
        }
      }

      const final = await stream.finalMessage();
      if (final.stop_reason === 'refusal') {
        send('error', {
          message: 'Claude declined to answer that one. Try putting it another way.',
        });
      } else if (answer.trim()) {
        reflect.appendChat(db, date, 'user', message);
        reflect.appendChat(db, date, 'assistant', answer);
      }
      send('done', { ok: true });
    } catch (err: any) {
      console.error(err);
      const status = err?.status;
      send('error', {
        message: status === 401 ? 'That API key was rejected. Check it under Manage.'
          : status === 429 ? 'Rate limited. Wait a moment and try again.'
          : String(err?.message ?? err),
      });
    } finally {
      res.end();
    }
  });

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
