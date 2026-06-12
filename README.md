# Handoff: De Fles — Bar-dashboard (TV + Beheer)

## Overzicht
"De Fles" is een bar in een tuinhuis. Dit ontwerp bestaat uit twee schermen:

1. **TV-dashboard** (`De Fles TV Krijtbord.dc.html`) — een 1920×1080 krijtbord-scherm dat via een Chromecast op de TV in de bar wordt getoond. Het toont: klok, datum, live weer, "nu speelt" (muziek), fotoslideshow, mededeling, tap-menu, voorraad en een WK-voetbalpaneel met automatisch opgehaald schema + stand.
2. **Beheerscherm** (`De Fles Admin.dc.html`) — een aparte URL waarmee de bareigenaar alles instelt. Wijzigingen verschijnen live (≤2 s) op de TV.

Doel van de implementatie: dit als echt product draaiend krijgen, waarbij de TV (Chromecast) en het beheer (telefoon/laptop) **niet** meer dezelfde browser delen — zie "State & synchronisatie".

## Over de ontwerpbestanden
De bestanden in deze bundel zijn **ontwerpreferenties gemaakt in HTML** (prototypes die de bedoelde look & werking tonen), géén productiecode om 1-op-1 over te nemen. De opdracht is om deze ontwerpen na te bouwen in een passende productie-omgeving. Er is nog geen bestaande codebase; kies zelf de meest geschikte stack. Suggestie: een lichte web-app (bijv. Vite + React of zelfs vanilla) met een heel klein backendje (Node/Express of een Raspberry Pi met websockets) voor gedeelde state — maar de keuze is vrij.

De `.dc.html`-bestanden bevatten elk een HTML-template (tussen `<x-dc>`-tags) en een logica-klasse (React-achtige class). Alle styling staat **inline** in de templates — daar staan dus alle exacte waarden. `defles-data.js` is gewone, herbruikbare ES-module-code (datamodel + alle API-koppelingen) en is grotendeels direct bruikbaar.

## Fidelity
**High-fidelity.** Kleuren, typografie, spacing, copy en interacties zijn definitief en moeten pixel-getrouw worden nagebouwd. De exacte inline-styles in de templates zijn leidend; dit document vat de belangrijkste waarden samen.

## Design tokens

### Kleuren
| Token | Waarde | Gebruik |
|---|---|---|
| Bord (achtergrond) | `#2c3e35` | Basis van beide schermen (donkergroen krijtbord) |
| Krijtvegen | `radial-gradient`-ellipsen met `rgba(244,238,222,0.03–0.05)` | Subtiele textuur over het bord |
| Krijt (primaire tekst) | `#f2ecdc` | Vrijwel alle tekst |
| Krijt gedimd | `rgba(242,236,220,0.5–0.75)` | Labels, secundaire tekst |
| Krijtlijnen | `rgba(242,236,220,0.25–0.35)` | Borders, stippellijnen |
| Accent (krijt-oranje) | `#f4a259` | Prijzen, scripts, actieve states, equalizer op donker |
| Accent donker | `#c2540a` | Oranje op lichte (diapositieve) vlakken |
| Diapositief vlak | `#f2ecdc` achtergrond, tekst `#2c3e35` | Now-playing-pil, primaire knoppen |
| Polaroid | `#faf6ec` (frame), `#ddd6c6` (foto-placeholder), `#4a4337` (bijschrift) | Fotoslideshow |
| Houten lijst | `linear-gradient(135deg, #87603b, #6b4527 38%, #7d5731 70%, #5e3d22)` | Rand om het TV-scherm (22 px) |
| Succes-groen | `#8fd6a0` | "Live"-indicator, "opgeslagen ✓", Spotify verbonden |
| TV-bord schaduw | `inset 0 0 60px rgba(0,0,0,0.35)` | Diepte in het bord |

### Typografie (Google Fonts)
| Font | Gebruik | Voorbeeldgroottes (TV 1920×1080) |
|---|---|---|
| **Amatic SC** (700) | Koppen, klok, tapnamen, getallen — de "krijtletters" | Wordmark 74 px (bovenbalk), klok 86 px, "OP DE TAP" 56 px, tapnaam 41 px, now-playing-titel 44 px |
| **Shadows Into Light Two** | Handschrift-accenten ("vers van het vat", "let op!", prijzen, datums, bijschriften) | 24–48 px, vaak met `transform: rotate(-1° à -2°)` |
| **Patrick Hand** | Lopende tekst, kleine labels, admin-formulieren | 13–22 px |

Letterspaced caps-labels: Patrick Hand, `letter-spacing: 0.18–0.42em`, kleur krijt-gedimd.

