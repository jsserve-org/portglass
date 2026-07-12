// Custom Next.js server that also exposes a WebSocket endpoint for live scan
// status. Next route handlers can't upgrade to WebSocket, so we run Next's
// request handler under a plain http.Server and attach a ws server to the
// `upgrade` event at /api/ws/scans.
//
// Each subscriber gets a small server-side poll of /api/runs (reusing that
// route's auth + computed status/ETA) pushed over the socket every 2s, so the
// browser stops polling. If anything WS-related fails the HTTP app is
// unaffected and clients fall back to normal REST polling.
const path = require('path');
const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { WebSocketServer } = require('ws');

const port = parseInt(process.env.PORT || '51111', 10);
const hostname = process.env.HOSTNAME || '0.0.0.0';

const app = next({ dev: false, hostname, port });
const handle = app.getRequestHandler();

// Apply pending Drizzle migrations before serving any traffic. Uses
// drizzle-orm's migrator (a prod dependency) against the ./drizzle folder, so
// the schema — including the better-auth tables — is always up to date on
// boot and no manual DDL is ever needed. Fail fast if it can't run, since the
// app is non-functional without its schema.
async function runMigrations() {
  if (!process.env.DATABASE_URL) {
    console.warn('> DATABASE_URL not set; skipping migrations');
    return;
  }
  const { drizzle } = require('drizzle-orm/node-postgres');
  const { migrate } = require('drizzle-orm/node-postgres/migrator');
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await migrate(drizzle(pool), { migrationsFolder: path.join(__dirname, 'drizzle') });
    console.log('> Drizzle migrations up to date');
  } finally {
    await pool.end();
  }
}

runMigrations().then(() => app.prepare()).then(() => {
  const server = createServer((req, res) => {
    handle(req, res, parse(req.url, true));
  });

  let wss = null;
  try {
    wss = new WebSocketServer({ noServer: true });
  } catch (err) {
    console.error('WebSocket server init failed; continuing HTTP-only:', err);
  }

  server.on('upgrade', (req, socket, head) => {
    const { pathname } = parse(req.url || '');
    if (wss && pathname === '/api/ws/scans') {
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
    } else {
      socket.destroy();
    }
  });

  if (wss) {
    wss.on('connection', (ws, req) => {
      const cookie = req.headers.cookie || '';
      let closed = false;
      let timer = null;
      // Optional per-run detail subscription: the scan-detail page sends
      // {type:'subscribe', runId} and we additionally push that run's full
      // detail (run + findings + progress) each tick so it renders live too.
      let subRunId = null;

      const pushFrom = async (path, frame) => {
        if (closed) return;
        try {
          const res = await fetch(`http://127.0.0.1:${port}${path}`, { headers: { cookie } });
          if (res.status === 401) {
            ws.close(4401, 'unauthorized');
            return;
          }
          if (res.ok && !closed && ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ ...frame, data: await res.json() }));
          }
        } catch {
          /* transient; try again next tick */
        }
      };

      // Guard against overlap: setInterval fires every 2s regardless of whether
      // the previous tick's self-fetches finished. Under load that let in-flight
      // requests pile up unboundedly (memory runaway -> heap OOM). If a tick is
      // still running, skip this one.
      let ticking = false;
      const tick = async () => {
        if (closed || ticking) return;
        ticking = true;
        try {
          await pushFrom('/api/runs', { type: 'scans' });
          if (subRunId != null) {
            await pushFrom(`/api/scan/${subRunId}`, { type: 'scan', runId: subRunId });
          }
        } finally {
          ticking = false;
        }
      };

      ws.on('message', (raw) => {
        let msg;
        try {
          msg = JSON.parse(raw.toString());
        } catch {
          return;
        }
        if (msg && msg.type === 'subscribe') {
          const id = parseInt(msg.runId, 10);
          subRunId = Number.isNaN(id) ? null : id;
          if (subRunId != null) pushFrom(`/api/scan/${subRunId}`, { type: 'scan', runId: subRunId });
        } else if (msg && msg.type === 'unsubscribe') {
          subRunId = null;
        }
      });

      const stop = () => {
        closed = true;
        if (timer) clearInterval(timer);
      };
      ws.on('close', stop);
      ws.on('error', stop);

      tick();
      timer = setInterval(tick, 2000);
    });
  }

  server.listen(port, () => {
    console.log(`> Portglass ready on http://${hostname}:${port} (WS: /api/ws/scans)`);
  });
});
