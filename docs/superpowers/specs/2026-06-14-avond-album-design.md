# Ontwerp — Avond-album (foto's achteraf ophalen)

**Datum:** 2026-06-14
**Project:** De Fles (bar-/feestbord, `ekoppen/flesbord`)
**Status:** Autonoom goedgekeurd (gebruiker delegeert beslissingen), klaar voor plan
**Bouwt voort op:** [[2026-06-13-gasten-fotos-qr-design]] (gasten-foto's via QR)

## Doel

Na afloop van een avond een overzicht (album) van de gasten-foto's maken dat de
deelnemers kunnen ophalen. De admin sluit de avond af; de foto's van die avond
worden als album beschikbaar gesteld via een QR/link op het bord (en optioneel
gemaild naar wie zich aanmeldde). Het bord wordt schoon voor de volgende keer.

## Beslissingen

| Onderwerp | Keuze |
|-----------|-------|
| Model | Album = **snapshot** van de live gasten-pool (`state.party`); aparte `state.albums[]`. De pool zelf blijft ongewijzigd werken. |
| Afsluiten | Eén admin-knop "AVOND AFSLUITEN & ALBUM MAKEN": snapshot `party.photos` → nieuw album; daarna `party` leeg + token dicht (schoon bord). |
| Retrieval (hoofd) | **QR/link op het bord**: na afsluiten toont het bord "Foto's van vanavond — scan om te bewaren", QR → album-pagina. |
| Retrieval (bonus) | Optioneel **e-mail** naar de aanmelders, als het album aan een RSVP-event is gekoppeld én de mailserver is ingesteld. |
| Album-pagina | `/album/<token>`: galerij (foto + naam), **download-alles als zip**, per foto opslaan. Token-afgeschermd, op de publieke allowlist. |
| Levensduur | Album-link **30 dagen** geldig; daarna "verlopen". Admin kan een album met ✕ verwijderen (link dood + bestanden opgeruimd). |
| QR op het bord | Server-side **SVG-QR** (`/api/album/<token>/qr.svg`) zodat de bord-view een simpele `<img>` is — geen QR-JS in de rotatie-logica. |
| Bestanden | Blijven op schijf; `prunePhotos`/`usedPhotoNames` leren `state.albums` kennen. Album verwijderen → bestanden niet meer verwezen → prune ruimt ze (10-min gracetijd). |

## Gebruikersflow

1. Avond loopt: gasten uploaden foto's (bestaande feature, `state.party`).
2. Achteraf tikt de admin in de Feest-kaart op **"AVOND AFSLUITEN & ALBUM MAKEN"**
   (met optioneel een keuze "koppel aan event" voor titel + mail).
3. Server bevriest de foto's in een album, leegt de pool, sluit de upload-QR.
4. Het bord toont (zolang het album "vers" is) een poster **"Foto's van vanavond
   — scan om ze te bewaren"** met de album-QR.
5. Deelnemers scannen → album-pagina → bekijken, los opslaan, of "download alles".
6. Is het album aan een event gekoppeld: de aanmelders krijgen ook een mail met de link.
7. Na 30 dagen vervalt de link; de admin kan een album eerder verwijderen.

## Datamodel

```js
state.albums = [
  // {
  //   id,            // uid()
  //   token,         // lange, niet-raadbare token() voor de publieke link
  //   title,         // event-titel of "De Fles — <datum>"
  //   whenISO,       // event.whenISO of moment van afsluiten
  //   createdAt,     // ms — bepaalt "vers" voor de bord-QR
  //   expiresAt,     // createdAt + 30 dagen
  //   eventId,       // optioneel: gekoppeld RSVP-event (voor titel + mail); '' indien geen
  //   photos: [ { id, src, name, ts } ]   // snapshot uit party.photos
  // }
]
```

`DEFAULT_STATE.albums = []`.

## Endpoints

### Beheer (LAN-only, NIET op de publieke allowlist)
- `POST /api/party/close` — body optioneel `{ eventId }`.
  - Faalt met 400 als `party.photos` leeg is ("geen foto's om in een album te zetten").
  - Maakt `album` (token via `token()`, `expiresAt = createdAt + 30*24*60*60*1000`,
    titel/`whenISO` uit het event indien `eventId`, anders datum-default), pusht naar
    `state.albums`, en reset `party = { token: null, expiresAt: 0, photos: [] }`.
  - `schedulePersist()` + `broadcast('')`.
  - Als `eventId` gezet, het event bestaat, de mailserver is ingesteld (`host`+`from`+`publicBase`)
    en er aanmelders met e-mail zijn: mail elk het album-linkje (hergebruikt `sendMail`/`publicBase`,
    zoals de bestaande `/invite`). Best-effort; faalt stil per adres.
  - Antwoord: `{ id, token, url, title, expiresAt, emailed }` (emailed = aantal verstuurde mails).
- Album **verwijderen** = gewone state-mutatie in de admin (`d.albums.splice(i,1)` via de
  bestaande `PUT /api/state`). Geen apart endpoint.

### Publiek (token-afgeschermd, WEL op de allowlist)
- `GET /album`, `GET /album/<token>` → serveert `public/album/index.html` (statisch).
- `GET /api/album/<token>` → `{ title, whenISO, expiresAt, photos: [{ src, name }] }`,
  of `410 { error: 'verlopen' }` bij onbekende/verlopen token.
- `GET /api/album/<token>/zip` → een **store-only ZIP** van de album-foto's,
  `Content-Disposition: attachment; filename="de-fles-<datum>.zip"`. 410 bij onbekend/verlopen.
- `GET /api/album/<token>/qr.svg` → een **SVG-QR** die de publieke album-URL codeert
  (`Content-Type: image/svg+xml`). 410 bij onbekend/verlopen. Gebruikt door het bord én
  de admin-albumlijst.

Allowlist-uitbreiding (publieke-host-afscherming): voeg `/album`, `/album/*` en
`/api/album/*` toe. `POST /api/party/close` blijft eraf (beheer-only).

## Hulpfuncties (defles-data.js, puur + getest)

- `albumByToken(albums, token)` → het album of `null`.
- `albumStatus(album, now)` → `'ok'` (now < expiresAt) of `'expired'`; call-site behandelt
  `null` als `'unknown'`.
- `freshAlbum(albums, now, windowMs)` → het meest recente album met
  `now - createdAt < windowMs` én actief (now < expiresAt), of `null`. Bord-default
  `windowMs = 48 * 60 * 60 * 1000` (48 u).
- `usedPhotoNames(state)` uitbreiden: telt nu óók elke `state.albums[].photos[].src` mee,
  zodat album-bestanden bewaard blijven.

## Mini-ZIP-writer (app/zip.js, dependency-vrij + getest)

Node heeft geen ingebouwde zip-schrijver en de doel-Node (≥18) heeft geen `zlib.crc32`.
Daarom een klein eigen module:

- `crc32(buf)` → CRC-32 (IEEE) via een lookup-tabel. Getest tegen de bekende vector:
  `crc32(Buffer.from('123456789'))` === `0xCBF43926`.
- `zipStore(files)` waar `files = [{ name, data: Buffer }]` → één `Buffer` in
  **store-formaat** (geen compressie; de JPEG's zijn al gecomprimeerd). Bevat per bestand
  een local file header + data, en aan het eind de central directory + end-of-central-directory.
  Getest op: ZIP-signature (`PK\x03\x04`), correct aantal entries in de central directory,
  en dat elk opgegeven bestand met de juiste naam/grootte terugkomt.

In-memory bouwen is prima: een handvol tot enkele honderden ~200 KB-JPEG's blijft ruim
binnen het geheugen van de LXC.

## Server-side SVG-QR

Vendor een **omgevings-onafhankelijke** QR-encoder (`qrcode-generator`, Kazuhiko Arase, MIT)
als `app/vendor/qrcode-generator.js`; in de ESM-server geladen via
`createRequire(import.meta.url)`. De `/api/album/<token>/qr.svg`-handler bouwt de publieke
album-URL (`publicBase` indien ingesteld, anders `http://<req.host>`) en geeft de
`createSvgTag()`-uitvoer terug. (De bestaande admin-party-QR met davidshimjs/qrcodejs blijft
ongemoeid — geen refactor van werkende code.)

## Bord (tv.js)

Nieuwe view **`albumqr`**, getoond zolang er een "vers" album is (`freshAlbum(...)`), in
beide varianten (`midViewsFor` raster + `panelsFor` roterend). Render: een "papier op het
bord"-poster met titel **"Foto's van vanavond"**, een `<img src="/api/album/<token>/qr.svg">`,
en subtekst "scan om ze te bewaren · 30 dagen beschikbaar". Omdat de QR een server-`<img>` is,
is er geen QR-JS of post-render-hook nodig — de view past in de bestaande rotatie net als de
andere posters.

## Beheer (admin.js)

In `cardFeest`:
- Een knop **"AVOND AFSLUITEN & ALBUM MAKEN"** (alleen tonen als er gasten-foto's zijn),
  met een optionele `<select id="album-event">` van de RSVP-events ("— geen koppeling —" +
  elk event). Klik → `POST /api/party/close` met de gekozen `eventId`; statusterugkoppeling
  via `setStatus('party', …)`. De nieuwe state komt via SSE binnen.
- Een sectie **"Albums"**: per album titel + datum + aantal foto's + een kleine
  `<img src="/api/album/<token>/qr.svg">`, de link, een "KOPIEER"-knop, en een ✕ om te
  verwijderen (`mut((d) => d.albums.splice(i,1), true)`; bevestiging via `confirm`).

## Album-pagina (public/album/index.html)

Statische pagina in De Fles-stijl (donker/warm, oranje accent), token uit het pad. Haalt
`GET /api/album/<token>` op; bij 410 een "verlopen/niet gevonden"-scherm. Toont titel +
datum, een **galerij-grid** (foto + naam-overlay), een **"⬇ Download alle foto's"**-knop
(→ `/api/album/<token>/zip`), en per foto een download-link/klik voor de volledige afbeelding.

## Beveiliging / privacy

- Album-token: lange `token()` (128-bit), onraadbaar.
- Album-endpoints token-gated; `qr.svg`/`zip`/meta geven 410 bij verlopen — geen lek na verloop.
- `POST /api/party/close` is beheer-only (niet op de publieke allowlist).
- Bestandsnamen in de zip = de opgeslagen `uid()`-namen of een veilige index, nooit
  gast-invoer als pad.
- Bestanden blijven privé op schijf tot verloop/verwijderen (zelfde filosofie als de pool):
  verloop sluit de openbare link, admin-verwijderen ruimt de bestanden op.

## Buiten scope (YAGNI)

- Geen losse foto-moderatie in het album (de admin kon tijdens de avond al met ✕ ingrijpen;
  het album is een snapshot van wat overbleef).
- Geen accounts/login voor deelnemers (token-link volstaat).
- Geen compressie in de zip (store volstaat; JPEG's zijn al klein).
- Geen automatische verwijdering van verlopen album-entries: ze blijven in `state.albums`
  staan (en in de admin-lijst, gemarkeerd als "verlopen") tot de admin ze met ✕ weghaalt.
  `usedPhotoNames` telt álle albums mee — ook verlopen — dus de bestanden blijven op schijf
  bewaard tot admin-verwijderen; alleen de openbare album-link vervalt na 30 dagen.

## Verificatie

- **Unit (`node --test`)**: `crc32` (bekende vector), `zipStore` (signature, entry-count,
  namen/groottes), `albumByToken`/`albumStatus`/`freshAlbum` (ok/expired/unknown, vers-venster),
  `usedPhotoNames` telt nu album-foto's mee.
- **Handmatig/curl**: party vullen → `POST /api/party/close` → album-token; `GET /api/album/<token>`
  geeft de foto's; `…/zip` levert een geldige zip (`unzip -l`); `…/qr.svg` geeft een SVG;
  party is gereset; bord toont de album-QR-view; verlopen-pad via tijdelijk korte TTL.

## Geraakte bestanden (indicatief)

- `app/public/defles-data.js` — `albums`-default + helpers.
- `app/zip.js` — mini-ZIP-writer (+ `crc32`).
- `app/vendor/qrcode-generator.js` — gevendorde QR-encoder.
- `app/server.js` — close-endpoint, album-endpoints (meta/zip/qr.svg), allowlist, prune.
- `app/public/album/index.html` — album-galerijpagina.
- `app/public/admin/admin.js` — afsluit-knop + albumlijst in `cardFeest`.
- `app/public/tv/tv.js` — `albumqr`-bord-view.
- `app/test/*.test.js` — unit-tests.
