# Avond-album — Implementatieplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Na een avond een album van de gasten-foto's maken dat deelnemers achteraf ophalen via een QR op het bord (en optioneel een mail), met download-alles als zip.

**Architecture:** Additief bovenop de gasten-foto-feature. Eén admin-actie bevriest `state.party.photos` tot een `state.albums[]`-entry en reset de pool. Album-retrieval via token-afgeschermde publieke endpoints; QR server-side als SVG (geen QR-JS op het bord). Zip via een eigen dependency-vrije store-only writer.

**Tech Stack:** Node ≥18 ES-modules (geen runtime-deps), `node:test`, één gevendorde QR-encoder (`qrcode-generator`, MIT) server-side via `createRequire`, vanilla browser-JS.

**Spec:** `docs/superpowers/specs/2026-06-14-avond-album-design.md`

---

## Bestandsoverzicht

| Bestand | Verantwoordelijkheid |
|---------|----------------------|
| `app/public/defles-data.js` | `DEFAULT_STATE.albums` + helpers `albumByToken`/`albumStatus`/`freshAlbum`; `usedPhotoNames` telt albums mee |
| `app/zip.js` | `crc32` + `zipStore` (store-only ZIP, dependency-vrij) |
| `app/vendor/qrcode-generator.js` | Gevendorde QR-encoder (server-side SVG) |
| `app/Dockerfile` | Kopieert óók `zip.js` + `vendor/` naar het image |
| `app/server.js` | `POST /api/party/close`, album-endpoints (meta/zip/qr.svg), allowlist, imports |
| `app/public/album/index.html` | Album-galerijpagina (download-alles + per foto) |
| `app/public/admin/admin.js` | Afsluit-knop + event-select + albumlijst in `cardFeest` |
| `app/public/tv/tv.js` | `albumqr`-bord-view |
| `app/test/*.test.js` | Unit-tests (album-helpers, zip) |

**Buiten scope:** repo-root standalone-artefacten (`defles-data.js`, `*.dc.html`).

---

## Task 1: Album-state + helpers (defles-data.js)

**Files:**
- Modify: `app/public/defles-data.js`
- Modify: `app/test/party.test.js` (usedPhotoNames-test uitbreiden)
- Test: `app/test/album.test.js`

- [ ] **Step 1: Schrijf de falende tests**

Maak `app/test/album.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_STATE, albumByToken, albumStatus, freshAlbum } from '../public/defles-data.js';

const mk = (over) => Object.assign({ id: 'a', token: 't', title: 'x', whenISO: '', createdAt: 1000, expiresAt: 5000, eventId: '', photos: [] }, over);

test('DEFAULT_STATE.albums is een lege lijst', () => {
  assert.deepEqual(DEFAULT_STATE.albums, []);
});

test('albumByToken vindt op token, anders null', () => {
  const albums = [mk({ token: 'aaa' }), mk({ token: 'bbb' })];
  assert.equal(albumByToken(albums, 'bbb').token, 'bbb');
  assert.equal(albumByToken(albums, 'zzz'), null);
  assert.equal(albumByToken(albums, ''), null);
  assert.equal(albumByToken(undefined, 'aaa'), null);
});

test('albumStatus: ok vóór verval, expired erna, unknown bij null', () => {
  const al = mk({ expiresAt: 5000 });
  assert.equal(albumStatus(al, 4999), 'ok');
  assert.equal(albumStatus(al, 5000), 'expired');
  assert.equal(albumStatus(al, 6000), 'expired');
  assert.equal(albumStatus(null, 1), 'unknown');
});

test('freshAlbum: nieuwste binnen het venster én niet verlopen', () => {
  const albums = [
    mk({ id: 'oud', createdAt: 1000, expiresAt: 9_999_999 }),
    mk({ id: 'nieuw', createdAt: 4000, expiresAt: 9_999_999 })
  ];
  // now=5000, venster=2000 -> alleen 'nieuw' valt binnen 5000-4000<2000
  assert.equal(freshAlbum(albums, 5000, 2000).id, 'nieuw');
  // now=8000, venster=2000 -> niets vers meer
  assert.equal(freshAlbum(albums, 8000, 2000), null);
  // verlopen album telt niet als vers
  assert.equal(freshAlbum([mk({ createdAt: 4000, expiresAt: 4500 })], 5000, 2000), null);
  assert.equal(freshAlbum([], 5000, 2000), null);
});
```

Voeg aan `app/test/party.test.js` een album-tak toe aan de bestaande `usedPhotoNames`-test "verzamelt curated én party-foto-bestandsnamen" — vervang die test door:

```js
test('usedPhotoNames verzamelt curated, party én album-foto-bestandsnamen', () => {
  const state = {
    photos: [{ src: '/photos/aaa.jpg' }, { src: 'https://picsum.photos/x' }],
    party: { photos: [{ src: '/photos/bbb.webp' }] },
    albums: [{ photos: [{ src: '/photos/ccc.png' }, { src: '/photos/ddd.jpg' }] }]
  };
  const names = usedPhotoNames(state);
  assert.ok(names.has('aaa.jpg'));
  assert.ok(names.has('bbb.webp'));
  assert.ok(names.has('ccc.png'));
  assert.ok(names.has('ddd.jpg'));
  assert.equal(names.has('x'), false);
  assert.equal(names.size, 4);
});
```

- [ ] **Step 2: Draai de tests — moeten falen**

