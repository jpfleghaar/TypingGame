/**
 * Mehrspieler-Server: liefert das gebaute Spiel (dist/) aus und verbindet die
 * Browser per WebSocket unter /ws.
 *
 *   npm run server        → Port 8787 (oder PORT=…)
 *
 * Im Entwicklungsmodus (npm run dev) leitet Vite /ws an diesen Server weiter.
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import type { ClientMsg, ServerMsg } from '../src/net/protocol';
import { Lobby, type Conn } from './rooms';

const PORT = Number(process.env.PORT) || 8787;
const DIST = resolve(import.meta.dirname ?? '.', '../dist');
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

const http = createServer((req, res) => {
  if (!existsSync(DIST)) {
    res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Spiel noch nicht gebaut – erst "npm run build" ausführen (oder "npm run lan").');
    return;
  }
  const path = decodeURIComponent((req.url ?? '/').split('?')[0]);
  let file = normalize(join(DIST, path));
  if (!file.startsWith(DIST)) {
    res.writeHead(403).end();
    return;
  }
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
});

const lobby = new Lobby();
const wss = new WebSocketServer({ server: http, path: '/ws', maxPayload: 64 * 1024 });

wss.on('connection', (ws: WebSocket) => {
  const conn: Conn = {
    send(msg: ServerMsg) {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
    },
  };
  ws.on('message', (data) => {
    let msg: ClientMsg;
    try {
      msg = JSON.parse(String(data)) as ClientMsg;
    } catch {
      return;
    }
    if (msg && typeof msg === 'object' && typeof msg.t === 'string') lobby.message(conn, msg);
  });
  ws.on('close', () => lobby.disconnect(conn));
  ws.on('error', () => lobby.disconnect(conn));
});

// Runden weiterrechnen; ~4 ms Takt, damit Eingaben schnell bei allen ankommen.
setInterval(() => lobby.update(), 4);

http.listen(PORT, '0.0.0.0', () => {
  const ips = Object.values(networkInterfaces())
    .flat()
    .filter((n) => n && n.family === 'IPv4' && !n.internal)
    .map((n) => n!.address);
  console.log(`Typing Royale Mehrspieler-Server läuft auf Port ${PORT}`);
  console.log(`  auf diesem Rechner:  http://localhost:${PORT}`);
  for (const ip of ips) console.log(`  im Netzwerk:         http://${ip}:${PORT}`);
  if (!existsSync(DIST)) console.log('  (dist/ fehlt – Spiel mit "npm run build" bauen oder "npm run dev" nutzen)');
});
