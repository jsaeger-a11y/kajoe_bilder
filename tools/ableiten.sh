#!/usr/bin/env bash
# tools/ableiten.sh – Vorschau- und Ansichtsbilder erzeugen.
#
# Reicht alle Argumente an ingest/ableiten.py durch:
#
#   tools/ableiten.sh --grenze 20
#   tools/ableiten.sh --erneut
#
# Video-Wiedergabefassungen entstehen hier NICHT, sondern erst beim ersten
# Abspielen.

set -euo pipefail

PROJEKT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON="$PROJEKT/ingest/.venv/bin/python"

[ -x "$PYTHON" ] || { echo "FEHLER: $PYTHON fehlt – siehe ingest/LIESMICH.md" >&2; exit 1; }
command -v ffmpeg >/dev/null || { echo "FEHLER: ffmpeg fehlt." >&2; exit 1; }

exec "$PYTHON" "$PROJEKT/ingest/ableiten.py" "$@"
