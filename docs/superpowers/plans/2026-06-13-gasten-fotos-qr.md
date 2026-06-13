# Gasten-foto's via QR — Implementatieplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aanwezigen laten via een QR-code een foto + naam op het bord plaatsen vanaf hun eigen telefoon; de openbare link verloopt na 24 uur, foto's blijven op schijf bewaard.

**Architecture:** Bovenop de bestaande vanilla Node-server (`app/server.js`, geen dependencies, gedeelde `state` + SSE). Gasten-foto's komen in een aparte, niet-krimpende lijst `state.party.photos`; het bord toont de laatste 40. Nieuwe endpoints volgen het bestaande token-afgeschermde RSVP-patroon (`server.js:449-528`). De gast krijgt nooit toegang tot de algemene `PUT /api/state`.

**Tech Stack:** Node ≥18 (ES-modules, geen deps), vanilla browser-JS, ingebouwde `node:test` voor unit-tests, één gevendord QR-bestand (qrcodejs, MIT).

**Spec:** `docs/superpowers/specs/2026-06-13-gasten-fotos-qr-design.md`

---

## Bestandsoverzicht

| Bestand | Verantwoordelijkheid |
|---------|----------------------|
| `app/public/defles-data.js` | `DEFAULT_STATE.party` + pure helpers `partyLinkStatus()`, `usedPhotoNames()` |
| `app/test/party.test.js` | Unit-tests voor de twee helpers |
| `app/server.js` | Party-endpoints, `/foto`-route, publieke-host-allowlist, `prunePhotos` via `usedPhotoNames` |
| `app/public/foto/index.html` | Gast-uploadpagina (resize + upload + verlopen-scherm) |
| `app/public/admin/qrcode.min.js` | Gevendorde QR-renderer (global `QRCode`) |
| `app/public/admin/index.html` | `<script>` voor qrcode.min.js |
| `app/public/admin/admin.js` | `cardFeest()` (QR/link/vervaltijd), gasten-foto-grid + noodrem, acties |
| `app/public/tv/tv.js` | View "Foto's van het feest" (raster + roterend) |

**Buiten scope:** de losse standalone-artefacten in de repo-root (`defles-data.js`, `*.dc.html`) — dat zijn oudere één-bestand-prototypes, niet de draaiende app.

---

## Task 1: State-default + pure helpers (defles-data.js)

**Files:**
- Modify: `app/public/defles-data.js`
- Test: `app/test/party.test.js`

- [ ] **Step 1: Schrijf de falende test**

Maak `app/test/party.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_STATE, partyLinkStatus, usedPhotoNames } from '../public/defles-data.js';

test('DEFAULT_STATE.party heeft de juiste vorm', () => {
  assert.deepEqual(DEFAULT_STATE.party, { token: null, expiresAt: 0, photos: [] });
});

test('partyLinkStatus: ok wanneer token klopt en niet verlopen', () => {
  const party = { token: 'abc', expiresAt: 1000, photos: [] };
  assert.equal(partyLinkStatus(party, 'abc', 500), 'ok');
});

test('partyLinkStatus: expired wanneer token klopt maar voorbij vervaltijd', () => {
  const party = { token: 'abc', expiresAt: 1000, photos: [] };
  assert.equal(partyLinkStatus(party, 'abc', 1000), 'expired');
  assert.equal(partyLinkStatus(party, 'abc', 2000), 'expired');
});

test('partyLinkStatus: unknown bij ontbrekend of ander token', () => {
  const party = { token: 'abc', expiresAt: 1000, photos: [] };
  assert.equal(partyLinkStatus(party, 'xyz', 500), 'unknown');
  assert.equal(partyLinkStatus(party, '', 500), 'unknown');
  assert.equal(partyLinkStatus({ token: null, expiresAt: 0, photos: [] }, 'abc', 500), 'unknown');
  assert.equal(partyLinkStatus(undefined, 'abc', 500), 'unknown');
});

test('usedPhotoNames verzamelt curated én party-foto-bestandsnamen', () => {
  const state = {
    photos: [{ src: '/photos/aaa.jpg' }, { src: 'https://picsum.photos/x' }],
    party: { photos: [{ src: '/photos/bbb.webp' }, { src: '/photos/ccc.png' }] }
  };
  const names = usedPhotoNames(state);
  assert.ok(names.has('aaa.jpg'));
  assert.ok(names.has('bbb.webp'));
  assert.ok(names.has('ccc.png'));
  assert.equal(names.has('x'), false); // externe URL telt niet mee
  assert.equal(names.size, 3);
});

test('usedPhotoNames is robuust bij ontbrekende velden', () => {
  assert.equal(usedPhotoNames({}).size, 0);
  assert.equal(usedPhotoNames({ photos: null, party: null }).size, 0);
});
```

- [ ] **Step 2: Draai de test — moet falen**

Run: `cd app && node --test test/party.test.js`
Expected: FAIL — `partyLinkStatus`/`usedPhotoNames` zijn nog niet geëxporteerd; `DEFAULT_STATE.party` is `undefined`.

- [ ] **Step 3: Voeg `party` toe aan DEFAULT_STATE**

In `app/public/defles-data.js`, direct ná het `events: [ ... ]`-blok (vóór de afsluitende `};` van `DEFAULT_STATE`), voeg toe:

```js
  party: { token: null, expiresAt: 0, photos: [] },
```

Concreet wordt het einde van `DEFAULT_STATE`:

```js
  events: [
    {
      id: 'ev-demo', title: 'Nederland – Japan kijken', whenISO: '2026-06-14T21:30',
      desc: 'Aftrap 22:00 op groot scherm — kom op tijd! Eigen versnaperingen welkom.',
      token: 'demo-wk-japan', showOnTv: true, closed: false,
      inviteList: '', rsvps: []
    }
  ],
  party: { token: null, expiresAt: 0, photos: [] }
};
```

- [ ] **Step 4: Voeg de twee helpers toe**

In `app/public/defles-data.js`, direct ná de bestaande `export function token() { ... }` (rond regel 184), voeg toe:

```js
// Status van een gasten-link: 'ok' (token klopt én niet verlopen),
// 'expired' (token klopt maar voorbij de vervaltijd) of 'unknown' (geen/ander token).
export function partyLinkStatus(party, token, now) {
  if (!party || !party.token || !token || party.token !== token) return 'unknown';
  if (!party.expiresAt || now >= party.expiresAt) return 'expired';
  return 'ok';
}

// Bestandsnamen van álle foto's waar de state naar verwijst — zowel de curated
// foto's als de gasten-pool. De server gebruikt dit om te bepalen welke
// fotobestanden bewaard moeten blijven (de gasten-pool krimpt nooit).
export function usedPhotoNames(state) {
  const names = new Set();
  const add = (src) => {
    if (typeof src === 'string' && src.startsWith('/photos/')) names.add(src.slice('/photos/'.length));
  };
  for (const ph of (state && state.photos) || []) add(ph && ph.src);
  for (const ph of (state && state.party && state.party.photos) || []) add(ph && ph.src);
  return names;
}
```

- [ ] **Step 5: Draai de test — moet slagen**

Run: `cd app && node --test test/party.test.js`
Expected: PASS — alle 6 tests groen.

- [ ] **Step 6: Commit**

```bash
git add app/public/defles-data.js app/test/party.test.js
git commit -m "Gasten-foto's: party-state + helpers (partyLinkStatus, usedPhotoNames)"
```

---

## Task 2: prunePhotos beschermt de gasten-pool (server.js)

**Files:**
- Modify: `app/server.js` (import-regel ~14; `prunePhotos` ~67-78)

- [ ] **Step 1: Breid de import uit**

Vervang in `app/server.js` de regel:

```js
import { DEFAULT_STATE, deepMerge, uid } from './public/defles-data.js';
```

door:

```js
import { DEFAULT_STATE, deepMerge, uid, token as makeToken, partyLinkStatus, usedPhotoNames } from './public/defles-data.js';
```

- [ ] **Step 2: Laat prunePhotos `usedPhotoNames` gebruiken**

Vervang in `app/server.js` de body van `prunePhotos` (de berekening van `used`). Was:

```js
    const used = new Set((state.photos || [])
      .map((p) => (p.src || '').startsWith('/photos/') ? path.basename(p.src) : null)
      .filter(Boolean));
```

Wordt:

```js
    const used = usedPhotoNames(state);
```

(De rest van `prunePhotos` — de `for`-lus met de 10-minuten-gracetijd — blijft ongewijzigd.)

- [ ] **Step 3: Verifieer dat de server nog start**

Run: `cd app && node -e "import('./server.js').then(()=>{console.log('import ok'); process.exit(0)})"`
Expected: print `De Fles draait!` + `import ok` (poort 8420 even bezet; daarna exit).
Als poort 8420 bezet is: `PORT=8499 node -e "..."`.

- [ ] **Step 4: Commit**

```bash
git add app/server.js
git commit -m "Gasten-foto's: prunePhotos beschermt ook de party-pool"
```

---

## Task 3: Party-endpoints + /foto-route + publieke-host-allowlist (server.js)

**Files:**
- Modify: `app/server.js` (publieke-host-blok ~320-329; nieuw routeblok vóór de statische fallback ~520)

- [ ] **Step 1: Zet de gast-routes op de publieke-host-allowlist**

In `app/server.js`, in het "Publieke-host-afscherming"-blok, vervang de `allowed`-regel. Was:

```js
      const allowed = p === '/welcome.html' || p === '/e' || p.startsWith('/e/') || p.startsWith('/api/rsvp/') || p === '/api/rsvp';
```

Wordt:

```js
      const allowed = p === '/welcome.html' || p === '/e' || p.startsWith('/e/') || p.startsWith('/api/rsvp/') || p === '/api/rsvp'
        || p === '/foto' || p.startsWith('/foto/')
        || (p.startsWith('/api/party/') && p !== '/api/party/new');
```

> Let op: `/api/party/new` (token aanmaken) is bewust NIET toegestaan op de publieke host — dat is een beheeractie en blijft alleen op het lokale netwerk bereikbaar.

- [ ] **Step 2: Voeg het party-routeblok toe**

In `app/server.js`, direct vóór het commentaarblok `// Statische bestanden` (de `if (req.method === 'GET') { ... serveFile ... }` aan het eind van de request-handler), voeg toe:

```js
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
        if (rateLimited(clientIp(req))) return sendJson(res, 429, { error: 'Even rustig aan — probeer het zo nog eens.' });
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

```

