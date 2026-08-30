#!/usr/bin/env bash
# tools/einlesen.sh – Ingest anstossen.
#
# Aktiviert die .venv des Ingest und reicht alle Argumente durch:
#
#   tools/einlesen.sh --trockenlauf
#   tools/einlesen.sh --grenze 50
#
# Bewusst noch KEIN systemd-Timer: der Lauf wird erst von Hand ueber mehrere
# Jahrgaenge erprobt.

set -euo pipefail

PROJEKT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON="$PROJEKT/ingest/.venv/bin/python"

[ -x "$PYTHON" ] || {
    echo "FEHLER: $PYTHON fehlt. Einrichten:" >&2
    echo "        python3 -m venv --without-pip ingest/.venv" >&2
    echo "        siehe ingest/LIESMICH.md" >&2
    exit 1
}

command -v exiftool >/dev/null || { echo "FEHLER: exiftool fehlt." >&2; exit 1; }

exec "$PYTHON" "$PROJEKT/ingest/lauf.py" "$@"