Run: `cd app && node --test test/album.test.js test/party.test.js`
Expected: FAIL — `albums`/helpers bestaan nog niet; de uitgebreide usedPhotoNames-test vindt `ddd.jpg` niet.

- [ ] **Step 3: Voeg `albums` toe aan DEFAULT_STATE**

In `app/public/defles-data.js`, direct ná de `party: { ... }`-regel in `DEFAULT_STATE`, voeg toe:

```js
  albums: []
```

Zorg dat `party`-regel eindigt op een komma en de nieuwe regel de laatste key wordt:

```js
  party: { token: null, expiresAt: 0, photos: [] },
  albums: []
};
```

- [ ] **Step 4: Voeg de helpers toe en breid usedPhotoNames uit**

In `app/public/defles-data.js`, ná de bestaande `export function usedPhotoNames(state) { ... }`, voeg toe:

```js
// Album opzoeken op publieke token.
export function albumByToken(albums, token) {
  if (!token) return null;
  return (albums || []).find((a) => a && a.token === token) || null;
}

// Status van een album-link: 'ok' (vóór verval), 'expired', of 'unknown' (geen album).
export function albumStatus(album, now) {
  if (!album) return 'unknown';
  if (!album.expiresAt || now >= album.expiresAt) return 'expired';
  return 'ok';
}

// Het meest recente album dat nog "vers" is (binnen windowMs ná createdAt) én niet
// verlopen — gebruikt door het bord voor de "Foto's van vanavond"-QR.
export function freshAlbum(albums, now, windowMs) {
  let best = null;
  for (const a of (albums || [])) {
    if (!a || !a.createdAt) continue;
    if (now - a.createdAt >= windowMs) continue;
    if (!a.expiresAt || now >= a.expiresAt) continue;
    if (!best || a.createdAt > best.createdAt) best = a;
  }
  return best;
}
```

Wijzig `usedPhotoNames` zodat het óók album-foto's meetelt. De huidige functie eindigt met twee `for`-loops vóór `return names;`. Voeg er een derde aan toe:

```js
  for (const al of (state && state.albums) || []) {
    for (const ph of (al && al.photos) || []) add(ph && ph.src);
  }
```

Plaats die direct vóór `return names;`.

- [ ] **Step 5: Draai de tests — moeten slagen**

Run: `cd app && node --test test/album.test.js test/party.test.js`
Expected: PASS — alle album-tests + de uitgebreide usedPhotoNames-test groen.

- [ ] **Step 6: Commit**

```bash
git add app/public/defles-data.js app/test/album.test.js app/test/party.test.js
git commit -m "Avond-album: albums-state + helpers (albumByToken/albumStatus/freshAlbum)"
```

---

## Task 2: Mini-ZIP-writer (app/zip.js)

**Files:**
- Create: `app/zip.js`
- Test: `app/test/zip.test.js`

- [ ] **Step 1: Schrijf de falende test**

Maak `app/test/zip.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crc32, zipStore } from '../zip.js';

test('crc32 tegen de bekende vector', () => {
  assert.equal(crc32(Buffer.from('123456789')), 0xCBF43926);
});

test('crc32 van lege buffer is 0', () => {
  assert.equal(crc32(Buffer.alloc(0)), 0);
});

test('zipStore bouwt een geldige store-only zip', () => {
  const files = [
    { name: 'een.txt', data: Buffer.from('hallo') },
    { name: 'twee.bin', data: Buffer.from([1, 2, 3, 4]) }
  ];
  const zip = zipStore(files);
  // local file header signature aan het begin
  assert.equal(zip.readUInt32LE(0), 0x04034b50);
  // end-of-central-directory: laatste 22 bytes, signature + entry-count
  const eocd = zip.length - 22;
  assert.equal(zip.readUInt32LE(eocd), 0x06054b50);
  assert.equal(zip.readUInt16LE(eocd + 10), 2); // totaal aantal entries
  // beide bestandsnamen komen voor in de zip-bytes
  assert.ok(zip.includes(Buffer.from('een.txt')));
  assert.ok(zip.includes(Buffer.from('twee.bin')));
  // de data zit erin
  assert.ok(zip.includes(Buffer.from('hallo')));
});

test('zipStore met nul bestanden geeft alleen een EOCD', () => {
  const zip = zipStore([]);
  assert.equal(zip.length, 22);
  assert.equal(zip.readUInt32LE(0), 0x06054b50);
  assert.equal(zip.readUInt16LE(10), 0);
});
```

- [ ] **Step 2: Draai de test — moet falen**

Run: `cd app && node --test test/zip.test.js`
Expected: FAIL — `../zip.js` bestaat nog niet.

- [ ] **Step 3: Schrijf `app/zip.js`**