- [ ] **Step 3: Smoke-test handmatig met curl**

Start de server: `cd app && PORT=8499 node server.js` (in een aparte terminal). Dan:

```bash
# Nieuw feest -> token + url
curl -s -X POST http://localhost:8499/api/party/new
# Kopieer het "token" uit de output, vul hieronder in als <T>:
curl -s http://localhost:8499/api/party/<T>            # -> {"geldig":true,...}
curl -s http://localhost:8499/api/party/onbekend        # -> 410 {"error":"verlopen"}
# 1x1 transparante PNG uploaden:
curl -s -X POST http://localhost:8499/api/party/<T>/photo \
  -H 'Content-Type: application/json' \
  -d '{"dataUrl":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC","name":"Test"}'
# -> {"ok":true}
curl -s http://localhost:8499/api/state | grep -o '"party":{[^}]*' # party in state
```
Expected: `new` geeft token+url; geldig-check `geldig:true`; onbekend token `410`; upload `{"ok":true}`; state bevat de nieuwe party-foto. Stop de server daarna (Ctrl-C).

- [ ] **Step 4: Commit**

```bash
git add app/server.js
git commit -m "Gasten-foto's: party-endpoints + /foto-route + publieke allowlist"
```

---

## Task 4: Gast-uploadpagina (app/public/foto/index.html)

**Files:**
- Create: `app/public/foto/index.html`

- [ ] **Step 1: Maak de pagina**

Maak `app/public/foto/index.html` met onderstaande inhoud. De pagina leest het token uit het pad (`/foto/<token>`), checkt de linkstatus, verkleint de foto client-side (zelfde aanpak als het beheerscherm: maxzijde 1280, JPEG 0.72) en uploadt naar `/api/party/<token>/photo`.

```html
<!doctype html>
<html lang="nl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>Foto op het bord — De Fles</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100dvh; background: #1c1812; color: #f2ecdc;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex; align-items: center; justify-content: center; padding: 24px; }
    .card { width: 100%; max-width: 440px; background: #2a241b; border-radius: 18px;
      padding: 28px 24px; box-shadow: 0 16px 48px rgba(0,0,0,0.5); }
    h1 { font-size: 26px; margin: 0 0 6px; }
    p.sub { margin: 0 0 22px; color: rgba(242,236,220,0.6); font-size: 15px; }
    label { display: block; font-size: 14px; margin: 16px 0 6px; color: rgba(242,236,220,0.75); }
    input[type=text] { width: 100%; padding: 13px 14px; border-radius: 10px; border: none;
      background: #faf6ec; color: #2a241b; font-size: 17px; }
    .btn { display: block; width: 100%; padding: 16px; border: none; border-radius: 999px;
      background: #f4a259; color: #2a241b; font-size: 18px; font-weight: 700; cursor: pointer;
      margin-top: 22px; }
    .btn[disabled] { opacity: 0.5; cursor: default; }
    .pick { display: flex; align-items: center; justify-content: center; gap: 10px;
      min-height: 180px; border: 3px dashed rgba(242,236,220,0.3); border-radius: 14px;
      cursor: pointer; overflow: hidden; }
    .pick img { width: 100%; height: 100%; object-fit: cover; }
    .pick span { font-size: 17px; color: rgba(242,236,220,0.6); }
    .status { margin-top: 16px; font-size: 15px; min-height: 20px; text-align: center; }
    .ok { color: #8fd19e; } .err { color: #f08c8c; }
    .hide { display: none !important; }
    .verlopen { text-align: center; }
    .verlopen .big { font-size: 40px; margin-bottom: 10px; }
  </style>
</head>
<body>
  <div class="card">
    <div id="form-view" class="hide">
      <h1>Zet je foto op het bord 📸</h1>
      <p class="sub">Hij verschijnt zo bij “Foto’s van het feest”.</p>
      <div class="pick" id="pick"><span>Tik om een foto te kiezen of te maken</span></div>
      <input id="file" type="file" accept="image/*" capture="environment" class="hide">
      <label for="naam">Van wie is deze foto?</label>
      <input id="naam" type="text" maxlength="40" placeholder="je naam" autocomplete="off">
      <button class="btn" id="send" disabled>Op het bord zetten</button>
      <div class="status" id="status"></div>
    </div>

    <div id="expired-view" class="hide verlopen">
      <div class="big">⌛</div>
      <h1>Deze link is verlopen</h1>
      <p class="sub">Vraag de gastheer of -vrouw om een nieuwe QR-code.</p>
    </div>

    <div id="loading-view">
      <p class="sub" style="text-align:center;margin:30px 0;">Even laden…</p>
    </div>
  </div>

  <script>
    const token = location.pathname.replace(/^\/foto\/?/, '').replace(/\/+$/, '');
    const $ = (id) => document.getElementById(id);
    let dataUrl = null;

    function show(view) {
      for (const v of ['form-view', 'expired-view', 'loading-view']) $(v).classList.add('hide');
      $(view).classList.remove('hide');
    }

    async function resize(file) {
      const url = URL.createObjectURL(file);
      const img = await new Promise((res, rej) => {
        const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url;
      });
      const maxSide = 1280;
      const ratio = Math.min(1, maxSide / Math.max(img.width, img.height));
      const cw = Math.round(img.width * ratio), ch = Math.round(img.height * ratio);
      const cv = document.createElement('canvas');
      cv.width = cw; cv.height = ch;
      cv.getContext('2d').drawImage(img, 0, 0, cw, ch);
      URL.revokeObjectURL(url);
      return cv.toDataURL('image/jpeg', 0.72);
    }

    $('pick').addEventListener('click', () => $('file').click());

    $('file').addEventListener('change', async (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      $('status').textContent = '';
      try {
        dataUrl = await resize(f);
        $('pick').innerHTML = '<img src="' + dataUrl + '" alt="">';
        $('send').disabled = false;
      } catch (err) {
        $('status').className = 'status err';
        $('status').textContent = 'Kon deze foto niet lezen — probeer een andere.';
      }
    });

    $('send').addEventListener('click', async () => {
      if (!dataUrl) return;
      $('send').disabled = true;
      $('status').className = 'status';
      $('status').textContent = 'Versturen…';
      try {
        const r = await fetch('/api/party/' + encodeURIComponent(token) + '/photo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dataUrl, name: $('naam').value })
        });
        if (r.status === 410) { show('expired-view'); return; }
        if (!r.ok) throw new Error('http ' + r.status);
        $('status').className = 'status ok';
        $('status').textContent = 'Gelukt! Je foto staat op het bord 🎉';
        dataUrl = null;
        $('pick').innerHTML = '<span>Nog eentje? Tik om te kiezen</span>';
      } catch (err) {
        $('send').disabled = false;
        $('status').className = 'status err';
        $('status').textContent = 'Versturen mislukt — probeer het opnieuw.';
      }
    });

    (async () => {
      if (!token) { show('expired-view'); return; }
      try {
        const r = await fetch('/api/party/' + encodeURIComponent(token));
        if (!r.ok) { show('expired-view'); return; }
        show('form-view');
      } catch (e) { show('expired-view'); }
    })();
  </script>
</body>
</html>
```

