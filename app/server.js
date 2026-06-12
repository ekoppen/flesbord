#!/usr/bin/env node
// De Fles — mini-server: statische bestanden + gedeelde state + live sync (SSE)
// + foto-opslag + Volumio-proxy. Geen dependencies; draait op elke Node ≥ 18
// (Mac, NAS, Raspberry Pi). Start: `node server.js` of `npm start`.

import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_STATE, deepMerge, uid } from './public/defles-data.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const PHOTO_DIR = path.join(DATA_DIR, 'photos');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const PORT = Number(process.env.PORT || 8420);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8'
};

fs.mkdirSync(PHOTO_DIR, { recursive: true });

// ---- State: in geheugen, op schijf bewaard (atomisch, met schrijf-bundeling) ----
let state = loadStateFromDisk();
let persistTimer = null;

function loadStateFromDisk() {
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    return deepMerge(DEFAULT_STATE, JSON.parse(raw));
  } catch (e) {
    return structuredClone(DEFAULT_STATE);
  }
}

function schedulePersist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(async () => {
    try {
      const tmp = STATE_FILE + '.tmp';
      await fsp.writeFile(tmp, JSON.stringify(state, null, 1));
      await fsp.rename(tmp, STATE_FILE);
      prunePhotos();
    } catch (e) {
      console.error('state bewaren mislukt:', e.message);
    }
  }, 500);
}

// Verwijder fotobestanden waar de state niet (meer) naar verwijst.
// Gracetijd van 10 min: een upload gebeurt vóór de state-update die ernaar wijst.
async function prunePhotos() {
  try {
    const used = new Set((state.photos || [])
      .map((p) => (p.src || '').startsWith('/photos/') ? path.basename(p.src) : null)
      .filter(Boolean));
    for (const f of await fsp.readdir(PHOTO_DIR)) {
      if (used.has(f)) continue;
      const st = await fsp.stat(path.join(PHOTO_DIR, f)).catch(() => null);
      if (st && Date.now() - st.mtimeMs > 10 * 60 * 1000) await fsp.unlink(path.join(PHOTO_DIR, f)).catch(() => {});
    }
  } catch (e) { /* opruimen is best effort */ }
}

// ---- Live sync: Server-Sent Events ----
const sseClients = new Set();

function broadcast(origin) {
  const payload = 'data: ' + JSON.stringify({ origin: origin || '', state }) + '\n\n';
  for (const res of sseClients) {
    try { res.write(payload); } catch (e) { sseClients.delete(res); }
  }
}

setInterval(() => {
  for (const res of sseClients) {
    try { res.write(': ping\n\n'); } catch (e) { sseClients.delete(res); }
  }
}, 25000);

// ---- Hulpfuncties ----
function readBody(req, limitBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limitBytes) { reject(new Error('body te groot')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
  res.end(body);
}

async function serveFile(res, filePath) {
  try {
    const st = await fsp.stat(filePath);
    if (st.isDirectory()) return serveFile(res, path.join(filePath, 'index.html'));
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'max-age=300'
    });
    fs.createReadStream(filePath).pipe(res);
  } catch (e) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Niet gevonden');
  }
}

// ---- Server ----
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = decodeURIComponent(url.pathname);

  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      });
      return res.end();
    }

    // Gedeelde state
    if (p === '/api/state' && req.method === 'GET') return sendJson(res, 200, state);

    if (p === '/api/state' && req.method === 'PUT') {
      const body = await readBody(req, 8 * 1024 * 1024);
      const next = JSON.parse(body.toString('utf8'));
      state = deepMerge(DEFAULT_STATE, next);
      schedulePersist();
      broadcast(url.searchParams.get('client'));
      return sendJson(res, 200, { ok: true });
    }

    // Live updates (SSE)
    if (p === '/api/events' && req.method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      });
      res.write('retry: 3000\n\n');
      res.write('data: ' + JSON.stringify({ origin: '', state }) + '\n\n');
      sseClients.add(res);
      req.on('close', () => sseClients.delete(res));
      return;
    }

    // Foto-upload: dataURL in, bestands-URL uit
    if (p === '/api/photos' && req.method === 'POST') {
      const body = await readBody(req, 12 * 1024 * 1024);
      const { dataUrl } = JSON.parse(body.toString('utf8'));
      const m = /^data:image\/(jpeg|png|webp);base64,(.+)$/s.exec(dataUrl || '');
      if (!m) return sendJson(res, 400, { error: 'geen geldige afbeelding' });
      const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
      const name = uid() + '.' + ext;
      await fsp.writeFile(path.join(PHOTO_DIR, name), Buffer.from(m[2], 'base64'));
      return sendJson(res, 200, { src: '/photos/' + name });
    }

    if (p.startsWith('/photos/') && req.method === 'GET') {
      const name = path.basename(p); // geen padtraversal
      return serveFile(res, path.join(PHOTO_DIR, name));
    }

    // Volumio-proxy (Volumio stuurt geen CORS-headers, dus de browser mag
    // het apparaat niet rechtstreeks bevragen — de server wel).
    if (p === '/api/volumio' && req.method === 'GET') {
      let host = (url.searchParams.get('host') || '').trim();
      if (!/^[a-zA-Z0-9.\-]+(:\d+)?$/.test(host.replace(/^https?:\/\//i, '').replace(/\/+$/, ''))) {
        return sendJson(res, 400, { error: 'ongeldig adres' });
      }
      if (!/^https?:\/\//i.test(host)) host = 'http://' + host;
      host = host.replace(/\/+$/, '');
      try {
        const r = await fetch(host + '/api/v1/getState', { signal: AbortSignal.timeout(4000) });
        if (!r.ok) throw new Error('volumio http ' + r.status);
        const j = await r.json();
        return sendJson(res, 200, { track: j.title || '', artist: j.artist || '', playing: j.status === 'play' });
      } catch (e) {
        return sendJson(res, 502, { error: 'geen verbinding met Volumio' });
      }
    }

    // Statische bestanden
    if (req.method === 'GET') {
      const safe = path.normalize(p).replace(/^(\.\.[/\\])+/, '');
      let filePath = path.join(PUBLIC_DIR, safe);
      if (!filePath.startsWith(PUBLIC_DIR)) {
        res.writeHead(403); return res.end();
      }
      return serveFile(res, filePath);
    }

    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Methode niet toegestaan');
  } catch (e) {
    sendJson(res, 500, { error: e.message });
  }
});

server.listen(PORT, () => {
  const nets = os.networkInterfaces();
  const ips = Object.values(nets).flat().filter((n) => n && n.family === 'IPv4' && !n.internal).map((n) => n.address);
  console.log('De Fles draait!');
  console.log('  TV-scherm:    http://' + (ips[0] || 'localhost') + ':' + PORT + '/tv/');
  console.log('  Beheerscherm: http://' + (ips[0] || 'localhost') + ':' + PORT + '/admin/');
  if (ips.length > 1) console.log('  (ook bereikbaar via: ' + ips.slice(1).map((ip) => 'http://' + ip + ':' + PORT).join(', ') + ')');
});