```js
// Dependency-vrije ZIP-writer (alleen "store", geen compressie — de JPEG's zijn
// al klein). Node ≥18 heeft geen ingebouwde zip-schrijver en geen zlib.crc32,
// dus CRC-32 zit hieronder met een eigen lookup-tabel.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// files: [{ name: string, data: Buffer }] -> één Buffer met de complete zip.
export function zipStore(files) {
  const parts = [];
  const central = [];
  let offset = 0;

  for (const f of files) {
    const nameBuf = Buffer.from(f.name, 'utf8');
    const data = f.data;
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);      // local file header signature
    local.writeUInt16LE(20, 4);              // version needed
    local.writeUInt16LE(0x0800, 6);          // flags: bit 11 = UTF-8 naam
    local.writeUInt16LE(0, 8);               // method: store
    local.writeUInt16LE(0, 10);              // mod time
    local.writeUInt16LE(0, 12);              // mod date
    local.writeUInt32LE(crc, 14);            // crc-32
    local.writeUInt32LE(data.length, 18);    // compressed size
    local.writeUInt32LE(data.length, 22);    // uncompressed size
    local.writeUInt16LE(nameBuf.length, 26); // naamlengte
    local.writeUInt16LE(0, 28);              // extra length
    parts.push(local, nameBuf, data);

    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);        // central directory header signature
    cen.writeUInt16LE(20, 4);                // version made by
    cen.writeUInt16LE(20, 6);                // version needed
    cen.writeUInt16LE(0x0800, 8);            // flags
    cen.writeUInt16LE(0, 10);                // method
    cen.writeUInt16LE(0, 12);                // mod time
    cen.writeUInt16LE(0, 14);                // mod date
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(data.length, 20);
    cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(nameBuf.length, 28);
    cen.writeUInt16LE(0, 30);                // extra length
    cen.writeUInt16LE(0, 32);                // comment length
    cen.writeUInt16LE(0, 34);                // disk number
    cen.writeUInt16LE(0, 36);                // internal attrs
    cen.writeUInt32LE(0, 38);                // external attrs
    cen.writeUInt32LE(offset, 42);           // offset local header
    central.push(cen, nameBuf);

    offset += local.length + nameBuf.length + data.length;
  }

  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);          // end of central directory signature
  end.writeUInt16LE(0, 4);                   // disk nr
  end.writeUInt16LE(0, 6);                   // disk met central dir
  end.writeUInt16LE(files.length, 8);        // entries op deze disk
  end.writeUInt16LE(files.length, 10);       // totaal entries
  end.writeUInt32LE(centralBuf.length, 12);  // central dir grootte
  end.writeUInt32LE(offset, 16);             // central dir offset
  end.writeUInt16LE(0, 20);                  // comment length

  return Buffer.concat([...parts, centralBuf, end]);
}
```

- [ ] **Step 4: Draai de test — moet slagen**

Run: `cd app && node --test test/zip.test.js`
Expected: PASS — 4 tests groen.

- [ ] **Step 5: Extra echtheidscheck met systeem-unzip (best effort)**

Run:
```bash
cd app && node --input-type=module -e "
import { zipStore } from './zip.js';
import { writeFileSync } from 'node:fs';
writeFileSync('/tmp/defles-ziptest.zip', zipStore([{name:'a.txt',data:Buffer.from('hoi')},{name:'b.txt',data:Buffer.from('daar')}]));
" && unzip -l /tmp/defles-ziptest.zip && rm -f /tmp/defles-ziptest.zip
```
Expected: `unzip -l` toont `a.txt` en `b.txt` zonder fouten. (Is `unzip` afwezig, sla deze stap over — de unit-test dekt de structuur.)

- [ ] **Step 6: Commit**

```bash
git add app/zip.js app/test/zip.test.js
git commit -m "Avond-album: dependency-vrije store-only ZIP-writer met CRC-32"
```

---

## Task 3: QR-encoder vendoren + Dockerfile bijwerken

**Files:**
- Create: `app/vendor/qrcode-generator.js`
- Modify: `app/Dockerfile`

- [ ] **Step 1: Vendor de QR-encoder**

Run (internet nodig; bestand wordt gecommit zodat het offline werkt):

```bash
mkdir -p app/vendor
curl -fsSL https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js -o app/vendor/qrcode-generator.js
test -s app/vendor/qrcode-generator.js && echo "qrcode-generator gevendord"
```
Expected: "qrcode-generator gevendord". Faalt de curl, STOP en rapporteer BLOCKED.

- [ ] **Step 2: Verifieer dat de encoder in Node een SVG levert**

Run:
```bash
cd app && node --input-type=commonjs -e "
const qrcode = require('./vendor/qrcode-generator.js');
const qr = qrcode(0, 'M'); qr.addData('https://voorbeeld.nl/album/abc'); qr.make();
const svg = qr.createSvgTag({ cellSize: 4, margin: 2 });
if (typeof svg === 'string' && svg.includes('<svg')) console.log('SVG ok'); else { console.error('GEEN SVG'); process.exit(1); }
"
```
Expected: `SVG ok`.

- [ ] **Step 3: Werk de Dockerfile bij zodat `zip.js` en `vendor/` mee het image in gaan**

In `app/Dockerfile` staat nu:

```dockerfile
COPY package.json server.js ./
COPY public ./public
```

Vervang die twee regels door:

```dockerfile
COPY package.json server.js zip.js ./
COPY vendor ./vendor
COPY public ./public
```

(Zonder deze wijziging crasht de container in productie op het importeren van `./zip.js` en `./vendor/qrcode-generator.js`.)

- [ ] **Step 4: Commit**

```bash
git add app/vendor/qrcode-generator.js app/Dockerfile
git commit -m "Avond-album: QR-encoder vendoren + Dockerfile kopieert zip.js en vendor/"
```

---

## Task 4: Server — afsluiten + album-endpoints (server.js)

**Files:**
- Modify: `app/server.js`

- [ ] **Step 1: Voeg de imports toe**

In `app/server.js`, breid de bestaande import uit `./public/defles-data.js` uit met de drie album-helpers. De regel is nu:

