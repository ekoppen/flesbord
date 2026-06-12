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

## 4. Veiligheid

De server heeft bewust geen login (bar in je eigen tuinhuis, eigen netwerk).
Zet hem dus niet zomaar open naar internet; wil je er buitenshuis bij, gebruik
dan bv. Tailscale of een VPN naar je thuisnetwerk.