- [ ] **Step 2: Verifieer in de browser**

Start `cd app && PORT=8499 node server.js`. Maak een token: `curl -s -X POST http://localhost:8499/api/party/new`.
Open `http://localhost:8499/foto/<token>` in de browser → upload-formulier verschijnt. Open `http://localhost:8499/foto/onbekend` → "Deze link is verlopen". Kies een foto, vul een naam in, verstuur → "Gelukt!". Controleer: `curl -s http://localhost:8499/api/state | grep party`. Stop de server.

- [ ] **Step 3: Commit**

```bash
git add app/public/foto/index.html
git commit -m "Gasten-foto's: gast-uploadpagina met verlopen-afhandeling"
```

---

## Task 5: Beheer — Feest-kaart met QR, link en vervaltijd (admin.js)

**Files:**
- Create: `app/public/admin/qrcode.min.js` (gevendord)
- Modify: `app/public/admin/index.html` (script-tag)
- Modify: `app/public/admin/admin.js` (`cardFeest`, `render`, QR-render, `genQr`-actie)

- [ ] **Step 1: Vendor de QR-renderer**

Run (internet nodig; commit het bestand mee zodat het offline blijft werken):

```bash
curl -fsSL https://cdn.jsdelivr.net/gh/davidshimjs/qrcodejs@04f46c6a0708418cb7b96fc563eacae0fbf77674/qrcode.min.js \
  -o app/public/admin/qrcode.min.js
test -s app/public/admin/qrcode.min.js && echo "qrcode.min.js opgehaald"
```
Expected: "qrcode.min.js opgehaald" (bestand niet leeg).

- [ ] **Step 2: Laad de QR-renderer in het beheerscherm**

In `app/public/admin/index.html`, voeg vlak vóór de bestaande `<script type="module" src="admin.js"></script>`-regel toe:

```html
  <script src="qrcode.min.js"></script>
```
(Een gewone script-tag, geen module — `QRCode` komt zo als globale variabele beschikbaar voor admin.js.)

- [ ] **Step 3: Voeg de Feest-kaart + helpers toe in admin.js**

In `app/public/admin/admin.js`, direct vóór `function render() {` (rond regel 519), voeg toe:

```js
function partyLink(d) {
  if (!d.party || !d.party.token) return '';
  const base = (app.mail && app.mail.publicBase) || location.origin;
  return base.replace(/\/+$/, '') + '/foto/' + d.party.token;
}

function partyActive(d) {
  return D.partyLinkStatus(d.party, d.party && d.party.token, Date.now()) === 'ok';
}

function cardFeest(d) {
  const link = partyLink(d);
  const active = partyActive(d);
  const tot = active
    ? new Date(d.party.expiresAt).toLocaleString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
    : '';
  const top =
    '<div style="display: flex; align-items: baseline; justify-content: space-between; gap: 12px;">' +
      '<h2 style="margin: 0;">FEEST · FOTO’S VAN GASTEN</h2>' +
      '<span style="font-size: 14px; color: rgba(242,236,220,0.55);">' + (d.party && d.party.photos ? d.party.photos.length : 0) + ' foto’s</span>' +
    '</div>' +
    '<p style="font-size: 15px; color: rgba(242,236,220,0.6); margin: 6px 0 16px;">Laat gasten een foto op het bord zetten met hun telefoon. De QR-link verloopt 24 uur na het genereren.</p>';

  const qrBlock = active
    ? '<div style="display: flex; gap: 18px; align-items: center; flex-wrap: wrap;">' +
        '<div id="party-qr" style="width: 160px; height: 160px; background: #faf6ec; border-radius: 12px; padding: 8px; display: flex; align-items: center; justify-content: center;"></div>' +
        '<div style="flex: 1; min-width: 200px;">' +
          '<div style="font-size: 13px; color: rgba(242,236,220,0.55);">Geldig tot</div>' +
          '<div style="font-size: 18px; margin-bottom: 10px;">' + esc(tot) + '</div>' +
          '<div style="word-break: break-all; font-size: 13px; color: rgba(242,236,220,0.7);">' + esc(link) + '</div>' +
          '<button class="btn-orange" data-act="copyPartyLink" style="margin-top: 10px;">KOPIEER LINK</button>' +
        '</div>' +
      '</div>'
    : '<div style="font-size: 15px; color: rgba(242,236,220,0.5); padding: 8px 0 16px;">Nog geen actief feest — genereer een QR-code om te beginnen.</div>';

  return '<div class="card">' + top + qrBlock +
    '<button class="btn-dash" data-act="genQr" style="margin-top: 16px;">' +
      (active ? '↻ NIEUW FEEST / NIEUWE QR' : '+ GENEREER QR-CODE') +
    '</button>' +
    '<div class="status" data-status="party" style="margin-top: 8px; min-height: 18px; font-size: 14px; color: #f4a259;"></div>' +
  '</div>';
}

function renderPartyQr() {
  const el = document.getElementById('party-qr');
  if (!el || typeof QRCode === 'undefined') return;
  const link = partyLink(client.get());
  if (!link) return;
  el.innerHTML = '';
  new QRCode(el, { text: link, width: 144, height: 144, correctLevel: QRCode.CorrectLevel.M });
}
```

- [ ] **Step 4: Neem de kaart op in render()**

In `app/public/admin/admin.js`, in `render()`, voeg `cardFeest(d)` toe in de kaart-rij (bijvoorbeeld direct ná `cardEvents(d)`). Was:

```js
      cardTap(d) + cardVoorraad(d) + cardSnacks(d) + cardFotos(d) + cardThema(d) + cardRadio(d) + cardEvents(d) + cardMail() +
```

Wordt:

```js
      cardTap(d) + cardVoorraad(d) + cardSnacks(d) + cardFotos(d) + cardThema(d) + cardRadio(d) + cardEvents(d) + cardFeest(d) + cardMail() +
```

Voeg daarna, direct ná het sluiten van de `cards.innerHTML = ...;`-toewijzing in `render()` (vóór de afsluitende `}` van `render`), toe:

```js
  renderPartyQr();
```

- [ ] **Step 5: Herstel de QR ook na een achtergrond-update**

In `app/public/admin/admin.js`, in `renderPreservingFocus()`, voeg aan het eind van de functie (vóór de afsluitende `}`) toe:

```js
  renderPartyQr();
```

- [ ] **Step 6: Voeg de `genQr`- en `copyPartyLink`-acties toe**

In `app/public/admin/admin.js`, in de `switch`-dispatcher (waar ook `case 'rmPhoto':` staat), voeg vóór de afsluitende `}` van de switch toe:

```js
    case 'genQr': {
      setStatus('party', 'Bezig…');
      try {
        const r = await fetch('/api/party/new', { method: 'POST' });
        if (!r.ok) throw new Error('http ' + r.status);
        setStatus('party', 'Nieuwe QR-code klaar ✓');
        // de nieuwe state komt via SSE binnen en hertekent de kaart + QR
      } catch (e) {
        setStatus('party', 'Genereren mislukt — probeer het opnieuw.');
      }
      break;
    }
    case 'copyPartyLink': {
      const link = partyLink(client.get());
      if (link) { try { await navigator.clipboard.writeText(link); setStatus('party', 'Link gekopieerd ✓'); } catch (e) { setStatus('party', link); } }
      break;
    }
```

> De dispatcher-callback moet `async` zijn om `await` te mogen gebruiken. Controleer de regel waarmee de listener begint (rond `cards.addEventListener('click', ...)`); staat er nog geen `async`, maak er dan `cards.addEventListener('click', async (e) => {` van.

- [ ] **Step 7: Verifieer in de browser**

Start `cd app && node server.js`. Open `http://localhost:8420/admin/`. Scrol naar "FEEST · FOTO'S VAN GASTEN" → klik "GENEREER QR-CODE". Een QR + link + "geldig tot …" verschijnt. Klik "KOPIEER LINK" → status "Link gekopieerd ✓". Scan de QR met je telefoon (zelfde netwerk) → de gast-uploadpagina opent. Stop de server.

- [ ] **Step 8: Commit**

```bash
git add app/public/admin/qrcode.min.js app/public/admin/index.html app/public/admin/admin.js
git commit -m "Gasten-foto's: Feest-kaart in beheer met QR, link en vervaltijd"
```

---

## Task 6: Beheer — gasten-foto-grid met noodrem (admin.js)

**Files:**
- Modify: `app/public/admin/admin.js` (`cardFeest`, `rmPartyPhoto`-actie)

- [ ] **Step 1: Toon de gasten-foto's met een ✕ per foto**

