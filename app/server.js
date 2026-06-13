#!/usr/bin/env node
// De Fles — mini-server: statische bestanden + gedeelde state + live sync (SSE)
// + foto-opslag + Volumio-proxy. Geen dependencies; draait op elke Node ≥ 18
// (Mac, NAS, Raspberry Pi). Start: `node server.js` of `npm start`.

import http from 'node:http';
import net from 'node:net';
import tls from 'node:tls';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_STATE, deepMerge, uid, token as makeToken, partyLinkStatus, usedPhotoNames } from './public/defles-data.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const PHOTO_DIR = path.join(DATA_DIR, 'photos');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const MAIL_FILE = path.join(DATA_DIR, 'mail.json');
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
// data/ bevat o.a. mail.json met SMTP-creds → alleen toegankelijk voor de eigenaar
try { fs.chmodSync(DATA_DIR, 0o700); } catch (e) { /* FS zonder rechten */ }

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
    const used = usedPhotoNames(state);
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

// Normaliseer/valideer een host-adres (bv. RetroHead) tot http(s)://host[:poort].
function normalizeBase(raw) {
  let h = (raw || '').trim();
  if (!h) return null;
  if (!/^https?:\/\//i.test(h)) h = 'http://' + h;
  h = h.replace(/\/+$/, '');
  const rest = h.replace(/^https?:\/\//i, '');
  if (!/^[a-zA-Z0-9.\-]+(:\d+)?$/.test(rest)) return null;
  return h;
}

async function getJson(fullUrl) {
  const r = await fetch(fullUrl, { signal: AbortSignal.timeout(4000) });
  if (!r.ok) throw new Error('http ' + r.status);
  return r.json();
}

// ---- Mailconfiguratie (los van de gedeelde state; bevat geheimen) ----
// Bewust NIET in state.json/SSE, zodat het SMTP-wachtwoord nooit via /api/state
// of het publieke RSVP-deel naar buiten lekt.
function loadMail() {
  try { return JSON.parse(fs.readFileSync(MAIL_FILE, 'utf8')); } catch (e) { return {}; }
}
function saveMail(cfg) {
  // Owner-only: bevat het SMTP-wachtwoord in platte tekst.
  fs.writeFileSync(MAIL_FILE, JSON.stringify(cfg, null, 1), { mode: 0o600 });
  try { fs.chmodSync(MAIL_FILE, 0o600); } catch (e) { /* bv. op een FS zonder rechten */ }
  publicHostCache = hostFromBase(cfg.publicBase || '');
}

// Hostnaam waarop het publieke (internet)deel draait — afgeleid van het
// 'publieke adres' in de mailinstellingen. Verzoeken op deze host krijgen
// alleen het publieke RSVP-deel te zien; beheer/state blijven verborgen.
function hostFromBase(b) {
  try { return new URL(b).hostname.toLowerCase(); } catch (e) { return ''; }
}
let publicHostCache = hostFromBase((loadMail().publicBase) || '');
// Veilige versie voor de admin-UI: wachtwoord wordt nooit teruggestuurd.
function mailPublicView(cfg) {
  return { host: cfg.host || '', port: cfg.port || 587, secure: !!cfg.secure, user: cfg.user || '', from: cfg.from || '', publicBase: cfg.publicBase || '', notify: cfg.notify || '', hasPass: !!cfg.pass };
}

// Stuur (best effort) een melding naar de bar bij een nieuwe aanmelding.
function notifyRsvp(ev, r) {
  const cfg = loadMail();
  if (!cfg.host || !cfg.from) return; // mail niet ingesteld → stil overslaan
  const to = (cfg.notify || '').trim() || (cfg.from.match(/<(.+)>/) || [null, cfg.from])[1];
  if (!to) return;
  const statusTxt = r.status === 'nee' ? 'komt NIET' : (r.status === 'misschien' ? 'komt MISSCHIEN' : 'komt');
  const text = 'Nieuwe aanmelding voor "' + ev.title + '":\n\n' +
    r.name + ' — ' + statusTxt + (Number(r.count) > 1 ? ' (met ' + r.count + ' personen)' : '') +
    (r.note ? '\nOpmerking: ' + r.note : '') + '\n\n— De Fles';
  sendMail(cfg, { to, subject: 'Aanmelding: ' + ev.title + ' — ' + r.name, text }).catch(() => {});
}

// Bevestiging naar de aanmelder zelf (alleen als die een e-mailadres opgaf).
function confirmRsvp(ev, r) {
  const cfg = loadMail();
  if (!cfg.host || !cfg.from || !r.email) return;
  const when = ev.whenISO ? new Date(ev.whenISO).toLocaleString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : '';
  const line = r.status === 'nee' ? 'Je hebt je afgemeld — jammer, tot een volgende keer!'
    : (r.status === 'misschien' ? 'We hebben genoteerd dat je misschien komt.' : 'Je bent aangemeld — tot dan!');
  const text = 'Hoi ' + r.name + ',\n\n' + line + '\n\n' + ev.title + (when ? '\n' + when : '') +
    (Number(r.count) > 1 ? '\nMet ' + r.count + ' personen.' : '') + '\n\nTot bij de tap! — De Fles';
  sendMail(cfg, { to: r.email, subject: 'Bevestiging: ' + ev.title, text }).catch(() => {});
}

// ---- Minimale, dependency-vrije SMTP-verzender (STARTTLS of implicit TLS) ----
// Voert een lijst stappen uit. Elke stap: { send?, expect?, starttls? }.
// hasGreeting=true: wacht eerst op de 220-begroeting (stap 0 zonder 'send').
// hasGreeting=false: schrijf stap 0 ('send') meteen (na een TLS-upgrade).
function runSteps(sock, steps, hasGreeting) {
  return new Promise((resolve, reject) => {
    let buf = '', i = 0;
    const timer = setTimeout(() => { cleanup(); reject(new Error('SMTP-timeout')); }, 15000);
    const onData = (d) => {
      buf += d.toString('utf8');
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trimEnd();
        buf = buf.slice(nl + 1);
        if (!/^\d{3} /.test(line)) continue; // sla vervolgregels (xxx-...) over
        const code = Number(line.slice(0, 3));
        const step = steps[i];
        if (step.expect && code !== step.expect) { cleanup(); return reject(new Error('SMTP ' + line)); }
        if (step.starttls) { cleanup(); return resolve({ upgrade: true }); }
        i++;
        if (i >= steps.length) { cleanup(); return resolve({ done: true }); }
        if (steps[i].send != null) sock.write(steps[i].send + '\r\n');
      }
    };
    const onErr = (e) => { cleanup(); reject(e); };
    function cleanup() { clearTimeout(timer); sock.removeListener('data', onData); sock.removeListener('error', onErr); }
    sock.on('data', onData);
    sock.on('error', onErr);
    if (!hasGreeting && steps[0] && steps[0].send != null) sock.write(steps[0].send + '\r\n');
  });
}

async function sendMail(cfg, msg) {
  if (!cfg.host || !cfg.from) throw new Error('mail niet geconfigureerd');
  const host = cfg.host;
  const port = Number(cfg.port) || 587;
  const ehlo = 'EHLO defles.local';
  const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
  const fromAddr = (cfg.from.match(/<(.+)>/) || [null, cfg.from])[1];
  const headers =
    'From: ' + cfg.from + '\r\n' +
    'To: ' + msg.to + '\r\n' +
    'Subject: =?UTF-8?B?' + b64(msg.subject) + '?=\r\n' +
    'MIME-Version: 1.0\r\n' +
    'Content-Type: text/plain; charset=UTF-8\r\n' +
    'Content-Transfer-Encoding: base64\r\n\r\n';
  const body = b64(msg.text).replace(/(.{76})/g, '$1\r\n');
  const dataStep = headers + body + '\r\n.'; // runSteps voegt de afsluitende \r\n toe

  const tail = [];
  if (cfg.user) {
    tail.push({ send: 'AUTH LOGIN', expect: 334 });
    tail.push({ send: b64(cfg.user), expect: 334 });
    tail.push({ send: b64(cfg.pass || ''), expect: 235 });
  }
  tail.push({ send: 'MAIL FROM:<' + fromAddr + '>', expect: 250 });
  tail.push({ send: 'RCPT TO:<' + msg.to + '>', expect: 250 });
  tail.push({ send: 'DATA', expect: 354 });
  tail.push({ send: dataStep, expect: 250 });

  // SNI mag geen IP-adres zijn; alleen bij een echte hostnaam meesturen.
  const sni = /^[0-9.]+$/.test(host) || host.includes(':') ? undefined : host;
  const secure = !!cfg.secure || port === 465;
  if (secure) {
    const sock = tls.connect({ host, port, servername: sni });
    await new Promise((res, rej) => { sock.once('secureConnect', res); sock.once('error', rej); });
    try {
      await runSteps(sock, [{ expect: 220 }, { send: ehlo, expect: 250 }, ...tail], true);
    } finally { sock.end(); }
    return;
  }
  // plain → STARTTLS → opnieuw EHLO
  const sock = net.connect({ host, port });
  await new Promise((res, rej) => { sock.once('connect', res); sock.once('error', rej); });
  const r = await runSteps(sock, [{ expect: 220 }, { send: ehlo, expect: 250 }, { send: 'STARTTLS', expect: 220, starttls: true }], true);
  if (!r.upgrade) { sock.end(); throw new Error('STARTTLS niet ondersteund'); }
  const tsock = tls.connect({ socket: sock, host, servername: sni });
  await new Promise((res, rej) => { tsock.once('secureConnect', res); tsock.once('error', rej); });
  try {
    await runSteps(tsock, [{ send: ehlo, expect: 250 }, ...tail], false);
  } finally { tsock.end(); }
}

// ---- Simpele rate-limiter voor het publieke RSVP-endpoint ----
const rsvpHits = new Map(); // ip -> [timestamps]
function rateLimited(ip) {
  const now = Date.now();
  const arr = (rsvpHits.get(ip) || []).filter((t) => now - t < 60000);
  arr.push(now);
  rsvpHits.set(ip, arr);
  return arr.length > 12; // max 12 inzendingen per minuut per IP
}
// Aparte, ruimere limiet voor feest-foto-uploads: alle gasten zitten meestal
// achter één wifi/NAT en delen dus één IP — een krappe RSVP-limiet zou ze
// onterecht blokkeren. De bestandsnaam is servergegenereerd en de grootte is
// begrensd, dus ruimer mag hier.
const partyHits = new Map(); // ip -> [timestamps]
function partyRateLimited(ip) {
  const now = Date.now();
  const arr = (partyHits.get(ip) || []).filter((t) => now - t < 60000);
  arr.push(now);
  partyHits.set(ip, arr);
  return arr.length > 60; // max 60 foto-uploads per minuut per IP (gedeeld door alle gasten)
}

function clientIp(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'onbekend';
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

    // Health-check (voor Traefik / Docker / uptime-monitors) — geen geheimen
    if (p === '/health') {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end('ok');
    }

    // Publieke-host-afscherming: komt het verzoek binnen op het publieke domein
    // (= host van het 'publieke adres'), dan is alléén het RSVP-deel zichtbaar.
    // Zo blijven beheer/TV/state verborgen, ongeacht de reverse-proxy-config.
    const reqHost = (req.headers.host || '').split(':')[0].toLowerCase();
    if (publicHostCache && reqHost === publicHostCache) {
      const allowed = p === '/welcome.html' || p === '/e' || p.startsWith('/e/') || p.startsWith('/api/rsvp/') || p === '/api/rsvp'
        || p === '/foto' || p.startsWith('/foto/')
        || (p.startsWith('/api/party/') && p !== '/api/party/new');
      if (!allowed) {
        if (req.method === 'GET') return serveFile(res, path.join(PUBLIC_DIR, 'welcome.html'));
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('Niet beschikbaar');
      }
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

    // RetroHead-proxy (eigen nostalgie-TV-app). Omzeilt CORS en bundelt de
    // zender-info, het lopende blok, wat er nu speelt en de programmering.
    if (p === '/api/radio/channels' && req.method === 'GET') {
        // SSRF-preventie: gebruik het in de admin-state opgeslagen adres, niet
        // een door de client aangeleverde parameter. Het doel instellen vereist
        // zo dezelfde toegang als de rest van het beheer.
        const base = normalizeBase(state.radio && state.radio.base);
        if (!base) return sendJson(res, 400, { error: 'geen RetroHead-adres ingesteld' });
        try {
          const list = await getJson(base + '/api/channels');
          const channels = (Array.isArray(list) ? list : []).map((c) => ({ slug: c.slug, name: c.name, number: c.number, enabled: c.enabled }));
          return sendJson(res, 200, { channels });
        } catch (e) {
          return sendJson(res, 502, { error: 'geen verbinding met RetroHead' });
        }
    }

    if (p === '/api/radio' && req.method === 'GET') {
      // SSRF-preventie: adres + zender komen uit de admin-state, niet uit de
      // client-request. Zo kan niemand de server willekeurige URLs laten ophalen.
      const base = normalizeBase(state.radio && state.radio.base);
      const slug = (state.radio && state.radio.slug || '').trim();
      const count = Math.max(1, Math.min(8, Number(url.searchParams.get('count')) || 4));
      if (!base || !slug || !/^[a-z0-9-]+$/i.test(slug)) return sendJson(res, 400, { error: 'ongeldige zender' });
      const c = base + '/api/channels/' + encodeURIComponent(slug);
      const [ch, block, pos, sched] = await Promise.all([
        getJson(c).catch(() => null),
        getJson(c + '/active-block').catch(() => null),
        getJson(c + '/playout/position').catch(() => null),
        getJson(c + '/schedule/upcoming?count=' + count).catch(() => null)
      ]);
      if (!ch && !block && !sched) return sendJson(res, 502, { error: 'geen verbinding met RetroHead' });
      const now = block ? { name: block.name, start: block.start_time, end: block.end_time, color: block.color || null } : null;
      const clip = pos && pos.position && pos.position.title ? { title: pos.position.title, artist: pos.position.artist || '' } : null;
      const upcoming = (sched && Array.isArray(sched.upcoming) ? sched.upcoming : []).map((u) => ({
        name: u.name, startAt: u.start_at, inMinutes: u.in_minutes, color: u.color || null
      }));
      const absUrl = (u) => (!u ? null : (/^https?:\/\//i.test(u) ? u : base + u));
      const logo = ch ? absUrl(ch.logo_url) : null;
      // Het zenderlogo is vaak een compositie van lagen — stuur ze mee zodat de
      // TV ze gestapeld toont (anders zie je maar één laag).
      const logoLayers = (ch && Array.isArray(ch.logo_layers) ? ch.logo_layers : [])
        .map((l) => ({
          url: absUrl(l.url),
          xPct: Number(l.x_pct) || 0,
          yPct: Number(l.y_pct) || 0,
          widthPct: l.width_pct != null ? Number(l.width_pct) : 100,
          opacity: l.opacity != null ? Number(l.opacity) : 1,
          rotation: Number(l.rotation_deg) || 0
        }))
        .filter((l) => l.url);
      return sendJson(res, 200, { name: ch ? ch.name : '', logo, logoLayers, now, clip, upcoming });
    }

    // ===== Evenement-planner =====
    // PUBLIEK + token-afgeschermd (veilig om naar internet te zetten):
    //   GET  /e/<id>?t=        -> RSVP-pagina (statisch)
    //   GET  /api/rsvp/<id>?t= -> alleen veilige evenement-info (geen namen/geheimen)
    //   POST /api/rsvp/<id>?t= -> aanmelding toevoegen (rate-limited)
    if (p === '/e' || p.startsWith('/e/')) {
      return serveFile(res, path.join(PUBLIC_DIR, 'rsvp', 'index.html'));
    }

    if (p.startsWith('/api/rsvp/')) {
      const id = decodeURIComponent(p.slice('/api/rsvp/'.length));
      const t = url.searchParams.get('t') || '';
      const ev = (state.events || []).find((e) => e.id === id);
      if (!ev || !ev.token || ev.token !== t) return sendJson(res, 404, { error: 'niet gevonden' });
      if (req.method === 'GET') {
        const coming = (ev.rsvps || []).filter((r) => r.status !== 'nee').reduce((n, r) => n + (Number(r.count) || 1), 0);
        return sendJson(res, 200, { title: ev.title, whenISO: ev.whenISO, desc: ev.desc, closed: !!ev.closed, coming });
      }
      if (req.method === 'POST') {
        if (rateLimited(clientIp(req))) return sendJson(res, 429, { error: 'Te veel inzendingen — probeer het zo nog eens.' });
        if (ev.closed) return sendJson(res, 403, { error: 'Aanmelden is gesloten voor dit evenement.' });
        const body = await readBody(req, 64 * 1024);
        let b; try { b = JSON.parse(body.toString('utf8')); } catch (e) { return sendJson(res, 400, { error: 'ongeldig' }); }
        const name = String(b.name || '').trim().slice(0, 80);
        const status = ['ja', 'misschien', 'nee'].includes(b.status) ? b.status : 'ja';
        const count = Math.max(1, Math.min(20, Number(b.count) || 1));
        const note = String(b.note || '').trim().slice(0, 300);
        const email = String(b.email || '').trim().slice(0, 120);
        const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
        if (!name) return sendJson(res, 400, { error: 'Vul je naam in.' });
        if (!Array.isArray(ev.rsvps)) ev.rsvps = [];
        if (ev.rsvps.length >= 1000) return sendJson(res, 403, { error: 'vol' });
        const entry = { id: uid(), name, status, count, note, email: emailOk ? email : '', at: Date.now() };
        ev.rsvps.push(entry);
        schedulePersist();
        broadcast('');
        notifyRsvp(ev, entry);                 // mailmelding naar de bar (best effort)
        if (emailOk) confirmRsvp(ev, entry);   // bevestiging naar de aanmelder
        return sendJson(res, 200, { ok: true, confirmed: emailOk });
      }
    }

    // PRIVÉ (alleen LAN/beheer — niet naar internet exposen): mail + uitnodigen.
    if (p === '/api/mail' && req.method === 'GET') return sendJson(res, 200, mailPublicView(loadMail()));
    if (p === '/api/mail' && req.method === 'PUT') {
      const body = await readBody(req, 64 * 1024);
      const b = JSON.parse(body.toString('utf8'));
      const cur = loadMail();
      const next = {
        host: (b.host || '').trim(), port: Number(b.port) || 587, secure: !!b.secure,
        user: (b.user || '').trim(), from: (b.from || '').trim(),
        notify: (b.notify || '').trim(),
        publicBase: (b.publicBase || '').trim().replace(/\/+$/, ''),
        // leeg wachtwoord = ongewijzigd laten (UI stuurt het nooit terug)
        pass: (b.pass != null && b.pass !== '') ? b.pass : (cur.pass || '')
      };
      saveMail(next);
      return sendJson(res, 200, mailPublicView(next));
    }
    if (p === '/api/mail/test' && req.method === 'POST') {
      const body = await readBody(req, 8 * 1024);
      const to = String(JSON.parse(body.toString('utf8')).to || '').trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return sendJson(res, 400, { error: 'ongeldig e-mailadres' });
      try {
        await sendMail(loadMail(), { to, subject: 'Testmail — De Fles', text: 'Dit is een testmail vanuit het beheerscherm van De Fles. Komt deze aan, dan staat de mailserver goed!' });
        return sendJson(res, 200, { ok: true });
      } catch (e) { return sendJson(res, 502, { error: 'Verzenden mislukt: ' + e.message }); }
    }
    if (p.startsWith('/api/events/') && p.endsWith('/invite') && req.method === 'POST') {
      const id = decodeURIComponent(p.slice('/api/events/'.length, -('/invite'.length)));
      const ev = (state.events || []).find((e) => e.id === id);
      if (!ev) return sendJson(res, 404, { error: 'evenement niet gevonden' });
      const cfg = loadMail();
      if (!cfg.host || !cfg.from) return sendJson(res, 400, { error: 'Stel eerst de mailserver in.' });
      const base = (cfg.publicBase || '').replace(/\/+$/, '');
      if (!base) return sendJson(res, 400, { error: 'Stel eerst het publieke adres in (bij de mailinstellingen).' });
      const body = await readBody(req, 64 * 1024);
      const emails = (JSON.parse(body.toString('utf8')).emails || [])
        .map((s) => String(s).trim()).filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)).slice(0, 200);
      if (!emails.length) return sendJson(res, 400, { error: 'geen geldige e-mailadressen' });
      const link = base + '/e/' + encodeURIComponent(ev.id) + '?t=' + encodeURIComponent(ev.token);
      const when = ev.whenISO ? new Date(ev.whenISO).toLocaleString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : '';
      let sent = 0; const failed = [];
      for (const to of emails) {
        try {
          await sendMail(cfg, { to, subject: 'Uitnodiging: ' + ev.title, text: 'Hoi!\n\nJe bent uitgenodigd in De Fles:\n\n' + ev.title + (when ? '\n' + when : '') + (ev.desc ? '\n\n' + ev.desc : '') + '\n\nLaat even weten of je komt:\n' + link + '\n\nTot dan! — De Fles' });
          sent++;
        } catch (e) { failed.push(to); }
      }
      return sendJson(res, 200, { sent, failed });
    }

    // ---- PUBLIEK + token-afgeschermd: gasten-foto's ----
    //   GET  /foto, /foto/<token>     -> upload-pagina (statisch)
    //   POST /api/party/new           -> nieuw feest: vers token, 24 u geldig (beheer-only)
    //   GET  /api/party/<token>       -> linkstatus (geldig / 410 verlopen)
    //   POST /api/party/<token>/photo -> gasten-foto toevoegen (rate-limited)
    if (p === '/foto' || p.startsWith('/foto/')) {
      return serveFile(res, path.join(PUBLIC_DIR, 'foto', 'index.html'));
    }

    if (p === '/api/party/new' && req.method === 'POST') {
      state.party = state.party || { token: null, expiresAt: 0, photos: [] };
      state.party.token = makeToken();
      state.party.expiresAt = Date.now() + 24 * 60 * 60 * 1000;
      schedulePersist();
      broadcast('');
      const base = req.headers.host ? 'http://' + req.headers.host : '';
      return sendJson(res, 200, {
        token: state.party.token,
        expiresAt: state.party.expiresAt,
        url: base.replace(/\/+$/, '') + '/foto/' + state.party.token
      });
    }

    if (p.startsWith('/api/party/')) {
      const rest = p.slice('/api/party/'.length);        // "<token>" of "<token>/photo"
      const isPhoto = rest.endsWith('/photo');
      const tok = decodeURIComponent(isPhoto ? rest.slice(0, -('/photo'.length)) : rest);
      const status = partyLinkStatus(state.party, tok, Date.now());

      if (!isPhoto && req.method === 'GET') {
        if (status !== 'ok') return sendJson(res, 410, { error: 'verlopen' });
        return sendJson(res, 200, { geldig: true, expiresAt: state.party.expiresAt });
      }

      if (isPhoto && req.method === 'POST') {
        if (partyRateLimited(clientIp(req))) return sendJson(res, 429, { error: 'Even rustig aan — probeer het zo nog eens.' });
        if (status !== 'ok') return sendJson(res, 410, { error: 'Deze link is verlopen.' });
        const body = await readBody(req, 12 * 1024 * 1024);
        let b; try { b = JSON.parse(body.toString('utf8')); } catch (e) { return sendJson(res, 400, { error: 'ongeldig' }); }
        const m = /^data:image\/(jpeg|png|webp);base64,(.+)$/s.exec(b.dataUrl || '');
        if (!m) return sendJson(res, 400, { error: 'geen geldige afbeelding' });
        const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
        const name = uid() + '.' + ext;
        await fsp.writeFile(path.join(PHOTO_DIR, name), Buffer.from(m[2], 'base64'));
        const who = String(b.name || '').trim().slice(0, 40);
        state.party.photos.push({ id: uid(), src: '/photos/' + name, name: who, ts: Date.now() });
        schedulePersist();
        broadcast('');
        return sendJson(res, 200, { ok: true });
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