```js
import { DEFAULT_STATE, deepMerge, uid, token as makeToken, partyLinkStatus, usedPhotoNames } from './public/defles-data.js';
```

Wordt:

```js
import { DEFAULT_STATE, deepMerge, uid, token as makeToken, partyLinkStatus, usedPhotoNames, albumByToken, albumStatus } from './public/defles-data.js';
```

Voeg daarná (bij de andere imports bovenin) toe:

```js
import { createRequire } from 'node:module';
import { zipStore } from './zip.js';
const require = createRequire(import.meta.url);
const qrcode = require('./vendor/qrcode-generator.js');
```

Voeg bij de constanten bovenin (bv. naast `PORT`) toe:

```js
const ALBUM_TTL_MS = 30 * 24 * 60 * 60 * 1000; // album-link 30 dagen geldig
```

- [ ] **Step 2: Zet album-paden op de publieke-host-allowlist**

In `app/server.js`, in het "Publieke-host-afscherming"-blok, breid de `allowed`-regel uit. Hij is nu:

```js
      const allowed = p === '/welcome.html' || p === '/e' || p.startsWith('/e/') || p.startsWith('/api/rsvp/') || p === '/api/rsvp'
        || p === '/foto' || p.startsWith('/foto/')
        || (p.startsWith('/api/party/') && p !== '/api/party/new');
```

Wordt:

```js
      const allowed = p === '/welcome.html' || p === '/e' || p.startsWith('/e/') || p.startsWith('/api/rsvp/') || p === '/api/rsvp'
        || p === '/foto' || p.startsWith('/foto/')
        || (p.startsWith('/api/party/') && p !== '/api/party/new' && p !== '/api/party/close')
        || p === '/album' || p.startsWith('/album/') || p.startsWith('/api/album/');
```

(Zo blijven `/api/party/new` én `/api/party/close` beheer-only, en zijn de album-routes publiek.)

- [ ] **Step 3: Voeg het afsluit- en album-routeblok toe**

In `app/server.js`, direct vóór het bestaande party-routeblok (de regel met de comment `// ---- PUBLIEK + token-afgeschermd: gasten-foto's ----`), voeg toe:

```js
    // ---- Avond afsluiten: party-pool -> album, daarna pool leeg ----
    if (p === '/api/party/close' && req.method === 'POST') {
      if (!state.party || !(state.party.photos || []).length) {
        return sendJson(res, 400, { error: 'geen foto’s om in een album te zetten' });
      }
      let body = {};
      try { body = JSON.parse((await readBody(req, 16 * 1024)).toString('utf8')); } catch (e) { /* leeg = geen koppeling */ }
      const eventId = String(body.eventId || '').trim();
      const ev = eventId ? (state.events || []).find((e) => e.id === eventId) : null;
      const now = Date.now();
      const album = {
        id: uid(),
        token: makeToken(),
        title: ev ? ev.title : ('De Fles — ' + new Date(now).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })),
        whenISO: (ev && ev.whenISO) ? ev.whenISO : new Date(now).toISOString().slice(0, 16),
        createdAt: now,
        expiresAt: now + ALBUM_TTL_MS,
        eventId: ev ? ev.id : '',
        photos: state.party.photos.slice()
      };
      state.albums = state.albums || [];
      state.albums.push(album);
      state.party = { token: null, expiresAt: 0, photos: [] };
      schedulePersist();
      broadcast('');

      let emailed = 0;
      const cfg = loadMail();
      const base = (cfg.publicBase || '').replace(/\/+$/, '');
      if (ev && cfg.host && cfg.from && base) {
        const link = base + '/album/' + album.token;
        const tot = new Date(album.expiresAt).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
        const seen = new Set();
        for (const r of (ev.rsvps || [])) {
          const to = String(r.email || '').trim();
          if (!to || seen.has(to.toLowerCase())) continue;
          seen.add(to.toLowerCase());
          try {
            await sendMail(cfg, { to, subject: 'Foto’s van ' + album.title, text: 'Hoi' + (r.name ? ' ' + r.name : '') + '!\n\nDe foto’s van ' + album.title + ' staan klaar. Bekijk en bewaar ze hier:\n\n' + link + '\n\n(De link werkt tot ' + tot + '.)\n\nGroet — De Fles' });
            emailed++;
          } catch (e) { /* best effort per adres */ }
        }
      }

      const ownBase = (req.headers.host ? 'http://' + req.headers.host : '').replace(/\/+$/, '');
      return sendJson(res, 200, { id: album.id, token: album.token, title: album.title, expiresAt: album.expiresAt, url: ownBase + '/album/' + album.token, emailed });
    }

    // ---- Album-pagina (statisch) ----
    if (p === '/album' || p.startsWith('/album/')) {
      return serveFile(res, path.join(PUBLIC_DIR, 'album', 'index.html'));
    }

    // ---- Publieke album-API: meta / qr.svg / zip ----
    if (p.startsWith('/api/album/')) {
      const rest = p.slice('/api/album/'.length);   // "<token>" | "<token>/zip" | "<token>/qr.svg"
      let tok = rest, kind = 'meta';
      if (rest.endsWith('/zip')) { tok = rest.slice(0, -'/zip'.length); kind = 'zip'; }
      else if (rest.endsWith('/qr.svg')) { tok = rest.slice(0, -'/qr.svg'.length); kind = 'qr'; }
      tok = decodeURIComponent(tok);
      const album = albumByToken(state.albums, tok);
      if (albumStatus(album, Date.now()) !== 'ok') return sendJson(res, 410, { error: 'verlopen' });

      if (kind === 'meta' && req.method === 'GET') {
        return sendJson(res, 200, {
          title: album.title, whenISO: album.whenISO, expiresAt: album.expiresAt,
          photos: album.photos.map((ph) => ({ src: ph.src, name: ph.name || '' }))
        });
      }

      if (kind === 'qr' && req.method === 'GET') {
        const base = (loadMail().publicBase || '').replace(/\/+$/, '') || (req.headers.host ? 'http://' + req.headers.host : '');
        const qr = qrcode(0, 'M');
        qr.addData(base + '/album/' + album.token);
        qr.make();
        const svg = qr.createSvgTag({ cellSize: 4, margin: 2 });
        res.writeHead(200, { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': '*' });
        return res.end(svg);
      }

      if (kind === 'zip' && req.method === 'GET') {
        const files = [];
        for (let i = 0; i < album.photos.length; i++) {
          const ph = album.photos[i];
          if (!(ph.src || '').startsWith('/photos/')) continue;
          const fname = path.basename(ph.src);
          try {
            const data = await fsp.readFile(path.join(PHOTO_DIR, fname));
            const ext = path.extname(fname) || '.jpg';
            const who = (ph.name || '').replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 30);
            const nice = String(i + 1).padStart(3, '0') + (who ? '-' + who : '') + ext;
            files.push({ name: nice, data });
          } catch (e) { /* ontbrekend bestand overslaan */ }
        }
        const zip = zipStore(files);
        const dlname = 'de-fles-' + String(album.whenISO || '').slice(0, 10) + '.zip';
        res.writeHead(200, {
          'Content-Type': 'application/zip',
          'Content-Disposition': 'attachment; filename="' + dlname + '"',
          'Content-Length': zip.length,
          'Access-Control-Allow-Origin': '*'
        });
        return res.end(zip);
      }
    }

```

