# De Fles — installatie & gebruik

Het ontwerp uit deze map is gebouwd als echt product:

```
app/          de webapp: TV-krijtbord + beheerscherm + mini-server (Node, geen dependencies)
android-tv/   de Android TV-app (kant-en-klare APK: defles-bord.apk)
install.sh    installatie in een Proxmox LXC (Debian + Docker) — zie 1a
```

## 1a. Hosten in een Proxmox LXC (aanbevolen)

In een Debian-LXC met Docker is installeren (én later updaten) één commando, als root:

```bash
curl -fsSL https://raw.githubusercontent.com/ekoppen/flesbord/main/install.sh | bash
```

> Staat de repo op privé? Maak hem publiek (`gh repo edit ekoppen/flesbord
> --visibility public`) of geef een GitHub-token mee:
> `DEFLES_TOKEN=<token>` — zie de toelichting bovenin `install.sh`.

Het script haalt de code van GitHub, bouwt het Docker-image en start de
container (poort **8420**, herstart automatisch, ook na een reboot van de LXC).
Daarna staat alles in `/opt/defles`; state en foto's overleven updates in
`/opt/defles/data`. Andere poort nodig? `DEFLES_PORT=80 bash install.sh`.

Logs bekijken: `docker logs -f defles`.

## 1b. Of: los draaien met Node

De server bewaart de gedeelde state (de TV en je telefoon zijn aparte apparaten)
en moet draaien op een apparaat dat altijd aanstaat en op je thuisnetwerk zit.
Zonder Docker is alleen Node 18+ nodig:

```bash
cd app
npm start          # of: node server.js
```

De server meldt zelf de adressen, bijvoorbeeld:

```
De Fles draait!
  TV-scherm:    http://192.168.1.10:8420/tv/
  Beheerscherm: http://192.168.1.10:8420/admin/
```

- **Beheerscherm** open je op je telefoon of laptop. Alles slaat direct op en
  verschijnt binnen ~2 seconden op de TV (live via server-push).