### Vormtaal
- Kaarten op het bord: `border: 2px solid rgba(242,236,220,0.25–0.35)`, `border-radius: 12–14px`, soms extra binnenkader (dubbele lijn) bij het tap-menu
- Stippellijnen: `border-top: 3px dashed rgba(242,236,220,0.35)` als sectiescheiding
- Prijslijnen in het tapmenu: puntjes-leader (`border-bottom: 2px dotted`) tussen naam en prijs
- Mededeling: `border: 3px double rgba(244,162,89,0.75)`, licht gedraaid (`rotate(0.3deg)`)
- Polaroid: wit frame, padding 16 px + 64 px onder (bijschrift-strook), `rotate(-1.2deg)`, plakband-element bovenaan (`rgba(242,236,220,0.45)` blokje, 120×28 px, gedraaid), schaduw `0 10px 30px rgba(0,0,0,0.4)`
- Diapositieve pil (now playing & primaire knoppen): gevuld `#f2ecdc`, `border-radius: 999px`, `rotate(-0.6deg)`, schaduw `0 8px 22px rgba(0,0,0,0.35)`
- Toggles (admin): 52×30 px pill, knop 24 px, aan = `#f4a259`, uit = `rgba(242,236,220,0.25)`
- Admin-inputs: `border: 2px solid rgba(242,236,220,0.3)`, radius 10 px, achtergrond `rgba(242,236,220,0.07)`, focus-border `#f4a259`, placeholder `rgba(242,236,220,0.38)`

## Schermen

### 1. TV-dashboard (1920×1080, schaalt naar venster)
Het hele scherm zit in een houten lijst (22 px) met daarbinnen het krijtbord. Het ontwerp is op vaste 1920×1080 gezet en wordt met `transform: scale(min(vw/1920, vh/1080))` gecentreerd geschaald — zo blijft het pixelvast op elke TV.

Er zijn **twee indelingen**, gekozen via beheer (`variant`):

**A. Vast raster** (`raster`, standaard)
- **Bovenbalk** (flex-row, gap 34, gescheiden door verticale stippellijnen):
  - Wordmark: script "welkom in" (26 px, oranje, gedraaid) boven "DE FLES" (Amatic 74 px, met text-shadow gloed `0 0 14px rgba(242,236,220,0.18)`) en "BAR · TUINHUIS" (14 px, letterspacing 0.4em)
  - Klok: Amatic 86 px + datum eronder in script (24 px, bv. "donderdag 11 juni")
  - Weer: icoon (lijn-SVG, oranje, 56 px) + temperatuur (Amatic 66 px) + omschrijving en "{plaats} · wind {x} km/u"
  - Rechts: **now-playing-pil** (diapositief): equalizer-animatie (4 oranje balkjes `#c2540a`, hoogte 44 px, `scaleY`-animatie 0.7–1.1 s afwisselend), titel Amatic 44 px `#2c3e35`, artiest script 26 px `#c2540a`, bronlabel "NU OP SPOTIFY/VOLUMIO/…" 12 px caps