(`loadMail`, `sendMail`, `serveFile`, `readBody`, `fsp`, `PHOTO_DIR`, `PUBLIC_DIR`, `schedulePersist`, `broadcast` bestaan al in `server.js`. `prunePhotos` gebruikt al `usedPhotoNames`, dat nu albums meetelt — geen wijziging nodig daar.)

- [ ] **Step 4: Smoke-test met curl**

Start in een aparte shell: `cd app && PORT=8499 node server.js`. Dan:

```bash
# Een party-foto klaarzetten en de avond afsluiten:
curl -s -X POST http://localhost:8499/api/party/new   # mint token <T>
curl -s -X POST http://localhost:8499/api/party/<T>/photo -H 'Content-Type: application/json' \
  -d '{"dataUrl":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC","name":"Test"}'
curl -s -X POST http://localhost:8499/api/party/close -H 'Content-Type: application/json' -d '{}'
# -> {"id":...,"token":"<A>","title":"De Fles — ...","url":".../album/<A>","emailed":0}
curl -s http://localhost:8499/api/album/<A> | head -c 200          # meta + photos
curl -s http://localhost:8499/api/album/<A>/qr.svg | head -c 40     # <svg ...
curl -s http://localhost:8499/api/album/<A>/zip -o /tmp/a.zip && unzip -l /tmp/a.zip && rm -f /tmp/a.zip
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8499/api/album/onbekend   # 410
# party is gereset:
curl -s http://localhost:8499/api/state | grep -o '"party":{[^}]*}'   # photos leeg, token null
```
Expected: close geeft een album-token; meta toont de foto; qr.svg begint met `<svg`; de zip bevat één bestand; onbekend album → 410; party is leeg. Stop de server en ruim test-PNG's in het gitignored `app/data/` op.

- [ ] **Step 5: Commit**

```bash
git add app/server.js
git commit -m "Avond-album: /api/party/close + album-endpoints (meta/qr.svg/zip) + allowlist"
```

---

## Task 5: Album-galerijpagina (app/public/album/index.html)

**Files:**
- Create: `app/public/album/index.html`

- [ ] **Step 1: Maak de pagina**

Maak `app/public/album/index.html`:

