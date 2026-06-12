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
msg "APK ophalen van github.com/${REPO}…"
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
TVIP_IN="$(ask "Wat is het IP-adres van de TV? (Instellingen → Netwerk en internet):")"
TVIP="${TVIP_IN%%:*}"   # eventueel meegetypte poort weghalen
[ -n "$TVIP" ] || err "Geen IP-adres opgegeven."

# Bij draadloze foutopsporing staat de TV onder zijn mDNS-naam in 'adb devices'
# en die naam kan spaties bevatten (bv. "...Ljhzzz (2)._adb-tls-connect._tcp").
# Daarom werken we met het transport_id (altijd een kaal nummer) en geven we
# straks 'adb -t <id>' door in plaats van de naam.
any_device() {
  adb devices -l | awk 'NR > 1 && / device / {
    if (match($0, /transport_id:[0-9]+/)) { print substr($0, RSTART + 13, RLENGTH - 13); exit }
  }'
}
any_unauthorized() { adb devices | awk -F"\t" 'NR > 1 && $2 == "unauthorized" { print $1; exit }'; }

DEV=""
wait_device() { # $1 = max seconden wachten
  local i hinted=""
  for i in $(seq 1 $(( ${1} / 2 ))); do
    DEV="$(any_device)"
    [ -n "$DEV" ] && return 0
    if [ -z "$hinted" ] && [ -n "$(any_unauthorized)" ]; then
      note "Bevestig de popup 'USB-foutopsporing toestaan?' op de TV (vink 'altijd toestaan' aan)."
      hinted=1
    fi
    # 'offline' komt voor bij een oude, hangende draadloze verbinding: forceer herverbinden
    adb reconnect offline >/dev/null 2>&1 || true
    # laat elke ~10 s zien wat adb ziet, zodat duidelijk is waar het op wacht
    if [ $(( i % 5 )) -eq 0 ]; then
      echo "    status volgens 'adb devices':"
      adb devices -l | sed -n '2,$p' | sed 's/^/      /'
    fi
    sleep 2
  done
  return 1
}

# Misschien is de TV al verbonden (bv. van een eerdere keer)
DEV="$(any_device)"

# Zo niet: eerst de klassieke route proberen (poort 5555)
if [ -z "$DEV" ]; then
  msg "Verbinden met $TVIP:5555…"
  adb connect "$TVIP:5555" >/dev/null 2>&1 || true
  wait_device 8 || true
fi

# Nog niet verbonden: route via 'Draadloze foutopsporing' (Chromecast/Google TV)
if [ -z "$DEV" ]; then
  echo
  note "Directe verbinding lukte niet — we gebruiken 'Draadloze foutopsporing'."
  echo "    Open op de TV: Ontwikkelaarsopties → Draadloze foutopsporing → AAN."
  echo "    Op dat scherm staat een verbindingsadres (ip:poort)."
  echo "    Is deze computer nog nooit gekoppeld? Druk dan zo Enter om eerst"
  echo "    te koppelen met een koppelingscode."
  echo
  CONN_ADDR="$(ask "Verbindingsadres (ip:poort — of Enter om eerst te koppelen):")"
  if [ -z "$CONN_ADDR" ]; then
    echo "    Kies op de TV: 'Apparaat koppelen met koppelingscode'."
    echo "    Er verschijnen nu een 6-cijferige code en een koppel-adres (ip:poort)."
    echo
    PAIR_ADDR="$(ask "Koppel-adres (ip:poort):")"
    PAIR_CODE="$(ask "Koppelingscode (6 cijfers):")"
    adb pair "$PAIR_ADDR" "$PAIR_CODE" || err "Koppelen mislukt — controleer code en adres en probeer opnieuw."
    echo
    echo "    Gelukt. Terug op het hoofdscherm van 'Draadloze foutopsporing'"
    echo "    staat het gewone verbindingsadres (andere poort dan het koppel-adres)."
    CONN_ADDR="$(ask "Verbindingsadres (ip:poort):")"
  fi
  echo "    adb zegt: $(adb connect "$CONN_ADDR" 2>&1)"
fi

# Wachten tot er een geautoriseerd apparaat is (popup op de TV)
if [ -z "$DEV" ]; then
  msg "Wachten op toestemming van de TV…"
  wait_device 60 || {
    echo
    echo "    Dit ziet adb op dit moment:"
    adb devices -l | sed 's/^/      /'
    err "Geen geautoriseerde verbinding gekregen. Tip: zet 'Draadloze foutopsporing' op de TV even UIT en weer AAN, en draai het script opnieuw."
  }
fi
MODEL="$(adb devices -l | awk -v t="transport_id:$DEV" 'index($0, t) { if (match($0, /model:[^ ]+/)) print substr($0, RSTART + 6, RLENGTH - 6) }')"
msg "Verbonden met: ${MODEL:-apparaat} (transport $DEV)"

# ---- 4. Installeren en starten ----
msg "App installeren…"
adb -t "$DEV" install -r "$TMP/defles-bord.apk" >/dev/null || err "Installatie mislukt."
msg "App starten…"
adb -t "$DEV" shell am start -n "$PKG/.MainActivity" >/dev/null 2>&1 || true

echo
msg "Klaar! 'De Fles' staat op de TV (ook in de app-rij op het startscherm)."
echo "    De app vraagt nu op de TV om het adres van het bord."
echo "    Vul daar het adres van je LXC in, bijvoorbeeld: http://192.168.1.x:8420/tv/"
echo "    (Adres later wijzigen: houd BACK lang ingedrukt in de app.)"
