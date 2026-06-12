#!/usr/bin/env bash
# ============================================================================
# De Fles — bar-dashboard: installatie/update in een Debian LXC met Docker.
#
# Gebruik (als root in de LXC):
#   curl -fsSL https://raw.githubusercontent.com/ekoppen/flesbord/main/install.sh | bash
#
# Is de repo privé? Geef dan een GitHub-token mee (fine-grained, alleen
# "Contents: read" op deze repo) — voor het ophalen van het script én de code:
#   curl -fsSL -H "Authorization: Bearer <token>" \
#     https://raw.githubusercontent.com/ekoppen/flesbord/main/install.sh \
#     | DEFLES_TOKEN=<token> bash
#
# Opnieuw draaien = updaten naar de nieuwste versie (data blijft staan).
# Instelbaar via omgevingsvariabelen:
#   DEFLES_DIR=/opt/defles   installatiemap
#   DEFLES_PORT=8420         poort op de LXC
#   DEFLES_TOKEN=...         GitHub-token voor een privé-repo
#   DEFLES_REPO / DEFLES_BRANCH  andere repo of branch
# ============================================================================
set -euo pipefail

REPO="${DEFLES_REPO:-ekoppen/flesbord}"
BRANCH="${DEFLES_BRANCH:-main}"
DIR="${DEFLES_DIR:-/opt/defles}"
PORT="${DEFLES_PORT:-8420}"

msg() { printf '\033[1;32m==>\033[0m %s\n' "$*"; }
err() { printf '\033[1;31mFOUT:\033[0m %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || err "Draai dit script als root (of met sudo)."
command -v curl >/dev/null 2>&1 || { apt-get update -qq && apt-get install -y -qq curl; }

# ---- Docker (hoort al in de LXC te zitten; zo niet, dan installeren we het) ----
if ! command -v docker >/dev/null 2>&1; then
  msg "Docker niet gevonden — installeren…"
  apt-get update -qq
  apt-get install -y -qq ca-certificates
  curl -fsSL https://get.docker.com | sh
fi
docker info >/dev/null 2>&1 || err "Docker draait niet (start de service: systemctl start docker)."

if ! docker compose version >/dev/null 2>&1; then
  msg "Docker Compose-plugin installeren…"
  apt-get update -qq
  apt-get install -y -qq docker-compose-plugin \
    || err "Kon docker-compose-plugin niet installeren — installeer hem handmatig en draai dit script opnieuw."
fi

# ---- Code ophalen ----
msg "Code ophalen van github.com/$REPO ($BRANCH)…"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
if [ -n "${DEFLES_TOKEN:-}" ]; then
  curl -fsSL -H "Authorization: Bearer $DEFLES_TOKEN" \
    "https://api.github.com/repos/$REPO/tarball/$BRANCH" | tar -xz -C "$TMP" --strip-components=1 \
    || err "Downloaden mislukt — klopt het token en bestaat github.com/$REPO (branch $BRANCH)?"
else
  curl -fsSL "https://github.com/$REPO/archive/refs/heads/$BRANCH.tar.gz" | tar -xz -C "$TMP" --strip-components=1 \
    || err "Downloaden mislukt — bestaat github.com/$REPO (branch $BRANCH) en is hij publiek? (privé: gebruik DEFLES_TOKEN)"
fi

mkdir -p "$DIR/data"
rm -rf "$DIR/app"
cp -a "$TMP/app" "$DIR/app"
cp -a "$TMP/docker-compose.yml" "$DIR/docker-compose.yml"

# Afwijkende poort? Dan de compose-mapping aanpassen.
if [ "$PORT" != "8420" ]; then
  sed -i "s/\"8420:8420\"/\"$PORT:8420\"/" "$DIR/docker-compose.yml"
fi

# ---- Bouwen en starten ----
cd "$DIR"
msg "Container bouwen en starten…"
docker compose up -d --build --remove-orphans
docker image prune -f >/dev/null 2>&1 || true

IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
IP="${IP:-<lxc-ip>}"
echo
msg "Klaar! De Fles draait."
echo "    TV-scherm:     http://$IP:$PORT/tv/"
echo "    Beheerscherm:  http://$IP:$PORT/admin/"
echo
echo "    Data & foto's:  $DIR/data   (meenemen = backup)"
echo "    Logs:           docker logs -f defles"
echo "    Updaten:        dit script gewoon opnieuw draaien"