- Stippellijn over de volle breedte
- **Inhoud**: grid `1fr 470px`, gap 36:
  - **Links**: polaroid-fotoslideshow (vult hoogte; wisselt elke 9 s met fade 0.9 s; bijschrift in script op het witte frame; stippen-indicator), daaronder mededeling (dubbel oranje kader, script "let op!" + Amatic 40 px) — verborgen als leeg — en "IN DE KOELKAST": kaart met grid van voorraadregels (naam 19 px + aantal in Amatic 27 px, puntjeslijn eronder; aantal wordt **oranje bij ≤ 2**)
  - **Rechts**: het **tap-menu** (kaart met dubbel kader): script "vers van het vat" + "OP DE TAP" (Amatic 56, letterspacing 0.14em), per bier: naam (Amatic 41) — puntjesleader — prijs (script 33, oranje), daaronder stijl/percentage (17 px gedimd) + vat-niveaubalkje (6 px, oranje vulling = level%). Daaronder het **WK-paneel**: titel (Amatic 46 caps) + ondertitel (script, oranje); blok "VOLGENDE WEDSTRIJD" (oranje stippelkader) met wedstrijd (Amatic 37) + aftelteller ("over 3d 14u", script 29 oranje) + datum/tijd; programma-lijst (datum 16 px gedimd · teams 20 px · uitslag/tijd Amatic 28 oranje); mini-standtabel (#/LAND/G/P, punten in Amatic oranje)
- `data-screen-label="TV — Krijtbord raster"`

**B. Roterend vlak** (`roterend`)
- Zelfde bovenbalk (iets compacter, now-playing-pil met equalizer 32 px / titel 36 px)
- Groot middenvlak (kaart met krijtrand) dat **elke 12 s wisselt** (fade 0.7 s) tussen panelen: foto's (polaroid gecentreerd) → tap-menu groot (gecentreerd, 880 px breed, namen 62 px) → WK groot (grid `1fr 600px`: links titel 120 px + volgende wedstrijd + aftelteller script 64 px; rechts programma + stand) → voorraad groot ("In de koelkast", 4-koloms kaartgrid met aantallen in Amatic 44)
- Onderbalk: mededeling (dubbel oranje kader, één regel met ellipsis) + paneel-stippenindicator (actieve stip = 26 px breed, oranje)
- `data-screen-label="TV — Krijtbord roterend"`

Leeg-states: geen foto's → stippelkader met "Nog geen foto's — voeg ze toe via het beheerscherm"; weer nog niet geladen → "Weerbericht wordt geladen…"; muziek verborgen via toggle; mededeling leeg → verborgen; thema uit → WK-paneel weg.

### 2. Beheerscherm (responsive, max-width 1060 px, zelfde krijtstijl)
Kop: script "beheerscherm" + "DE FLES", rechts: "opgeslagen ✓" (flitst 1,8 s na elke wijziging), live-indicator-pil (groene stip + "Live — wijzigingen verschijnen direct op TV") en diapositieve knop "OPEN TV-SCHERM ↗".

Kaarten (border 2px krijt, radius 14, achtergrond `rgba(15,24,20,0.18)`, koppen Amatic 33 caps):
1. **Schermindeling** — twee keuzetegels (Vast raster / Roterend vlak); actief = oranje rand + `rgba(244,162,89,0.14)` achtergrond
2. **Weer** — plaatsnaam zoeken (Open-Meteo geocoding), Enter of knop "ZOEK", toont huidige plaats + foutstatus
3. **Teksten** — welkomstregel (boven het logo) + mededeling (textarea; leeg = verbergen op TV)
4. **Muziek** — toggle "tonen op TV" + bron-keuzepillen **HANDMATIG / VOLUMIO / SPOTIFY**:
   - *Handmatig*: label-select (Spotify/Volumio/Vinyl) + nummer + artiest
   - *Volumio*: adres-input (IP of `volumio.local`) + knop "TEST" → status met wat er nu speelt; uitleg: TV pollt elke 5 s
   - *Spotify*: indien niet verbonden: Client ID-input, read-only redirect-URI-vak (selecteerbaar), knop "VERBIND MET SPOTIFY ↗" (diapositief), uitleg over developer.spotify.com; indien verbonden: groen stippelkader "Verbonden met Spotify ✓" + knop "Ontkoppelen"
5. **Op de tap** — rij per bier: naam, stijl·%, prijs, vat-niveau-slider (accent oranje) + percentage, ✕; knop "+ BIER TOEVOEGEN" (stippelrand)
6. **Voorraad** — 2-koloms grid; per artikel: naam, categorie-select (Bier/Fris/Wijn/Sterk/Overig), −/aantal/+ stepper, ✕; "+ ARTIKEL TOEVOEGEN"
7. **Foto's** — polaroid-thumbnails (110 px foto + bijschrift-input in script op het frame, ✕-knop op de foto), upload-tegel (stippelrand); max 12 foto's, client-side verkleind naar ≤1280 px JPEG 0.72; teller "x van max. 12"
8. **Thema — WK voetbal** — toggle aan/uit; titel + ondertitel; daarna **alleen API-instellingen** (geen handmatige wedstrijden/stand meer): API-SLEUTEL, COMPETITIE-ID, SEIZOEN, TEAMFILTER (leeg = alles) + oranje knop "NU OPHALEN" + statusregel + "Laatst opgehaald: …"; daaronder read-only voorbeeld "OPGEHAALD SCHEMA" en "STAND"
9. Onderaan: ghost-knop "Terug naar voorbeelddata" (met confirm)

Alles slaat **direct bij elke wijziging** op (geen save-knop).

## State & synchronisatie
In het prototype delen TV en beheer één `localStorage`-key (`defles-state-v1`); de TV pollt elke 2 s + luistert naar `storage`-events. **In productie moet dit een gedeelde backend worden** (de Chromecast en de telefoon zijn aparte apparaten): bv. een mini-server (Raspberry Pi/NAS) met een JSON-state-endpoint + websocket/SSE-push, of een gehoste KV-store. De TV-pagina cast je via een Chromecast (tab-cast of als ontvanger-app/kiosk).

### Datamodel (zie `DEFAULT_STATE` in `defles-data.js`)
```
{
  variant: 'raster' | 'roterend',
  welkom: string,                  // scriptregel boven het logo
  mededeling: string,              // leeg = verbergen
  showMusic: boolean,
  music: {
    mode: 'handmatig' | 'volumio' | 'spotify',
    source: string,                // label bij handmatig
    track: string, artist: string, // handmatige waarden / fallback
    volumioHost: string,
    spotifyClientId: string
  },
  weatherPlace: { name, lat, lon },
  taps: [{ id, name, style, price, level /* 0-100 */ }],
  stock: [{ id, name, cat, qty }],
  photos: [{ id, src /* dataURL of URL */, caption }],
  theme: {
    enabled: boolean, title: string, sub: string,
    api: { key, league, season, team },   // TheSportsDB
    lastSync: epoch-ms,
    matches: [{ id, date 'YYYY-MM-DD', time 'HH:MM', home, away, score }],  // cache uit API
    standings: [{ team, g, pts }]                                            // cache uit API
  }
}
```

## Interacties & gedrag (timers)
| Wat | Interval | Bron |
|---|---|---|
| Klok | 1 s | lokaal |
| Foto-wissel | 9 s (fade 0.9 s) | state.photos |
| Paneel-rotatie (variant B) | 12 s (fade 0.7 s) | afgeleid |
| State-sync TV ← beheer | ≤2 s (prototype) | gedeelde state |
| Weer | bij start + elke 15 min + bij plaatswijziging | Open-Meteo |
| Nu speelt (Volumio/Spotify) | elke 5 s | Volumio API / Spotify API |
| WK-schema + stand | bij start + elke 30 min (+ knop in beheer) | TheSportsDB |

- Aftelteller volgende wedstrijd: "over {d}d {u}u" / "over {u}u {m}m" / "over {m} min"; eerstvolgende = eerste wedstrijd zonder uitslag in de toekomst
- Alle live-koppelingen falen **stil** op de TV (laatst bekende waarden of handmatige fallback blijven staan; nooit een foutmelding op het bord)
- Equalizer: 4 balkjes, `@keyframes scaleY(0.2)→(1)`, duur 0.7+i·0.13 s, delay i·0.12 s, alternate

## API-koppelingen (volledige implementaties in `defles-data.js`)
1. **Open-Meteo** (weer, geen sleutel): `api.open-meteo.com/v1/forecast?latitude&longitude&current=temperature_2m,weather_code,wind_speed_10m&timezone=Europe/Amsterdam`; weercode → NL-omschrijving + icoonsoort (sun/suncloud/cloud/rain/snow/storm/fog; lijn-SVG's in de TV-logica). Geocoding: `geocoding-api.open-meteo.com/v1/search?name=…&count=1&language=nl`.
2. **TheSportsDB** (WK-schema/stand, gratis sleutel `123`, WK = league `4429`, seizoen `2026`): `eventsseason.php?id={league}&s={season}` (fallback: `eventspastleague` + `eventsnextleague`), stand via `lookuptable.php?l={league}&s={season}`. Tijden zijn UTC → omrekenen naar NL. Teamfilter op naam; curatie: laatste 2 gespeelde + komende, max 8. Engelse teamnamen worden vertaald via de `TEAM_NL`-map (Netherlands→Nederland enz.).
3. **Volumio** (lokaal netwerk): `GET http://{host}/api/v1/getState` → `{ title, artist, status }`. Timeout 4 s.
4. **Spotify** (Authorization Code + **PKCE**, eigen Client ID, geen secret): scopes `user-read-currently-playing user-read-playback-state`; redirect-URI = beheer-URL (moet exact in het Spotify-dashboard staan); tokens in storage met stille refresh (30 s marge); now playing via `GET /v1/me/player/currently-playing` (204 = niets aan het spelen).

## Assets
- Fonts: Google Fonts — Amatic SC (400/700), Shadows Into Light Two, Patrick Hand
- Demo-foto's: `picsum.photos/seed/defles-{a,b,c}/1400/900` — placeholders, vervangen door eigen uploads
- Geen verdere beeld-assets; weericonen zijn kleine inline lijn-SVG's (stroke 1.7, round caps), eventueel te vervangen door een iconenset in dezelfde stijl

## Bestanden in deze bundel
- `De Fles TV Krijtbord.dc.html` — TV-dashboard (template + logica; beide varianten)
- `De Fles Admin.dc.html` — beheerscherm (template + logica)
- `defles-data.js` — datamodel, opslag/sync-helpers en álle API-koppelingen (grotendeels herbruikbaar)

## Toekomstige wensen (nu buiten scope, wel voorzien)
- Gasten laten foto's insturen (bv. via een Discord-bot die naar de gedeelde state schrijft) — het fotomodel (max 12, verkleind, bijschrift) is hierop voorbereid
- Thema's zijn generiek bedoeld: het WK-paneel is een "thema" met titel/ondertitel; andere thema's (bv. Koningsdag, EK) kunnen hetzelfde patroon volgen
