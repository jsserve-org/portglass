// Custom Next.js server that also exposes a WebSocket endpoint for live scan
// status. Next route handlers can't upgrade to WebSocket, so we run Next's
// request handler under a plain http.Server and attach a ws server to the
// `upgrade` event at /api/ws/scans.
//
// All subscribers share one server-side poll of /api/runs per unique session
// (reusing that route's auth + computed status/ETA) broadcast over the socket
// every 2s, so the browser stops polling. If anything WS-related fails the HTTP
// app is unaffected and clients fall back to normal REST polling.
const path = require('path');
const crypto = require('crypto');
const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { WebSocketServer } = require('ws');

const port = parseInt(process.env.PORT || '51111', 10);
const hostname = process.env.HOSTNAME || '0.0.0.0';

// Secret shared with the /api/internal/tick route. Derive it from an env value
// that exists before Next loads: production route bundles may not observe a
// process.env key added dynamically here, which previously made every scheduler
// tick return 403 and left next_run_at stuck in the past.
process.env.INTERNAL_TICK_SECRET =
  process.env.INTERNAL_TICK_SECRET ||
  (process.env.SESSION_SECRET
    ? crypto.createHash('sha256').update(`portglass-scheduler:${process.env.SESSION_SECRET}`).digest('hex')
    : crypto.randomBytes(24).toString('hex'));

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
    // Heartbeat reaper. Behind nginx/Cloudflare a browser that navigates away
    // often leaves a HALF-OPEN socket: the server never gets 'close', so its
    // subscription would be polled forever. These zombies pile up (CPU + memory)
    // until the Node heap OOMs. Ping every 30s and terminate any socket that
    // didn't pong since the last round.
    const reaper = setInterval(() => {
      for (const ws of wss.clients) {
        if (ws.isAlive === false) {
          ws.terminate();
          continue;
        }
        ws.isAlive = false;
        try { ws.ping(); } catch { /* socket dying; next round terminates it */ }
      }
    }, 30000);
    wss.on('close', () => clearInterval(reaper));

    // One shared poller instead of one per connection. Previously every socket
    // ran its own 2s loopback fetch through the whole Next pipeline (middleware
    // -> auth -> handler), then re-serialized the payload for itself. With N
    // open tabs that was N identical HTTP round-trips + N auth DB lookups + N
    // JSON serializations every 2s. Now one tick per unique session cookie
    // fetches once, serializes once, and broadcasts the same string to every
    // socket sharing that session. A 401 closes the whole group (expired
    // session) instead of leaving sockets to retry forever.
    const groups = new Map(); // cookie -> { sockets:Set, subs:Map<runId, Set>, busy:Set }
    const groupFor = (cookie) => {
      let g = groups.get(cookie);
      if (!g) {
        g = { sockets: new Set(), subs: new Map(), busy: new Set() };
        groups.set(cookie, g);
      }
      return g;
    };

    const sendFrame = (ws, str) => {
      if (ws.readyState !== ws.OPEN) return;
      // Don't pile up frames for a client that isn't draining (slow/dead).
      if (ws.bufferedAmount > 1_000_000) return;
      try { ws.send(str); } catch { /* closing; reaper will reap */ }
    };

    const pushShared = async (cookie, path, frame, group, cacheKey) => {
      if (group.busy.has(cacheKey)) return;
      group.busy.add(cacheKey);
      try {
        const res = await fetch(`http://127.0.0.1:${port}${path}`, { headers: { cookie } });
        if (res.status === 401) {
          for (const ws of group.sockets) {
            try { ws.close(4401, 'unauthorized'); } catch { /* already closing */ }
          }
          return;
        }
        if (res.ok) {
          const str = JSON.stringify({ ...frame, data: await res.json() });
          const targets = frame.type === 'scan'
            ? group.subs.get(frame.runId)
            : group.sockets;
          if (targets) for (const ws of targets) sendFrame(ws, str);
        }
      } catch {
        /* transient; try again next tick */
      } finally {
        group.busy.delete(cacheKey);
      }
    };

    const tick = async () => {
      for (const [cookie, group] of groups) {
        if (!group.sockets.size) continue;
        pushShared(cookie, '/api/runs', { type: 'scans' }, group, 'scans').catch(() => {});
        for (const runId of group.subs.keys()) {
          pushShared(cookie, `/api/scan/${runId}`, { type: 'scan', runId }, group, `scan:${runId}`).catch(() => {});
        }
      }
    };
    const ticker = setInterval(tick, 2000);
    wss.on('close', () => clearInterval(ticker));

    wss.on('connection', (ws, req) => {
      const cookie = req.headers.cookie || '';
      const group = groupFor(cookie);
      group.sockets.add(ws);
      ws.isAlive = true;
      ws.on('pong', () => { ws.isAlive = true; });
      // Optional per-run detail subscription: the scan-detail page sends
      // {type:'subscribe', runId} and we additionally push that run's full
      // detail (run + findings + progress) each tick so it renders live too.
      let subRunId = null;

      const pushNow = (runId) => {
        pushShared(cookie, `/api/scan/${runId}`, { type: 'scan', runId }, group, `scan:${runId}`).catch(() => {});
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
          const next = Number.isNaN(id) ? null : id;
          if (next === subRunId) return;
          if (subRunId != null) {
            const set = group.subs.get(subRunId);
            if (set) { set.delete(ws); if (!set.size) group.subs.delete(subRunId); }
          }
          subRunId = next;
          if (subRunId != null) {
            let set = group.subs.get(subRunId);
            if (!set) { set = new Set(); group.subs.set(subRunId, set); }
            set.add(ws);
            pushNow(subRunId); // immediate first frame, then every 2s
          }
        } else if (msg && msg.type === 'unsubscribe') {
          if (subRunId != null) {
            const set = group.subs.get(subRunId);
            if (set) { set.delete(ws); if (!set.size) group.subs.delete(subRunId); }
          }
          subRunId = null;
        }
      });

      const stop = () => {
        group.sockets.delete(ws);
        if (subRunId != null) {
          const set = group.subs.get(subRunId);
          if (set) { set.delete(ws); if (!set.size) group.subs.delete(subRunId); }
        }
        if (!group.sockets.size) groups.delete(cookie);
      };
      ws.on('close', stop);
      ws.on('error', stop);
    });
  }

  // Recurring-scan scheduler: once a minute, ask the app to launch any due
  // schedules. Runs in-process via an internal, secret-gated endpoint so it
  // reuses the app's DB pool + queue logic. A guard prevents overlap if a tick
  // ever runs long.
  let schedTicking = false;
  const scheduleTick = async () => {
    if (schedTicking) return;
    schedTicking = true;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/internal/tick`, {
        method: 'POST',
        headers: { 'x-internal-secret': process.env.INTERNAL_TICK_SECRET },
      });
      if (!res.ok) {
        console.error(`Schedule tick rejected: HTTP ${res.status} ${await res.text()}`);
      }
    } catch (err) {
      console.error('Schedule tick request failed:', err);
    } finally {
      schedTicking = false;
    }
  };
  setInterval(scheduleTick, 60_000);

  server.listen(port, () => {
    console.log(`> Portglass ready on http://${hostname}:${port} (WS: /api/ws/scans)`);
    // Reconcile overdue schedules immediately after a restart instead of
    // displaying a stale past date until the first minute interval.
    scheduleTick();
  });
});
