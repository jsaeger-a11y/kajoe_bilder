#!/usr/bin/env bash
# tools/benutzer.sh – Konten anlegen und verwalten.
#
#   tools/benutzer.sh liste
#   tools/benutzer.sh anlegen joerg verwalter
#   tools/benutzer.sh passwort joerg
#   tools/benutzer.sh abschalten gast
#
# Das erste Konto entsteht hier und nirgends sonst: es gibt keine offene
# Registrierung, und eine Webseite "ersten Verwalter anlegen" waere eine Tuer,
# die jemand findet, bevor sie geschlossen wird.
#
# Passwoerter werden abgefragt, nie als Argument uebergeben – Argumente stehen
# in der Shell-Geschichte und fuer jeden anderen Benutzer in `ps`.

set -euo pipefail

PROJEKT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE="$HOME/.local/node/bin/node"

[ -x "$NODE" ] || NODE="$(command -v node || true)"
[ -n "$NODE" ] && [ -x "$NODE" ] || { echo "FEHLER: node nicht gefunden." >&2; exit 1; }

exec "$NODE" --experimental-strip-types --no-warnings \
     "$PROJEKT/web/werkzeug/benutzer.ts" "$@"