- Data staat in `app/data/` (state + geüploade foto's) — dat mapje meenemen = backup.
- Andere poort: `PORT=3000 node server.js`.

**Automatisch starten op je Mac** (optioneel): Systeeminstellingen →
Algemeen → Inloggen → voeg een script toe, of gebruik `pm2`/`launchd`.
Op een Raspberry Pi: `pm2 start server.js --name defles && pm2 save`.

## 2. De app op je Chromecast (Google TV) zetten

**Makkelijkst — met het installscript** (op je Mac of Linux, zelfde netwerk als de TV):

```bash
curl -fsSL https://raw.githubusercontent.com/ekoppen/flesbord/main/install-tv.sh | bash
```

Het script regelt ADB, haalt de APK van GitHub, begeleidt het koppelen met de
TV (inclusief de koppelingscode van "Draadloze foutopsporing"), installeert de
app en start hem. Zet vooraf eenmalig de ontwikkelaarsopties aan op de TV
(het script legt precies uit hoe).

De kant-en-klare APK staat ook los in `android-tv/defles-bord.apk`. Handmatig
installeren kan op twee manieren:

**Via een installer-app:**
1. Installeer op de Chromecast de app **"Send files to TV"** (Play Store) en op
   je telefoon ook; stuur `defles-bord.apk` naar de TV en open hem daar.
   (Sta "onbekende bronnen" toe als de TV erom vraagt.)

**Of via ADB vanaf je Mac:**
1. Op de Chromecast: Instellingen → Systeem → Info → klik 7× op "Android TV OS-build"
   (ontwikkelaarsopties aan) → Ontwikkelaarsopties → **USB-foutopsporing/Netwerk-debugging aan**.
2. Op je Mac (TV-IP staat in Instellingen → Netwerk):
   ```bash
   adb connect <tv-ip>
   adb install -r android-tv/defles-bord.apk
   ```

**Gebruik van de app:**
- Bij de eerste start vraagt de app het adres van het bord:
  vul `http://<server-ip>:8420/tv/` in (het adres dat de server meldt).
- Het scherm blijft automatisch aan; de app herstelt zelf als de server even weg is.
- Afstandsbediening: **BACK lang indrukken** = adres wijzigen ·
  **BACK 2× kort** = app afsluiten.
- De app start (waar Android dat toestaat) automatisch mee als de TV opstart.

Opnieuw bouwen na een wijziging: `android-tv/build-apk.sh` (gebruikt je
Android SDK + JDK, geen Android Studio nodig).

> Heb je een **oude Chromecast zonder Google TV**, dan kun je geen apps
> installeren — cast dan een tabblad met de TV-pagina vanuit Chrome.

## 3. Koppelingen

- **Weer** (Open-Meteo) en **WK-schema/stand** (TheSportsDB) werken meteen,
  zonder account. WK ververst elk half uur; in beheer kun je handmatig
  "NU OPHALEN" doen. Met de gratis sleutel "123" is de data soms beperkt;
  een eigen (goedkope) TheSportsDB-sleutel geeft het volledige schema.
- **Volumio**: vul het adres in (bv. `volumio.local`) en druk op TEST.
  De server moet op hetzelfde netwerk zitten als Volumio.
- **Spotify**: maak gratis een app aan op developer.spotify.com, plak de
  Client ID in het beheerscherm en voeg daar de getoonde redirect-URI toe.
  **Let op:** Spotify accepteert alleen `http://127.0.0.1:…` als redirect —
  doe het verbinden dus één keer in een browser op de computer waarop de
  server draait, via `http://127.0.0.1:8420/admin/`. Daarna werkt het overal:
  de tokens staan in de gedeelde state en de TV gebruikt ze zelf.

## 4. Evenementen & uitnodigingen (bar-avondjes plannen)

In het beheerscherm staat een generieke **Evenementen**-kaart: maak een avond
aan (WK-wedstrijd, feest, wat dan ook), en gasten laten via een link hun naam,
met hoeveel ze komen en een opmerking achter. Jij ziet in beheer wie er komt;
op de TV staat optioneel een teller ("wie komen er? 12").

- **Deelbare link** — elk evenement heeft een geheime link (met token). Plak die
  in je WhatsApp-/Discord-groep; gasten openen 'm en melden zich aan. Geen
  mailserver nodig.
- **E-mail uitnodigen** (optioneel) — vul bij het evenement e-mailadressen in en
  klik "Verstuur uitnodigingen". Hiervoor stel je eenmalig de **Mailserver**-kaart
  in (SMTP-server, poort, gebruiker/wachtwoord, afzender) plus het **publieke
  adres** (zie hieronder). Knop **TEST** stuurt een testmail.
- **Teller op TV** en **aanmelden gesloten** zet je per evenement aan/uit.

De mailgegevens worden los van de rest opgeslagen (`app/data/mail.json`) en
komen nooit op de TV of de publieke pagina terecht.

## 5. De RSVP-pagina veilig naar buiten zetten

Gasten reageren meestal van afstand, dus de **RSVP-pagina moet vanaf internet
bereikbaar zijn**. Zet daarbij **alleen** de publieke paden naar buiten —
`/e/…` en `/api/rsvp/…` — en houd de rest (beheer, `/api/state`, mail) op je
eigen netwerk. Doe dat met een reverse proxy die alleen die paden doorlaat.

De app serveert zelf een nette **placeholder** op `/welcome.html` en een
**`/health`**-endpoint voor health-checks. De truc: laat de proxy alléén de
publieke paden (`/e/…`, `/api/rsvp/…`, `/welcome.html`, `/health`) door naar de
app, en stuur al het overige (ook `/admin`, `/api/state`) naar de placeholder.

**Traefik** (docker-compose labels op de De Fles-container; pas host en
certresolver aan):
```yaml
labels:
  - traefik.enable=true
  # Publieke paden → de app
  - "traefik.http.routers.defles.rule=Host(`defles.doorkoppen.nl`) && (PathPrefix(`/e`) || PathPrefix(`/api/rsvp`) || Path(`/welcome.html`) || Path(`/health`))"
  - traefik.http.routers.defles.entrypoints=websecure
  - traefik.http.routers.defles.tls.certresolver=le
  - traefik.http.routers.defles.service=defles
  - traefik.http.services.defles.loadbalancer.server.port=8420
  # Health-check op /health
  - traefik.http.services.defles.loadbalancer.healthcheck.path=/health
  - traefik.http.services.defles.loadbalancer.healthcheck.interval=30s
  # Al het overige → placeholder (lagere prioriteit, herschrijft naar /welcome.html)
  - "traefik.http.routers.defles-rest.rule=Host(`defles.doorkoppen.nl`)"
  - traefik.http.routers.defles-rest.entrypoints=websecure
  - traefik.http.routers.defles-rest.tls.certresolver=le
  - traefik.http.routers.defles-rest.priority=1
  - traefik.http.routers.defles-rest.service=defles
  - traefik.http.routers.defles-rest.middlewares=defles-welcome
  - traefik.http.middlewares.defles-welcome.replacepath.path=/welcome.html
```
(De container moet in hetzelfde Docker-netwerk als Traefik zitten.)

**Traefik — De Fles op een aparte LXC** (Traefik elders): gebruik de
file/dynamic provider. Het **doeladres is host:poort, zónder pad**; `/welcome.html`
komt van de middleware, `/health` is de aparte healthcheck:
```yaml
http:
  routers:
    defles:
      rule: "Host(`defles.doorkoppen.nl`) && (PathPrefix(`/e`) || PathPrefix(`/api/rsvp`) || Path(`/welcome.html`) || Path(`/health`))"
      entryPoints: [websecure]
      service: defles
      tls: { certResolver: le }
    defles-rest:                       # al het overige → placeholder
      rule: "Host(`defles.doorkoppen.nl`)"
      priority: 1
      entryPoints: [websecure]
      service: defles
      middlewares: [defles-welcome]
      tls: { certResolver: le }
  middlewares:
    defles-welcome:
      replacePath: { path: /welcome.html }
  services:
    defles:
      loadBalancer:
        servers:
          - url: "http://192.168.178.205:8420"   # alleen host:poort, GEEN /welcome.html
        healthCheck:
          path: /health
          interval: 30s
```

**Caddy** (alternatief):
```
defles.doorkoppen.nl {
    @public path /e/* /api/rsvp/* /welcome.html /health
    handle @public { reverse_proxy 192.168.1.10:8420 }
    handle { rewrite * /welcome.html; reverse_proxy 192.168.1.10:8420 }
}
```

**nginx** (alternatief):
```
server {
    server_name defles.doorkoppen.nl;
    location ~ ^/(e/|api/rsvp/|welcome\.html|health) {
        proxy_pass http://192.168.1.10:8420;
        proxy_set_header X-Forwarded-For $remote_addr;
    }
    location / { rewrite ^ /welcome.html break; proxy_pass http://192.168.1.10:8420; }
}
```

Stel daarna in de **Mailserver**-kaart het **publieke adres** in
(`https://defles.doorkoppen.nl`); dat adres wordt gebruikt voor de links in
de mails én voor de "deelbare link"-knop. Een Cloudflare Tunnel met dezelfde
pad-regels werkt ook.

> De RSVP-endpoints zijn token-afgeschermd (een onjuiste link geeft 404) en
> hebben rate-limiting tegen misbruik. Het beheer zelf heeft bewust geen login;
> daarom mag dat deel niet mee naar buiten.

## 6. Veiligheid

De server heeft bewust geen login (bar in je eigen tuinhuis, eigen netwerk).
Zet het **beheer** dus niet zomaar open naar internet — alleen de RSVP-paden
(zie hierboven). Wil je zelf overal bij het beheer kunnen, gebruik dan bv.
Tailscale of een VPN naar je thuisnetwerk.