In `app/public/admin/admin.js`, in `cardFeest`, vervang de afsluitende `return`-opbouw zó dat er een thumbnail-grid bij komt. Voeg vlak vóór de `return '<div class="card">' + ...`-regel toe:

```js
  const items = (d.party && d.party.photos) || [];
  const grid = items.length
    ? '<div style="border-top: 1px solid rgba(242,236,220,0.12); margin-top: 16px; padding-top: 14px;">' +
        '<div style="font-size: 13px; color: rgba(242,236,220,0.55); margin-bottom: 8px;">Binnengekomen foto’s — tik ✕ om er één van het bord te halen</div>' +
        '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 8px; max-height: 320px; overflow-y: auto;">' +
          items.map((ph, i) =>
            '<div style="position: relative; aspect-ratio: 1; border-radius: 8px; overflow: hidden; background: #ddd6c6;">' +
              '<img src="' + esc(ph.src) + '" alt="" loading="lazy" style="width: 100%; height: 100%; object-fit: cover;">' +
              (ph.name ? '<div style="position: absolute; left: 0; right: 0; bottom: 0; padding: 3px 6px; font-size: 12px; background: rgba(28,24,18,0.6); color: #f2ecdc; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">' + esc(ph.name) + '</div>' : '') +
              '<button data-act="rmPartyPhoto" data-arg="' + i + '" aria-label="Verwijder foto" style="position: absolute; top: 4px; right: 4px; cursor: pointer; width: 24px; height: 24px; border-radius: 999px; border: none; background: rgba(28,24,18,0.7); color: #f2ecdc; font-size: 12px; line-height: 1;">✕</button>' +
            '</div>').join('') +
        '</div>' +
      '</div>'
    : '';
```

Voeg `grid` toe aan de uiteindelijke `return`, direct vóór de status-`div`. Was:

```js
    '<div class="status" data-status="party" style="margin-top: 8px; min-height: 18px; font-size: 14px; color: #f4a259;"></div>' +
  '</div>';
```

Wordt:

```js
    grid +
    '<div class="status" data-status="party" style="margin-top: 8px; min-height: 18px; font-size: 14px; color: #f4a259;"></div>' +
  '</div>';
```

- [ ] **Step 2: Voeg de `rmPartyPhoto`-actie toe**

In `app/public/admin/admin.js`, in de `switch`-dispatcher (bij de andere `case`-regels), voeg toe:

```js
    case 'rmPartyPhoto': mut((d) => { d.party.photos.splice(i, 1); }, true); break;
```

(`i` is in de dispatcher al beschikbaar als `Number(data-arg)`, net als bij `rmPhoto`.)

- [ ] **Step 3: Verifieer in de browser**

Start `cd app && node server.js`. Open admin, genereer een QR, upload via je telefoon 2 foto's. Het grid in de Feest-kaart toont ze met naam. Klik op een ✕ → de foto verdwijnt uit het grid (en straks van het bord). Stop de server.

- [ ] **Step 4: Commit**

```bash
git add app/public/admin/admin.js
git commit -m "Gasten-foto's: noodrem-grid in de Feest-kaart"
```

---

## Task 7: Bord — view "Foto's van het feest" (tv.js)

**Files:**
- Modify: `app/public/tv/tv.js` (`polaroidHtml` refactor + `partyPolaroidHtml`, `midViewsFor`, `midSlotHtml`, `panelsFor`, `mainPanelHtml`, `applyParty` + interval)

- [ ] **Step 1: Splits de polaroid-opmaak af zodat de gasten-view 'm hergebruikt**

In `app/public/tv/tv.js`, vervang de hele functie `polaroidHtml` (regel ~381-413, t/m de afsluitende `}`) door onderstaande twee functies. De opmaak is identiek aan het origineel; alleen de `data-…`-attributen worden geparametriseerd via `ns` (`'photo'` of `'party'`):

