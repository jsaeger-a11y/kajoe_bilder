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
# Mehrfach aufrufbar; ein zweiter Lauf findet nichts mehr.
#
#   tools/aufraeumen.sh                 wirklich loeschen
#   tools/aufraeumen.sh --probe         nur sagen, was wegfiele (= --nur-zaehlen)
#   tools/aufraeumen.sh --timer         Modus aus der .env – so ruft der Timer auf
#   tools/aufraeumen.sh --hoechstens N  Obergrenze fuer diesen einen Lauf
#
# DER MODUS DES TIMERS STEHT IN DER .env, NICHT HIER:
#
#     AUFRAEUMEN_SCHARF=0   Probelauf (Vorgabe, auch wenn die Zeile fehlt)
#     AUFRAEUMEN_SCHARF=1   wirklich loeschen
#
# Die Umstellung auf scharf ist damit eine Zeile in der .env und kein Eingriff
# in Code oder Unit – und kein `daemon-reload`, den jemand vergisst. Ein Aufruf
# VON HAND behaelt seine bisherige Bedeutung: ohne Schalter wird geloescht.
#
# Jeder Lauf schreibt eine Zeile nach `aufraeumlauf`; `tools/status.sh` zeigt
# die letzten. Ein Vorgang, der unbeobachtet loescht, ist derselbe Fall wie
# eine ungetestete Sicherung.

set -euo pipefail

ANMELDEVERSUCH_TAGE=90

PROJEKT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJEKT"

# shellcheck disable=SC1091
set -a; . ./.env; set +a
CONTAINER="${DB_CONTAINER:-kajoe_bilder_db}"

# --- Modus bestimmen -------------------------------------------------------
nur_zaehlen=nein
ausloeser=hand
hoechstens=""

while [ $# -gt 0 ]; do
    case "$1" in
        --probe|--nur-zaehlen) nur_zaehlen=ja ;;
        --timer)
            ausloeser=timer
            # Fehlt die Zeile oder steht dort etwas anderes als 1, wird nur
            # gezaehlt. Die vorsichtige Richtung ist die Vorgabe.
            [ "${AUFRAEUMEN_SCHARF:-0}" = "1" ] || nur_zaehlen=ja
            ;;
        # Wird durchgereicht, nicht ausgewertet: die Grenze steht an EINER
        # Stelle, in ingest/aufraeumen.py. Dieser Schalter ist der Ausweg fuer
        # den einen Lauf, in dem die grosse Menge wirklich richtig ist – und er
        # muss hier durchkommen, weil die Abbruchmeldung ihn empfiehlt.
        --hoechstens)
            shift
            [ $# -gt 0 ] || { echo "--hoechstens braucht eine Zahl" >&2; exit 2; }
            hoechstens="$1"
            ;;
        *)  echo "Unbekannter Schalter: $1" >&2; exit 2 ;;
    esac
    shift
done

if [ "$nur_zaehlen" = ja ]; then modus=probe; else modus=scharf; fi

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

# Der Modus steht ganz oben und ganz unten. Wer den Bericht ueberfliegt, soll
# nicht raten muessen, ob gerade wirklich geloescht wurde.
if [ "$modus" = probe ]; then
    meldung "=== PROBELAUF – es wird gezaehlt, nichts entfernt ==="
else
    meldung "=== SCHARFER LAUF – Dateien werden wirklich entfernt ==="
fi

# --- Protokollzeile anlegen ------------------------------------------------
LAUF=$(psql_still -c "INSERT INTO aufraeumlauf (modus, ausloeser)
                      VALUES ('$modus', '$ausloeser') RETURNING id")
meldung "Lauf Nr. $LAUF ($modus, angestossen $ausloeser)"

# Bricht irgendetwas ab, bleibt die Zeile nicht ohne Ausgang stehen.
abschluss() {
    local schluss=$?
    if [ "$schluss" -ne 0 ]; then
        psql_still -c "UPDATE aufraeumlauf
                          SET beendet_am = now(),
                              ausgang = coalesce(ausgang, 'fehler'),
                              bemerkung = coalesce(bemerkung, 'Abbruch mit Rueckgabewert $schluss')
                        WHERE id = $LAUF" >/dev/null 2>&1 || true
    fi
}
trap abschluss EXIT

SITZUNGEN=$(psql_still -c "SELECT count(*) FROM sitzung WHERE laeuft_ab_am <= now()")
VERSUCHE=$(psql_still -c "SELECT count(*) FROM anmeldeversuch
                           WHERE zeitpunkt < now() - interval '$ANMELDEVERSUCH_TAGE days'")

meldung "abgelaufene Sitzungen:            $SITZUNGEN"
meldung "Anmeldeversuche aelter als ${ANMELDEVERSUCH_TAGE}d:  $VERSUCHE"

psql_still -c "UPDATE aufraeumlauf
                  SET sitzungen_faellig = $SITZUNGEN, versuche_faellig = $VERSUCHE
                WHERE id = $LAUF" >/dev/null

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
SCHLUSS=0
if [ -x "$PYTHON" ]; then
    ARG=(--lauf-id "$LAUF")
    # Kein `[ ... ] && ARG+=(...)`: schlaegt der Test fehl, gibt die ganze
    # Zeile 1 zurueck, und `set -e` beendet das Skript mitten im Lauf.
    if [ "$nur_zaehlen" = ja ]; then ARG+=(--probe); fi
    if [ -n "$hoechstens" ]; then ARG+=(--hoechstens "$hoechstens"); fi
    "$PYTHON" "$PROJEKT/ingest/aufraeumen.py" "${ARG[@]}" || SCHLUSS=$?
else
    echo "ingest/.venv fehlt – Dateien werden nicht aufgeraeumt" >&2
    psql_still -c "UPDATE aufraeumlauf SET bemerkung = 'ingest/.venv fehlt'
                    WHERE id = $LAUF" >/dev/null
fi

echo
if [ "$SCHLUSS" -eq 3 ]; then
    # Obergrenze ueberschritten. aufraeumen.py hat Ausgang und Bemerkung schon
    # gesetzt und NICHTS entfernt.
    psql_still -c "UPDATE aufraeumlauf SET beendet_am = now() WHERE id = $LAUF" >/dev/null
    meldung "=== ABGEBROCHEN an der Obergrenze – nichts entfernt ==="
    trap - EXIT
    exit 3
fi

if [ "$SCHLUSS" -ne 0 ]; then
    meldung "=== FEHLER beim Aufraeumen der Dateien (Rueckgabewert $SCHLUSS) ==="
    exit "$SCHLUSS"
fi

psql_still -c "UPDATE aufraeumlauf SET beendet_am = now(), ausgang = 'fertig'
                WHERE id = $LAUF" >/dev/null
trap - EXIT

if [ "$modus" = probe ]; then
    meldung "=== PROBELAUF beendet – es wurde nichts entfernt ==="
    meldung "    Scharf schalten: AUFRAEUMEN_SCHARF=1 in der .env"
else
    meldung "=== Scharfer Lauf beendet ==="
fi
