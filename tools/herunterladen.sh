#!/usr/bin/env bash
# tools/herunterladen.sh – Datei oder Paket auf die Standardausgabe schreiben.
#
#   tools/herunterladen.sh einzeln --id 42 --art jpeg > bild.jpg
#   echo "1 2 3" | tools/herunterladen.sh paket --art jpeg --ordner "Kalender" > paket.zip
#
# Wird von der Weboberflaeche aufgerufen; die prueft die Berechtigung.

set -euo pipefail

PROJEKT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON="$PROJEKT/ingest/.venv/bin/python"

[ -x "$PYTHON" ] || { echo "ingest/.venv fehlt" >&2; exit 1; }

exec "$PYTHON" "$PROJEKT/ingest/herunterladen.py" "$@"
