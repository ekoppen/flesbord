# Ontwerp — Gasten-foto's via QR

**Datum:** 2026-06-13
**Project:** De Fles (bar-/feestbord, `ekoppen/flesbord`)
**Status:** Goedgekeurd, klaar voor implementatieplan

## Doel

Aanwezigen op het feest laten zelf foto's op het bord plaatsen, zonder app of
account. Ze scannen een QR-code, openen een klein paginaatje op hun eigen
telefoon, kiezen/maken een foto + naam, en die verschijnt live op het bord.
De openbare link verloopt na 24 uur.

## Beslissingen (vastgelegd tijdens brainstorm)

| Onderwerp | Keuze |
|-----------|-------|
| Toegang | QR-code → eigen mini-pagina op telefoon gast (geen app/account) |
| Moderatie | Live op het bord + snelle ✕ "noodrem" in de admin |
| Verhouding tot eigen foto's | **Aparte** gasten-pool met eigen bordblok ("Foto's van het feest"); de 12 curated `state.photos` blijven los |
| Wat vult de gast in | Foto + naam ("van wie?"). Bijschrift blijft admin-only |
| Overloop | Bord toont laatste 40; oudste valt uit de **weergave**, niet van schijf |
| Bewaren | `state.party.photos` krimpt nooit → bestanden blijven bewaard |
| Verloop | Admin tikt "Genereer QR / nieuw feest" → token 24 u geldig; daarna openbare link dicht |

## Gast-ervaring

1. Scant QR (op bord / kaartje) → opent `…:8420/foto/<token>`.
2. Pagina "Zet je foto op het bord": knop *foto kiezen/maken* (camera-capture) +
   veld *van wie?* (naam).
3. Versturen → binnen ~2 s in het blok "Foto's van het feest" op het bord, met
   "— Suze" eronder.
4. Link ouder dan 24 u → pagina "Deze link is verlopen", geen upload mogelijk.

## Admin-kant

- Nieuwe **Feest**-sectie, knop **"Genereer QR / nieuw feest"** → vers token
  (24 u geldig), toont **QR-code + link + "geldig tot …"**.
- Lijst met binnengekomen gasten-foto's, elk met **✕ noodrem** (haalt foto direct
  van het bord; spiegelt de bestaande `rmPhoto`-actie).
- **Album**: alle feest-foto's bij elkaar. Verloopt niet (admin is apart
  beveiligd).

## Bord (tv)

- Nieuw view **"Foto's van het feest"** dat `party.photos.slice(-40)` roteert,
  met de naam eronder. Schuift mee in de bestaande raster/roterend-layout, naast
  de eigen 12 curated foto's.
- Verschijnt alleen als `party.photos.length > 0` (analoog aan de bestaande
  `photos`-view-logica in `tv.js`).
- Bij verloop **blijft** het bord de foto's tonen; alleen de openbare link sluit.

## Onder de motorkap

### State

```js
state.party = {
  token: 'a1b2c3',          // huidige gast-link; null = geen actief feest
  expiresAt: 1750000000000, // ms epoch; daarna upload/album dicht
  photos: [ { id, src, name, ts } ]  // ÁLLE gasten-foto's — krimpt nooit
}
```

Bord toont `party.photos.slice(-40)`; "doorschuiven" is puur weergave, er wordt
niets verwijderd.

### Endpoints (nieuw, smal)

De gast krijgt **géén** toegang tot de algemene `PUT /api/state` — alleen tot de
endpoints hieronder.

> **Volg het bestaande RSVP-patroon** (`server.js:449-528`, "PUBLIEK +
> token-afgeschermd, veilig om naar internet te zetten"): statische pagina op een
> token-pad, token-check → 404, `GET` geeft alleen veilige info, `POST` is
> rate-limited via de bestaande `rateLimited(clientIp(req))`-helper met
> input-capping. De gasten-foto's spiegelen dit; nieuw is alleen de
> tijd-gebaseerde `expiresAt`-check bovenop de token-check.

- `POST /api/party/new` *(admin)* → mint token, `expiresAt = nu + 24u`, geeft
  `{ token, url, expiresAt }` terug. Een nieuw feest maakt het oude token dood.
- `GET /api/party/:token` → `{ geldig, expiresAt }` of `410` bij verlopen/onbekend
  token. De gast-pagina checkt hiermee.
- `POST /api/party/:token/photo` `{ dataUrl, name }` → valideert token +
  vervaltijd, valideert afbeelding (hergebruik bestaande
  `data:image/(jpeg|png|webp)`-regex), bewaart bestand, **voegt server-side**
  `{ id, src, name, ts }` toe aan `party.photos`, broadcast via SSE. Foto wordt
  **client-side verkleind** (zoals de admin nu doet) en blijft binnen de bestaande
  12 MB body-limiet.

### Opruimer (`prunePhotos`, server.js:67)

Moet `state.party.photos` meenemen in de "in gebruik"-set, zodat gasten-bestanden
nooit worden weggegooid (~2 regels). Nu kijkt-ie alleen naar `state.photos`.

### Bestanden

In de bestaande `data/photos/`-map; naam = random id (`uid()`); padtraversal is
al afgedekt via `path.basename`.

### QR-code

Client-side gerenderd in de admin met één klein gevendord JS-bestand (geen
npm-dependency, past bij de vanilla-opzet van het project).

## Verloop-gedrag (expliciet)

- Na `expiresAt`: gast-pagina + upload-API → "verlopen".
- Het **bord blijft** de foto's tonen (alleen de openbare link sluit).
- **Nieuw feest** mint een nieuw token; de oude link is daarmee sowieso dood.

## Beveiliging / misbruik

- Token is onraadbaar (random `uid()`).
- Body-limiet (12 MB) en afbeeldingstype-validatie hergebruikt.
- Padtraversal al afgedekt.
- Snelheidslimiet via de bestaande `rateLimited(clientIp(req))`-helper (zoals de
  RSVP-POST) tegen spammen.

## Buiten scope (YAGNI)

- Geen accounts/login voor gasten.
- Geen per-foto-moderatie-wachtrij (bewust: live + noodrem).
- "Begin met schoon bord"-knop bij nieuw feest: optioneel, geen kernfunctie.

## Verificatie

Geen testframework in het project (vanilla HTML/JS). Daarom:

- Klein **Node-smoke-testje** voor de risicovolle serverlogica: token
  geldig/verlopen, en dat `prunePhotos` de `party`-foto's met rust laat.
- **Handmatig**: QR genereren → vanaf telefoon uploaden → op bord zien → TTL kort
  zetten en "verlopen"-scherm bevestigen.

## Geraakte bestanden (indicatief)

- `app/server.js` — nieuwe party-endpoints, `prunePhotos`-aanpassing, state-init.
- `app/public/foto/index.html` (+ evt. `foto.js`) — gast-uploadpagina.
- `app/public/tv/tv.js` — "Foto's van het feest"-view.
- `app/public/admin/admin.js` + `index.html` — Feest-sectie, QR, noodrem, album.
- `app/public/admin/qrcode.min.js` (gevendord) — QR-rendering.
- `app/public/defles-data.js` / `defles-data.js` — `party`-default in de state.
