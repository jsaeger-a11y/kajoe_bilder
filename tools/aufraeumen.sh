#!/usr/bin/env bash
# tools/aufraeumen.sh – der Aufraeumlauf.
#
# Drei Dinge:
#   1. abgelaufene Sitzungen entfernen
#   2. Anmeldeversuche aelter als 90 Tage entfernen – IP-Adressen sind
#      personenbezogene Daten
#   3. Dateien zu Bildern, die laenger als 30 Tage vorgemerkt sind, entfernen
#      (ingest/aufraeumen.py). Die ZEILEN bleiben stehen: sie sind der
#      Grabstein, an dem der naechste Ingest erkennt, dass die Datei schon
#      einmal da war.
#
# Mehrfach aufrufbar; ein zweiter Lauf findet nichts mehr. Ein Timer kommt
# spaeter, wenn der Lauf ueber Wochen erprobt ist.
#
#   tools/aufraeumen.sh              wirklich loeschen
#   tools/aufraeumen.sh --nur-zaehlen  nur sagen, was wegfiele

set -euo pipefail

ANMELDEVERSUCH_TAGE=90

PROJEKT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJEKT"

# shellcheck disable=SC1091
set -a; . ./.env; set +a
CONTAINER="${DB_CONTAINER:-kajoe_bilder_db}"

nur_zaehlen=nein
[ "${1:-}" = "--nur-zaehlen" ] && nur_zaehlen=ja

psql_still() {
    docker exec -i -e PGPASSWORD="$POSTGRES_PASSWORD" "$CONTAINER" \
        psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAq -v ON_ERROR_STOP=1 "$@"
}

# Kein `docker ps | grep -q`: `grep -q` steigt beim ersten Treffer aus, der
# Erzeuger bekommt SIGPIPE, und `set -o pipefail` macht daraus einen
# Fehlschlag der ganzen Leitung – obwohl der Treffer da war. Bei kurzen
# Ausgaben faellt es nie auf, bis es das eines Tages tut.
grep -qx "$CONTAINER" <<< "$(docker ps --format '{{.Names}}')" \
    || { echo "FEHLER: Container $CONTAINER laeuft nicht." >&2; exit 1; }

meldung() { printf '%s  %s\n' "$(date -u '+%Y-%m-%d %H:%M:%SZ')" "$*"; }

SITZUNGEN=$(psql_still -c "SELECT count(*) FROM sitzung WHERE laeuft_ab_am <= now()")
VERSUCHE=$(psql_still -c "SELECT count(*) FROM anmeldeversuch
                           WHERE zeitpunkt < now() - interval '$ANMELDEVERSUCH_TAGE days'")

meldung "abgelaufene Sitzungen:            $SITZUNGEN"
meldung "Anmeldeversuche aelter als ${ANMELDEVERSUCH_TAGE}d:  $VERSUCHE"

if [ "$nur_zaehlen" = ja ]; then
    meldung "nur gezaehlt, nichts geloescht"
fi

if [ "$nur_zaehlen" = nein ] && [ "$SITZUNGEN" -gt 0 ]; then
    psql_still -c "DELETE FROM sitzung WHERE laeuft_ab_am <= now()" >/dev/null
    meldung "$SITZUNGEN Sitzung(en) entfernt"
fi

if [ "$nur_zaehlen" = nein ] && [ "$VERSUCHE" -gt 0 ]; then
    psql_still -c "DELETE FROM anmeldeversuch
                    WHERE zeitpunkt < now() - interval '$ANMELDEVERSUCH_TAGE days'" >/dev/null
    meldung "$VERSUCHE Anmeldeversuch(e) entfernt"
fi

# Gegenprobe ueber eine frische Abfrage: das Skript glaubt nicht seiner eigenen
# Buchfuehrung, sondern liest den Stand zurueck.
meldung "Stand: $(psql_still -c "SELECT count(*) FROM sitzung") Sitzung(en), \
$(psql_still -c "SELECT count(*) FROM anmeldeversuch") Anmeldeversuch(e)"

# --- Dateien vorgemerkter Bilder ------------------------------------------
echo
PYTHON="$PROJEKT/ingest/.venv/bin/python"
if [ -x "$PYTHON" ]; then
    if [ "$nur_zaehlen" = ja ]; then
        "$PYTHON" "$PROJEKT/ingest/aufraeumen.py" --nur-zaehlen
    else
        "$PYTHON" "$PROJEKT/ingest/aufraeumen.py"
    fi
else
    echo "ingest/.venv fehlt – Dateien werden nicht aufgeraeumt" >&2
fi
