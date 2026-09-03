#!/usr/bin/env bash
# tools/gesichter.sh – Gesichter finden und gruppieren (Phase 9a).
#
#   tools/gesichter.sh                       alle noch nicht bearbeiteten Bilder
#   tools/gesichter.sh --grenze 5000         hoechstens so viele (Pilot)
#   tools/gesichter.sh --nur-gruppieren      nichts erkennen, nur Haeufchen bilden
#   tools/gesichter.sh --neu-gruppieren      ALLE Haeufchen verwerfen und neu bilden
#   tools/gesichter.sh --nur-bericht         Bericht und Bildbelege, sonst nichts
#
# Von Hand, kein Timer, kein Knopf – das kommt spaeter, wenn die Zahlen
# ueberzeugen. Nur einer gleichzeitig (flock), wie beim Verarbeiten.
#
# Alles rechnet lokal auf dem Prozessor. Kein Bild verlaesst den Server.

set -euo pipefail

PROJEKT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJEKT"

PYTHON="$PROJEKT/ingest/.venv/bin/python"
[ -x "$PYTHON" ] || { echo "FEHLER: ingest/.venv fehlt" >&2; exit 1; }

SPERRE=/data/kajoe_bilder/.sperre-gesichter
exec 9>"$SPERRE" || { echo "Sperrdatei nicht zu oeffnen: $SPERRE" >&2; exit 1; }
if ! flock -n 9; then
    echo "Es laeuft bereits ein Gesichterlauf – nichts zu tun." >&2
    exit 0
fi

# onnxruntime nimmt sich sonst alle zwoelf Kerne und laesst der Weboberflaeche
# und dem Ingest nichts. Zehn reichen; die Messung am Piloten sagt, was es kostet.
export OMP_NUM_THREADS="${OMP_NUM_THREADS:-10}"

exec "$PYTHON" "$PROJEKT/ingest/gesichter.py" "$@"
