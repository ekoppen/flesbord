# Ontwerp — Banner-stijl (oranje toegangskaart als optie)

**Datum:** 2026-06-17
**Project:** De Fles (`ekoppen/flesbord`)
**Status:** Autonoom goedgekeurd (gebruiker delegeert beslissingen)

## Doel

De "let op!"-mededeling kan in twee stijlen worden getoond, instelbaar in het
beheer: het huidige omlijnde kader, of de oranje "toegangskaart"-look (dezelfde
esthetiek als de aanmeldingen-sticker). Zo kan de gebruiker de oranje kaart ook
zonder actief evenement gebruiken.

## Beslissingen

| Onderwerp | Keuze |
|-----------|-------|
| State | `state.mededelingStijl`: `'kader'` (default, huidige look) of `'kaartje'` (oranje toegangskaart). |
| Beheer | Kaart **TEKSTEN**: twee pillen onder de mededeling (`data-act="mededelingStijl"`, args `kader`/`kaartje`), zelfde patroon als de scherm-variantkeuze. |
| Bord | Eén gedeelde helper `mededelingTicketHtml(text, raster)` voor de kaartje-stijl; raster en roterend kiezen op `d.mededelingStijl` tussen het bestaande kader en de kaart. |
| Precedentie | Ongewijzigd: bij een aankomend evenement wint de aanmeldingen-sticker het plekje rechtsboven (raster). De stijl bepaalt alleen hoe de mededeling zélf rendert wanneer die getoond wordt. |

## Kaartje-opmaak

Spiegelt `eventBadgeHtml`: vol oranje `#f4a259`, donkere tekst `#2c3e35`,
afgeronde hoeken, lichte tilt, slagschaduw. Links een "let op!"-stub, dan een
**gestippelde verticale scheiding** (de perforatie van een kaartje), dan de
mededelingstekst. Fontgroottes schalen met `raster` (compacter in de bovenbalk,
groter in de roterend-onderbalk), net als de bestaande twee kader-varianten.

## Geraakte bestanden

- `app/public/defles-data.js` — `mededelingStijl: 'kader'` in `DEFAULT_STATE` (+ regressietest dat de default klopt en deepMerge 'm behoudt).
- `app/public/tv/tv.js` — `mededelingTicketHtml`-helper; `mededelingTop` (raster) en `mededelingBlock` (roterend) kiezen op `d.mededelingStijl`.
- `app/public/admin/admin.js` — stijl-pillen in `cardTeksten`; `mededelingStijl`-actie in de dispatcher (string-arg, zoals `variant`).

## Buiten scope (YAGNI)

- Geen extra kleuren/stijlen (alleen kader + kaartje).
- Geen aparte stijl per layout-variant (één keuze geldt voor beide).
- De aanmeldingen-sticker en de event-precedentie blijven ongewijzigd.

## Verificatie

- Unit: `DEFAULT_STATE.mededelingStijl === 'kader'` + behoud na `deepMerge`.
- `node --check` op de drie bestanden; `node --test` groen.
- Handmatig: in het beheer wisselen tussen KADER/KAARTJE → bord toont de mededeling
  in de gekozen stijl, in beide layout-varianten; lege mededeling = verborgen.