```html
<!doctype html>
<html lang="nl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>Foto's van de avond — De Fles</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100dvh; background: #1c1812; color: #f2ecdc;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; }
    .wrap { max-width: 1000px; margin: 0 auto; }
    header { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 18px; }
    h1 { font-size: 28px; margin: 0; }
    .sub { color: rgba(242,236,220,0.6); font-size: 15px; margin-top: 4px; }
    .btn { display: inline-block; padding: 12px 20px; border: none; border-radius: 999px;
      background: #f4a259; color: #2a241b; font-size: 16px; font-weight: 700; cursor: pointer; text-decoration: none; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
    .cell { position: relative; aspect-ratio: 1; border-radius: 10px; overflow: hidden; background: #2a241b; }
    .cell img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .cell .who { position: absolute; left: 0; right: 0; bottom: 0; padding: 4px 8px; font-size: 13px;
      background: linear-gradient(transparent, rgba(28,24,18,0.8)); }
    .center { text-align: center; padding: 60px 20px; }
    .center .big { font-size: 44px; margin-bottom: 12px; }
    .hide { display: none !important; }
  </style>
</head>
<body>
  <div class="wrap">
    <div id="album-view" class="hide">
      <header>
        <div>
          <h1 id="title">Foto's van de avond</h1>
          <div class="sub" id="when"></div>
        </div>
        <a class="btn" id="dl">⬇ Download alle foto's</a>
      </header>
      <div class="grid" id="grid"></div>
    </div>

    <div id="gone-view" class="hide center">
      <div class="big">⌛</div>
      <h1>Dit album is niet (meer) beschikbaar</h1>
      <div class="sub">De link is verlopen of bestaat niet.</div>
    </div>

    <div id="loading-view" class="center"><div class="sub">Even laden…</div></div>
  </div>

  <script>
    const token = location.pathname.replace(/^\/album\/?/, '').replace(/\/+$/, '');
    const $ = (id) => document.getElementById(id);
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    function show(view) {
      for (const v of ['album-view', 'gone-view', 'loading-view']) $(v).classList.add('hide');
      $(view).classList.remove('hide');
    }

    (async () => {
      if (!token) { show('gone-view'); return; }
      try {
        const r = await fetch('/api/album/' + encodeURIComponent(token));
        if (!r.ok) { show('gone-view'); return; }
        const a = await r.json();
        $('title').textContent = a.title || "Foto's van de avond";
        if (a.whenISO) {
          const d = new Date(a.whenISO);
          if (!isNaN(d)) $('when').textContent = d.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        }
        $('dl').href = '/api/album/' + encodeURIComponent(token) + '/zip';
        $('grid').innerHTML = (a.photos || []).map((p) =>
          '<a class="cell" href="' + esc(p.src) + '" target="_blank" rel="noopener" download>' +
            '<img src="' + esc(p.src) + '" alt="" loading="lazy">' +
            (p.name ? '<div class="who">' + esc(p.name) + '</div>' : '') +
          '</a>').join('');
        show('album-view');
      } catch (e) { show('gone-view'); }
    })();
  </script>
</body>
</html>
```

- [ ] **Step 2: Verifieer**

Start `cd app && PORT=8499 node server.js`. Maak een album (zoals in Task 4 Step 4) en noteer token `<A>`. Open `http://localhost:8499/album/<A>` in de browser → galerij met de foto verschijnt; "Download alle foto's" wijst naar de zip. Open `http://localhost:8499/album/onbekend` → "niet (meer) beschikbaar". Stop de server, ruim test-PNG's op.

- [ ] **Step 3: Commit**

```bash
git add app/public/album/index.html
git commit -m "Avond-album: galerijpagina met download-alles en verlopen-scherm"
```

---

## Task 6: Beheer — afsluiten + albumlijst (admin.js)

**Files:**
- Modify: `app/public/admin/admin.js`

- [ ] **Step 1: Voeg de afsluit- en albumblokken toe in cardFeest**

Lees eerst `cardFeest`. Het bouwt o.a. `grid` en eindigt met
`return '<div class="card">' + top + qrBlock + genQrButton + grid + statusDiv + '</div>';`.

Voeg, direct ná de bestaande `const grid = …`-toewijzing in `cardFeest`, toe:

```js
  const eventOpts = '<option value="">— geen koppeling —</option>' +
    (d.events || []).map((e) => '<option value="' + esc(e.id) + '">' + esc(e.title) + '</option>').join('');
  const closeBlock = items.length
    ? '<div style="border-top: 1px solid rgba(242,236,220,0.12); margin-top: 14px; padding-top: 14px;">' +
        '<div style="font-size: 13px; color: rgba(242,236,220,0.55); margin-bottom: 8px;">Avond afsluiten maakt een album van de foto’s hierboven en maakt het bord schoon. Koppel je een event, dan krijgen de aanmelders het album per mail.</div>' +
        '<select id="album-event" style="width: 100%; padding: 9px 10px; border-radius: 8px; border: none; background: #faf6ec; color: #2a241b; font-size: 15px; margin-bottom: 8px;">' + eventOpts + '</select>' +
        '<button class="btn-orange" data-act="closeParty" style="width: 100%;">AVOND AFSLUITEN &amp; ALBUM MAKEN</button>' +
      '</div>'
    : '';

  const albums = d.albums || [];
  const albumsBlock = albums.length
    ? '<div style="border-top: 1px solid rgba(242,236,220,0.12); margin-top: 16px; padding-top: 14px;">' +
        '<div style="font-size: 13px; color: rgba(242,236,220,0.55); margin-bottom: 10px;">Albums</div>' +
        albums.map((al, i) => {
          const verlopen = D.albumStatus(al, Date.now()) !== 'ok';
          const thumb = verlopen
            ? '<div style="width: 56px; height: 56px; border-radius: 8px; background: rgba(242,236,220,0.08); display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0;">⌛</div>'
            : '<img src="/api/album/' + esc(al.token) + '/qr.svg" alt="" style="width: 56px; height: 56px; background: #faf6ec; border-radius: 8px; padding: 3px; flex-shrink: 0;">';
          return '<div style="display: flex; gap: 12px; align-items: center; padding: 8px 0; border-bottom: 1px solid rgba(242,236,220,0.08);">' +
            thumb +
            '<div style="flex: 1; min-width: 0;">' +
              '<div style="font-size: 15px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">' + esc(al.title) + (verlopen ? ' · <span style="color: rgba(242,236,220,0.5);">verlopen</span>' : '') + '</div>' +
              '<div style="font-size: 12px; color: rgba(242,236,220,0.5);">' + ((al.photos || []).length) + ' foto’s</div>' +
            '</div>' +
            (verlopen ? '' : '<button class="btn-orange" data-act="copyAlbumLink" data-arg="' + i + '" style="font-size: 13px; padding: 6px 12px; flex-shrink: 0;">KOPIEER</button>') +
            '<button class="btn-x" data-act="rmAlbum" data-arg="' + i + '" aria-label="Album verwijderen" style="flex-shrink: 0;">✕</button>' +
          '</div>';
        }).join('') +
      '</div>'
    : '';
```

