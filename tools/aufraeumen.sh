#!/usr/bin/env bash
# tools/aufraeumen.sh – abgelaufene Sitzungen und alte Anmeldeversuche entfernen.
#
# IP-Adressen sind personenbezogene Daten. Nach 90 Tagen faellt der
# Anmeldeversuch weg, mit ihm die Adresse. Abgelaufene Sitzungen liegen ohnehin
# nur noch herum.
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

docker ps --format '{{.Names}}' | grep -qx "$CONTAINER" \
    || { echo "FEHLER: Container $CONTAINER laeuft nicht." >&2; exit 1; }

meldung() { printf '%s  %s\n' "$(date -u '+%Y-%m-%d %H:%M:%SZ')" "$*"; }

SITZUNGEN=$(psql_still -c "SELECT count(*) FROM sitzung WHERE laeuft_ab_am <= now()")
VERSUCHE=$(psql_still -c "SELECT count(*) FROM anmeldeversuch
                           WHERE zeitpunkt < now() - interval '$ANMELDEVERSUCH_TAGE days'")

meldung "abgelaufene Sitzungen:            $SITZUNGEN"
meldung "Anmeldeversuche aelter als ${ANMELDEVERSUCH_TAGE}d:  $VERSUCHE"

if [ "$nur_zaehlen" = ja ]; then
    meldung "nur gezaehlt, nichts geloescht"
    exit 0
fi

if [ "$SITZUNGEN" -gt 0 ]; then
    psql_still -c "DELETE FROM sitzung WHERE laeuft_ab_am <= now()" >/dev/null
    meldung "$SITZUNGEN Sitzung(en) entfernt"
fi

if [ "$VERSUCHE" -gt 0 ]; then
    psql_still -c "DELETE FROM anmeldeversuch
                    WHERE zeitpunkt < now() - interval '$ANMELDEVERSUCH_TAGE days'" >/dev/null
    meldung "$VERSUCHE Anmeldeversuch(e) entfernt"
fi

# Gegenprobe ueber eine frische Abfrage: das Skript glaubt nicht seiner eigenen
# Buchfuehrung, sondern liest den Stand zurueck.
meldung "Stand: $(psql_still -c "SELECT count(*) FROM sitzung") Sitzung(en), \
$(psql_still -c "SELECT count(*) FROM anmeldeversuch") Anmeldeversuch(e)"