```js
function polaroidShellHtml(src, caption, dots, raster, ns) {
  if (raster) {
    return '<div style="width: 100%; height: 100%; min-height: 0; background: #faf6ec; padding: 16px 16px 64px; box-sizing: border-box; transform: rotate(-1.2deg); box-shadow: 0 10px 30px rgba(0,0,0,0.4); display: flex; flex-direction: column; position: relative;">' +
      '<div style="flex: 1; min-height: 0; overflow: hidden; position: relative; background: #ddd6c6;">' +
        '<img data-' + ns + '-img src="' + esc(src) + '" alt="" style="position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; animation: defles-fade 0.9s ease;">' +
      '</div>' +
      '<div style="position: absolute; left: 22px; right: 22px; bottom: 10px; display: flex; align-items: center; justify-content: space-between; gap: 16px;">' +
        '<div data-' + ns + '-caption style="font-family: \'Shadows Into Light Two\', cursive; font-size: 27px; color: #4a4337; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">' + esc(caption) + '</div>' +
        '<div data-' + ns + '-dots>' + dots + '</div>' +
      '</div>' +
      '<div style="position: absolute; top: -12px; left: 50%; transform: translateX(-50%) rotate(2deg); width: 120px; height: 28px; background: rgba(242,236,220,0.45); box-shadow: 0 1px 3px rgba(0,0,0,0.15);"></div>' +
    '</div>';
  }
  return '<div style="height: 100%; aspect-ratio: 3 / 2.15; max-width: 100%; background: #faf6ec; padding: 14px 14px 56px; box-sizing: border-box; transform: rotate(-1deg); box-shadow: 0 12px 36px rgba(0,0,0,0.45); position: relative;">' +
    '<div style="width: 100%; height: 100%; overflow: hidden; position: relative; background: #ddd6c6;">' +
      '<img data-' + ns + '-img src="' + esc(src) + '" alt="" style="position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover;">' +
    '</div>' +
    '<div style="position: absolute; left: 20px; right: 20px; bottom: 8px; display: flex; align-items: center; justify-content: space-between; gap: 16px;">' +
      '<div data-' + ns + '-caption style="font-family: \'Shadows Into Light Two\', cursive; font-size: 26px; color: #4a4337; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">' + esc(caption) + '</div>' +
      '<div data-' + ns + '-dots>' + dots + '</div>' +
    '</div>' +
    '<div style="position: absolute; top: -12px; left: 50%; transform: translateX(-50%) rotate(2deg); width: 110px; height: 26px; background: rgba(242,236,220,0.5); box-shadow: 0 1px 3px rgba(0,0,0,0.15);"></div>' +
  '</div>';
}

function polaroidHtml(d, raster) {
  const photos = d.photos || [];
  if (!photos.length) {
    return '<div style="width: 100%; height: 100%; border: 3px dashed rgba(242,236,220,0.3); border-radius: 12px; display: flex; align-items: center; justify-content: center; box-sizing: border-box;">' +
      '<div style="font-family: \'Shadows Into Light Two\', cursive; font-size: 32px; color: rgba(242,236,220,0.55);">Nog geen foto’s — voeg ze toe via het beheerscherm</div></div>';
  }
  const p = photos[mod(app.photoIdx, photos.length)];
  const dots = dotsHtml(photos.length, mod(app.photoIdx, photos.length), 'light');
  return polaroidShellHtml(p.src, p.caption || '', dots, raster, 'photo');
}

function partyPhotos(d) {
  return ((d.party && d.party.photos) || []).slice(-40);
}

function partyPolaroidHtml(d, raster) {
  const photos = partyPhotos(d);
  if (!photos.length) return '';
  const p = photos[mod(app.photoIdx, photos.length)];
  const caption = p.name ? '— ' + p.name : '';
  const dots = dotsHtml(photos.length, mod(app.photoIdx, photos.length), 'light');
  return polaroidShellHtml(p.src, caption, dots, raster, 'party');
}
```

- [ ] **Step 2: Voeg 'party' toe aan de raster-middenviews**

In `app/public/tv/tv.js`, in `midViewsFor`, voeg de party-view toe. Was:

```js
function midViewsFor(d, now) {
  const views = [];
  if ((d.photos || []).length > 0) views.push('photos');
  if (d.theme && d.theme.enabled && deriveWkAll(d, now).next) views.push('wk');
  if (radioOn(d)) views.push('radio');
  return views;
}
```

Wordt (party direct ná photos):

```js
function midViewsFor(d, now) {
  const views = [];
  if ((d.photos || []).length > 0) views.push('photos');
  if (partyPhotos(d).length > 0) views.push('party');
  if (d.theme && d.theme.enabled && deriveWkAll(d, now).next) views.push('wk');
  if (radioOn(d)) views.push('radio');
  return views;
}
```

- [ ] **Step 3: Render de party-view in het raster-middenvlak**

In `app/public/tv/tv.js`, in `midSlotHtml`, voeg de party-tak toe vóór de slot-`return polaroidHtml(d, true);`. Was:

```js
  const active = views[mod(app.middenIdx, views.length)];
  if (active === 'wk') return wkPosterHtml(d, now);
  if (active === 'radio') return radioPosterHtml(d);
  return polaroidHtml(d, true);
```

Wordt:

```js
  const active = views[mod(app.middenIdx, views.length)];
  if (active === 'wk') return wkPosterHtml(d, now);
  if (active === 'radio') return radioPosterHtml(d);
  if (active === 'party') return partyPolaroidHtml(d, true);
  return polaroidHtml(d, true);
```

- [ ] **Step 4: Voeg 'party' toe aan de roterende panels**

In `app/public/tv/tv.js`, in `panelsFor`, voeg de party-panel toe. Was:

```js
function panelsFor(d) {
  const panels = [];
  if ((d.photos || []).length > 0) panels.push('photos');
  panels.push('tap');
  if (d.theme && d.theme.enabled) panels.push('theme');
  if ((d.stock || []).length > 0) panels.push('stock');
  if (radioOn(d)) panels.push('radio');
  return panels;
}
```

Wordt (party direct ná photos):

```js
function panelsFor(d) {
  const panels = [];
  if ((d.photos || []).length > 0) panels.push('photos');
  if (partyPhotos(d).length > 0) panels.push('party');
  panels.push('tap');
  if (d.theme && d.theme.enabled) panels.push('theme');
  if ((d.stock || []).length > 0) panels.push('stock');
  if (radioOn(d)) panels.push('radio');
  return panels;
}
```

- [ ] **Step 5: Render de party-view als roterend hoofdpaneel**

In `app/public/tv/tv.js`, in `mainPanelHtml`, voeg direct ná het `if (panel === 'photos') { ... }`-blok toe:

```js
  if (panel === 'party') {
    return '<div style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: 30px; animation: defles-fade 0.7s ease;">' +
      partyPolaroidHtml(d, false) + '</div>';
  }
```