Voeg `closeBlock` en `albumsBlock` toe aan de uiteindelijke `return`, ná `grid` en vóór de status-`div`:

```js
    grid +
    closeBlock +
    albumsBlock +
    '<div class="status" data-status="party" style="margin-top: 8px; min-height: 18px; font-size: 14px; color: #f4a259;"></div>' +
  '</div>';
```

- [ ] **Step 2: Voeg de acties toe aan de dispatcher**

In de `switch` in `app/public/admin/admin.js` (bij `case 'genQr':`), voeg toe:

```js
    case 'closeParty': {
      const sel = document.getElementById('album-event');
      const eventId = sel ? sel.value : '';
      setStatus('party', 'Album maken…');
      try {
        const r = await fetch('/api/party/close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ eventId }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || ('http ' + r.status));
        setStatus('party', 'Album gemaakt' + (j.emailed ? ' · ' + j.emailed + ' mail(s) verstuurd' : '') + ' ✓');
      } catch (e) {
        setStatus('party', 'Afsluiten mislukt — ' + e.message);
      }
      break;
    }
    case 'copyAlbumLink': {
      const al = (client.get().albums || [])[i];
      if (al) {
        const link = ((app.mail && app.mail.publicBase) || location.origin).replace(/\/+$/, '') + '/album/' + al.token;
        try { await navigator.clipboard.writeText(link); setStatus('party', 'Album-link gekopieerd ✓'); } catch (e) { setStatus('party', link); }
      }
      break;
    }
    case 'rmAlbum': {
      if (window.confirm('Dit album verwijderen? De link werkt daarna niet meer.')) mut((d) => { d.albums.splice(i, 1); }, true);
      break;
    }
```

- [ ] **Step 3: Verifieer**

- `cd app && node --check public/admin/admin.js` → OK.
- `grep -c "closeParty" public/admin/admin.js` → 2 ; `grep -c "rmAlbum" public/admin/admin.js` → 2.
- Browser-sanity: start `cd app && node server.js`, open `/admin/`, upload via een QR een foto, kies onderin "AVOND AFSLUITEN & ALBUM MAKEN" → er verschijnt een album in de lijst met een QR-thumb; "KOPIEER" werkt; ✕ vraagt bevestiging en verwijdert. Stop de server, ruim `app/data/`-testbestanden op.

- [ ] **Step 4: Commit**

```bash
git add app/public/admin/admin.js
git commit -m "Avond-album: afsluit-knop + event-koppeling + albumlijst in het beheer"
```

---

## Task 7: Bord — "Foto's van vanavond"-QR-view (tv.js)

**Files:**
- Modify: `app/public/tv/tv.js`

- [ ] **Step 1: Voeg de poster-functie toe**

In `app/public/tv/tv.js`, direct ná de functie `partyPolaroidHtml`, voeg toe:

```js
// "Papier op het bord"-poster met de QR naar het album van de zojuist afgesloten
// avond. De QR komt server-side als SVG, dus dit is gewoon een <img> — geen QR-JS.
function albumQrPosterHtml(d) {
  const al = D.freshAlbum(d.albums, Date.now(), 48 * 60 * 60 * 1000);
  if (!al) return '';
  return '<div style="width: 100%; height: 100%; min-height: 0; background: #faf6ec; padding: 26px 38px; box-sizing: border-box; transform: rotate(-0.8deg); box-shadow: 0 10px 30px rgba(0,0,0,0.4); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; position: relative; animation: defles-fade 0.9s ease;">' +
    '<div style="font-family: \'Amatic SC\', cursive; font-weight: 700; font-size: 58px; line-height: 1; color: #2c3e35; text-align: center;">Foto’s van vanavond</div>' +
    '<img src="/api/album/' + esc(al.token) + '/qr.svg" alt="" style="width: 230px; height: 230px;">' +
    '<div style="font-family: \'Shadows Into Light Two\', cursive; font-size: 30px; color: #c2540a;">scan om ze te bewaren</div>' +
    '<div style="font-size: 16px; color: rgba(74,67,55,0.55);">30 dagen beschikbaar</div>' +
    '<div style="position: absolute; top: -12px; left: 50%; transform: translateX(-50%) rotate(-2deg); width: 120px; height: 28px; background: rgba(242,236,220,0.45); box-shadow: 0 1px 3px rgba(0,0,0,0.15);"></div>' +
  '</div>';
}
```

- [ ] **Step 2: Registreer de view in de raster-middenviews**

In `midViewsFor(d, now)` (die met `views.push('party')`), voeg de albumqr-view toe ná `party`:

```js
  if (partyPhotos(d).length > 0) views.push('party');
  if (D.freshAlbum(d.albums, now.getTime(), 48 * 60 * 60 * 1000)) views.push('albumqr');
```

- [ ] **Step 3: Render hem in het raster-middenvlak**

