// Custom Next.js server that also exposes a WebSocket endpoint for live scan
// status. Next route handlers can't upgrade to WebSocket, so we run Next's
// request handler under a plain http.Server and attach a ws server to the
// `upgrade` event at /api/ws/scans.
//
// Each subscriber gets a small server-side poll of /api/runs (reusing that
// route's auth + computed status/ETA) pushed over the socket every 2s, so the
// browser stops polling. If anything WS-related fails the HTTP app is
// unaffected and clients fall back to normal REST polling.
const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { WebSocketServer } = require('ws');

const port = parseInt(process.env.PORT || '51111', 10);
const hostname = process.env.HOSTNAME || '0.0.0.0';

const app = next({ dev: false, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
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

      const send = async () => {
        if (closed) return;
        try {
          const res = await fetch(`http://127.0.0.1:${port}/api/runs`, { headers: { cookie } });
          if (res.status === 401) {
            ws.close(4401, 'unauthorized');
            return;
          }
          if (res.ok && !closed && ws.readyState === ws.OPEN) {
            const data = await res.json();
            ws.send(JSON.stringify({ type: 'scans', data }));
          }
        } catch {
          /* transient; try again next tick */
        }
      };

      const stop = () => {
        closed = true;
        if (timer) clearInterval(timer);
      };
      ws.on('close', stop);
      ws.on('error', stop);

      send();
      timer = setInterval(send, 2000);
    });
  }

  server.listen(port, () => {
    console.log(`> Portglass ready on http://${hostname}:${port} (WS: /api/ws/scans)`);
  });
});
