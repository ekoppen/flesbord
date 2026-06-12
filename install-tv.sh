#!/usr/bin/env bash
# ============================================================================
# De Fles — zet de TV-app op een Chromecast met Google TV / Android TV.
#
# Draai dit op je Mac of Linux-computer (zelfde netwerk als de TV):
#   curl -fsSL https://raw.githubusercontent.com/ekoppen/flesbord/main/install-tv.sh | bash
#
# Het script haalt de APK van GitHub, zorgt voor ADB, begeleidt het koppelen
# (pairing) met de TV, installeert de app en start hem.
# ============================================================================
set -euo pipefail

REPO="${DEFLES_REPO:-ekoppen/flesbord}"
BRANCH="${DEFLES_BRANCH:-main}"
APK_URL="https://raw.githubusercontent.com/$REPO/$BRANCH/android-tv/defles-bord.apk"
PKG="nl.defles.bord"

msg()  { printf '\033[1;32m==>\033[0m %s\n' "$*"; }
note() { printf '\033[1;33m  ! \033[0m%s\n' "$*"; }
err()  { printf '\033[1;31mFOUT:\033[0m %s\n' "$*" >&2; exit 1; }
ask()  { local v; printf '\033[1;36m  ? \033[0m%s ' "$1" > /dev/tty; read -r v < /dev/tty; echo "$v"; }

# ---- 1. ADB regelen ----
if ! command -v adb >/dev/null 2>&1; then
  msg "ADB niet gevonden — installeren…"
  if [ "$(uname)" = "Darwin" ]; then
    command -v brew >/dev/null 2>&1 || err "Homebrew ontbreekt. Installeer ADB handmatig: brew install android-platform-tools"
    brew install --quiet android-platform-tools
  elif command -v apt-get >/dev/null 2>&1; then
    sudo apt-get update -qq && sudo apt-get install -y -qq adb
  else
    err "Kon ADB niet automatisch installeren — installeer 'adb' (Android platform-tools) en draai dit script opnieuw."
  fi
fi
adb start-server >/dev/null 2>&1 || true

# ---- 2. APK ophalen ----
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
msg "APK ophalen van github.com/$REPO…"
curl -fsSL "$APK_URL" -o "$TMP/defles-bord.apk" || err "Kon de APK niet downloaden ($APK_URL)."

# ---- 3. Verbinden met de TV ----
echo
msg "Voorbereiding op de Chromecast/Google TV (eenmalig):"
echo "    1. Instellingen → Systeem → Info → klik 7× op 'Android TV OS-build'"
echo "       (je ziet: 'Je bent nu ontwikkelaar')"
echo "    2. Instellingen → Systeem → Ontwikkelaarsopties"
echo "    3. Zet 'Foutopsporing via USB' aan, en — indien aanwezig —"
echo "       'Draadloze foutopsporing' (Wireless debugging)"
echo
TVIP="$(ask "Wat is het IP-adres van de TV? (Instellingen → Netwerk en internet):")"
[ -n "$TVIP" ] || err "Geen IP-adres opgegeven."

state_of() { adb devices | awk -v d="$1" '$1 == d { print $2 }'; }

DEV=""
# Eerst de klassieke route proberen (poort 5555, werkt op de meeste Android TV's)
msg "Verbinden met $TVIP:5555…"
adb disconnect >/dev/null 2>&1 || true
if adb connect "$TVIP:5555" 2>/dev/null | grep -q "connected"; then
  DEV="$TVIP:5555"
fi

# Lukt dat niet: pairing-route (Android 11+ / Chromecast met Google TV)
if [ -z "$DEV" ] || [ "$(state_of "$DEV")" = "" ]; then
  echo
  note "Directe verbinding lukte niet — we gaan koppelen (pairing)."
  echo "    Open op de TV: Ontwikkelaarsopties → Draadloze foutopsporing → AAN"
  echo "    Kies daar: 'Apparaat koppelen met koppelingscode'."
  echo "    Op de TV verschijnen nu een koppelingscode en een ip:poort."
  echo
  PAIR_ADDR="$(ask "Koppel-adres van dat scherm (ip:poort, bv. $TVIP:40123):")"
  PAIR_CODE="$(ask "Koppelingscode (6 cijfers):")"
  adb pair "$PAIR_ADDR" "$PAIR_CODE" || err "Koppelen mislukt — controleer code en adres en probeer opnieuw."
  echo
  echo "    Sluit het koppel-venster op de TV. Op het hoofdscherm van"
  echo "    'Draadloze foutopsporing' staat het gewone verbindings-ip:poort."
  CONN_ADDR="$(ask "Verbindingsadres (ip:poort, bv. $TVIP:42345):")"
  adb connect "$CONN_ADDR" >/dev/null 2>&1 || true
  DEV="$CONN_ADDR"
fi

# Wachten tot de TV de verbinding accepteert (popup op de TV)
msg "Wachten op toestemming van de TV…"
for i in $(seq 1 30); do
  ST="$(state_of "$DEV")"
  case "$ST" in
    device) break ;;
    unauthorized) [ "$i" = 1 ] && note "Bevestig de popup 'USB-foutopsporing toestaan?' op de TV (vink 'altijd toestaan' aan)." ;;
  esac
  sleep 2
done
[ "$(state_of "$DEV")" = "device" ] || err "Geen geautoriseerde verbinding met $DEV. Controleer de popup op de TV en draai het script opnieuw."

# ---- 4. Installeren en starten ----
msg "App installeren…"
adb -s "$DEV" install -r "$TMP/defles-bord.apk" >/dev/null || err "Installatie mislukt."
msg "App starten…"
adb -s "$DEV" shell am start -n "$PKG/.MainActivity" >/dev/null 2>&1 || true
adb disconnect "$DEV" >/dev/null 2>&1 || true

echo
msg "Klaar! 'De Fles' staat op de TV (ook in de app-rij op het startscherm)."
echo "    De app vraagt nu op de TV om het adres van het bord."
echo "    Vul daar het adres van je LXC in, bijvoorbeeld: http://192.168.1.x:8420/tv/"
echo "    (Adres later wijzigen: houd BACK lang ingedrukt in de app.)"