In `midSlotHtml(d)`, voeg de tak toe direct ná `if (active === 'party') return partyPolaroidHtml(d, true);`:

```js
  if (active === 'albumqr') return albumQrPosterHtml(d);
```

- [ ] **Step 4: Registreer de view in de roterende panels**

In `panelsFor(d)`, voeg toe ná `panels.push('party')`:

```js
  if (partyPhotos(d).length > 0) panels.push('party');
  if (D.freshAlbum(d.albums, Date.now(), 48 * 60 * 60 * 1000)) panels.push('albumqr');
```

- [ ] **Step 5: Render hem als roterend hoofdpaneel**

In `mainPanelHtml(d, panel)`, direct ná het `if (panel === 'party') { ... }`-blok, voeg toe:

```js
  if (panel === 'albumqr') {
    return '<div style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: 30px; animation: defles-fade 0.7s ease;">' +
      albumQrPosterHtml(d) + '</div>';
  }
```

- [ ] **Step 6: Verifieer**

- `cd app && node --check public/tv/tv.js` → OK.
- `grep -c "albumQrPosterHtml" public/tv/tv.js` → 3 (definitie + 2 renders).
- Browser-sanity: start `cd app && node server.js`; maak via het beheer een album (foto uploaden → afsluiten). Open `/tv/`; binnen de rotatie verschijnt de "Foto's van vanavond"-poster met QR (scan → album-pagina). Test beide varianten (raster/roterend) via SCHERM in het beheer. Stop de server, ruim testbestanden op.

- [ ] **Step 7: Commit**

```bash
git add app/public/tv/tv.js
git commit -m "Avond-album: 'Foto's van vanavond'-QR-view op het bord"
```

---

## Task 8: End-to-end-verificatie + documentatie

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Draai alle unit-tests**

Run: `cd app && node --test`
Expected: alle tests (`album.test.js`, `zip.test.js`, `party.test.js`) PASS.

- [ ] **Step 2: Volledige doorloop + verlooptest (tijdelijke edit, terugdraaien)**

1. Tijdelijk in `app/server.js`: zet `ALBUM_TTL_MS = 30 * 24 * 60 * 60 * 1000` naar `8 * 1000` (8 s).
2. Start `cd app && node server.js &`. Mint token, upload 1 foto, `POST /api/party/close` → album-token `<A>`.
3. `GET /api/album/<A>` werkt; `…/zip` levert een geldige zip (`unzip -l`); `…/qr.svg` geeft `<svg`.
4. `sleep 9`; dan `GET /api/album/<A>` → `410`, en `…/zip` → `410`.
5. Kill de server. **Zet `ALBUM_TTL_MS` terug naar `30 * 24 * 60 * 60 * 1000`.** Controleer met `git diff app/server.js` dat er geen restwijziging is.
6. Ruim test-PNG's in het gitignored `app/data/` op.

- [ ] **Step 3: Bevestig dat afsluiten het bord schoonmaakt en foto's bewaart**

- Na een `close`: `curl -s http://localhost:8420/api/state | grep -o '"party":{[^}]*}'` toont lege `photos` en `token:null`.
- `prunePhotos` beschermt album-bestanden via `usedPhotoNames` (album-tak, getest in Task 1) — bevestig door inspectie dat `app/data/photos/` na een close de bestanden behoudt.

- [ ] **Step 4: Documenteer in de README**

Voeg in `README.md`, onder het bestaande kopje "Foto's van gasten (QR)", toe:

```markdown
### Avond-album

Na afloop tik je in het beheer onder **FEEST · FOTO'S VAN GASTEN** op **"Avond
afsluiten & album maken"**. De foto's van die avond worden een album, het bord
wordt schoon, en het bord toont een **"Foto's van vanavond"**-QR waarmee gasten
het album openen (`/album/<token>`): bekijken, los opslaan of **alles als zip**
downloaden. Koppel je het album aan een RSVP-event, dan krijgen de aanmelders de
link ook per mail. Album-links zijn 30 dagen geldig; met ✕ verwijder je een album.
```

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "Avond-album: korte uitleg in de README"
```

---

## Zelfreview (uitgevoerd bij het schrijven)

- **Spec-dekking:** album-state + helpers (T1), zip-writer (T2), QR-vendor + Dockerfile-fix (T3), close-endpoint + email + album-API + allowlist + prune-via-usedPhotoNames (T4/T1), album-pagina met zip-download (T5), admin afsluiten + event-koppeling + albumlijst + verwijderen (T6), bord-QR-view (T7), verificatie incl. verlooptest + README (T8). Alles gedekt.
- **Type-consistentie:** `albumByToken(albums, token)`, `albumStatus(album, now)`, `freshAlbum(albums, now, windowMs)`, `zipStore(files=[{name,data}])`, `crc32(buf)`, album-vorm `{id, token, title, whenISO, createdAt, expiresAt, eventId, photos:[{id,src,name,ts}]}` — overal gelijk gebruikt in server/admin/tv/album-pagina.
- **Geen placeholders:** elke code-stap is volledig en plak-klaar; de twee vendor-/Docker-afhankelijkheden (qrcode-encoder + Dockerfile-COPY) zijn expliciet, met de exacte `curl` en `node`-verificatie.
- **Deploy-risico afgedekt:** `zip.js` en `vendor/` worden expliciet in de Dockerfile gekopieerd (T3) — zonder dat zou de productie-container crashen.
