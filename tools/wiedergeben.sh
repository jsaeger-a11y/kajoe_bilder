#!/usr/bin/env bash
# tools/wiedergeben.sh – eine Wiedergabefassung erzeugen.
#
# Wird von der Weboberflaeche beim ersten Abspielen aufgerufen, laesst sich
# aber auch von Hand benutzen:
#
#   tools/wiedergeben.sh --quelle /data/.../x.mov --ziel /data/.../x-wiedergabe.mp4

set -euo pipefail

PROJEKT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON="$PROJEKT/ingest/.venv/bin/python"

[ -x "$PYTHON" ] || { echo '{"ok":false,"fehler":"ingest/.venv fehlt"}'; exit 1; }

exec "$PYTHON" "$PROJEKT/ingest/wiedergeben.py" "$@"