- [ ] **Step 6: Laat de party-foto's mee doorrollen (in-place update)**

In `app/public/tv/tv.js`, direct ná de functie `applyPhoto` (rond regel 718), voeg toe:

```js
function applyParty() {
  const d = app.data;
  const photos = partyPhotos(d || {});
  if (!photos.length) return;
  const p = photos[mod(app.photoIdx, photos.length)];
  const img = board.querySelector('[data-party-img]');
  if (img) {
    img.src = p.src;
    img.style.animation = 'none';
    void img.offsetWidth;
    img.style.animation = 'defles-fade 0.9s ease';
  }
  setText('[data-party-caption]', p.name ? '— ' + p.name : '');
  const dots = board.querySelector('[data-party-dots]');
  if (dots) dots.innerHTML = dotsHtml(photos.length, mod(app.photoIdx, photos.length), 'light');
}
```

Voeg in `app/public/tv/tv.js` de aanroep toe in het bestaande 9000ms-interval. Was:

```js
  setInterval(() => {
    const d = app.data;
    if (!d || (d.photos || []).length === 0) return;
    app.photoIdx++;
    applyPhoto();
  }, 9000);
```

Wordt:

```js
  setInterval(() => {
    const d = app.data;
    const hasParty = d && partyPhotos(d).length > 0;
    if (!d || ((d.photos || []).length === 0 && !hasParty)) return;
    app.photoIdx++;
    applyPhoto();
    applyParty();
  }, 9000);
```

- [ ] **Step 7: Verifieer op het bord**

Start `cd app && node server.js`. Open `http://localhost:8420/tv/`. Genereer via het beheer een QR en upload 2-3 foto's met namen. Het bord toont nu een polaroid-view "Foto's van het feest" (met "— Naam") die naast je eigen foto's meedraait, en die elke 9 s wisselt. Test beide standen: zet in het beheer onder "SCHERM" de variant op **raster** én op **roterend**; in beide gevallen verschijnt de gasten-view. Stop de server.

- [ ] **Step 8: Commit**

```bash
git add app/public/tv/tv.js
git commit -m "Gasten-foto's: 'Foto's van het feest'-view op het bord (raster + roterend)"
```

---

## Task 8: End-to-end-verificatie + documentatie

**Files:**
- Modify: `README.md` (korte uitleg van de feest-foto's)

- [ ] **Step 1: Draai de unit-tests**

Run: `cd app && node --test`
Expected: alle tests in `test/party.test.js` PASS.

- [ ] **Step 2: Volledige doorloop met een korte vervaltijd**

Verlooptest zonder 24 u te wachten: pas in `app/server.js` tijdelijk `24 * 60 * 60 * 1000` aan naar `15 * 1000` (15 s). Start de server, genereer een QR, upload een foto (lukt), wacht 15 s, herlaad de gast-pagina → "Deze link is verlopen", en een upload-poging geeft 410. **Zet de waarde daarna terug op `24 * 60 * 60 * 1000`** en commit niets van deze tijdelijke wijziging.

- [ ] **Step 3: Bevestig dat foto's bewaard blijven**

Met de server gestopt: tel de bestanden in `app/data/photos/`. Upload meer dan 40 gasten-foto's (of zet tijdelijk `.slice(-40)` op `.slice(-2)` in `tv.js` om te zien dat oudere uit de wéérgave vallen) en bevestig dat het bestandsaantal in `app/data/photos/` niet daalt — de bestanden blijven staan, alleen de rotatie toont de laatste N. Zet `tv.js` daarna terug op `.slice(-40)`.

- [ ] **Step 4: Documenteer kort in de README**

Voeg in `README.md` een korte alinea toe onder de bestaande functiebeschrijvingen:

```markdown
### Foto's van gasten (QR)

In het beheerscherm onder **FEEST · FOTO'S VAN GASTEN** genereer je een QR-code.
Gasten scannen die, kiezen op hun telefoon een foto + naam, en die verschijnt
live op het bord in de view "Foto's van het feest". De QR-link verloopt 24 uur
na het genereren; geüploade foto's blijven bewaard in `data/photos/`. Met de ✕
naast een foto haal je 'm direct van het bord.
```

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "Gasten-foto's: korte uitleg in de README"
```

---

## Zelfreview (uitgevoerd bij het schrijven)

- **Spec-dekking:** QR→pagina (Task 4), live op bord (Task 7), noodrem (Task 6), aparte pool + eigen blok (Task 1/7), foto+naam (Task 4/6/7), laatste 40 in weergave (Task 7 `slice(-40)`), bewaren via niet-krimpende lijst + prune-fix (Task 1/2), token-verloop 24 u via "nieuw feest" (Task 3/5), admin-album/noodrem (Task 6), verificatie incl. smoke-test (Task 1 `node:test` + Task 8). Alles gedekt.
- **Type-consistentie:** `partyLinkStatus(party, token, now)`, `usedPhotoNames(state)`, `state.party.photos[] = {id, src, name, ts}`, attribuut-namespaces `photo`/`party` — overal gelijk gebruikt in server, admin en tv.
- **Geen placeholders:** elke code-stap bevat de volledige, plak-klare code; de QR-lib wordt via een exacte, gepinde `curl` gevendord.
