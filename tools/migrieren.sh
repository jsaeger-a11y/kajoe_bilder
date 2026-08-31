#!/usr/bin/env bash
# tools/migrieren.sh – offene Migrationen einspielen
#
# Spielt aus db/migrations/ genau die Dateien ein, die laut Tabelle
# migrationsstand noch nicht gelaufen sind – in Reihenfolge, jede in einer
# eigenen Transaktion, und traegt sie danach ein.
#
# Mehrfach aufrufbar: ein zweiter Lauf ohne neue Dateien tut nichts.

set -euo pipefail

PROJEKT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJEKT"

# shellcheck disable=SC1091
source .env

CONTAINER="${DB_CONTAINER:-kajoe_bilder-db-1}"
DB="${POSTGRES_DB:?POSTGRES_DB fehlt in .env}"
BENUTZER="${POSTGRES_USER:?POSTGRES_USER fehlt in .env}"

psql_still() {
    docker exec -i -e PGPASSWORD="$POSTGRES_PASSWORD" "$CONTAINER" \
        psql -U "$BENUTZER" -d "$DB" -tAq "$@"
}

# --- Vorbedingungen --------------------------------------------------------

# Kein `… | grep -q`: siehe tools/sicherung.sh – `grep -q` plus `pipefail`
# meldet einen Fehler, obwohl der Treffer da war.
if ! grep -qx "$CONTAINER" <<< "$(docker ps --format '{{.Names}}')"; then
    echo "FEHLER: Container '$CONTAINER' laeuft nicht." >&2
    exit 1
fi

if ! psql_still -c 'SELECT 1' >/dev/null 2>&1; then
    echo "FEHLER: keine Verbindung zur Datenbank '$DB'." >&2
    exit 1
fi

# Die Tabelle gehoert dem Einspielskript, nicht dem Anwendungsschema – sonst
# braeuchte man sie schon, um zu entscheiden, ob die Migration laufen darf,
# die sie anlegt.
psql_still -c "CREATE TABLE IF NOT EXISTS migrationsstand (
    nummer          TEXT        PRIMARY KEY,
    dateiname       TEXT        NOT NULL,
    pruefsumme      CHAR(64),
    eingespielt_am  TIMESTAMPTZ NOT NULL DEFAULT now(),
    dauer_ms        INTEGER
)" >/dev/null

TABELLE_DA=t

# --- Durchlauf -------------------------------------------------------------

EINGESPIELT=0
UEBERSPRUNGEN=0

for DATEI in db/migrations/[0-9][0-9][0-9]-*.sql; do
    [ -e "$DATEI" ] || { echo "Keine Migrationen gefunden."; exit 0; }

    NAME="$(basename "$DATEI")"
    NUMMER="${NAME%%-*}"
    SUMME="$(sha256sum "$DATEI" | cut -d' ' -f1)"

    if [ "$TABELLE_DA" = "t" ]; then
        STAND=$(psql_still -c \
            "SELECT pruefsumme FROM migrationsstand WHERE nummer = '$NUMMER'")

        GELAUFEN=$(psql_still -c \
             "SELECT 1 FROM migrationsstand WHERE nummer = '$NUMMER'")
        if [ -n "$STAND" ] || [ -n "$GELAUFEN" ]; then

            # Bereits gelaufen. Pruefsumme gegenpruefen, sofern eine da ist:
            # eine nachtraeglich geaenderte Migration laesst Datei und
            # Datenbank auseinanderlaufen, ohne dass es jemandem auffaellt.
            if [ -n "$STAND" ] && [ "$STAND" != "$SUMME" ]; then
                echo "FEHLER: $NAME wurde nach dem Einspielen geaendert." >&2
                echo "        erwartet: $STAND" >&2
                echo "        gefunden: $SUMME" >&2
                echo "        Bestehende Migrationen nicht aendern – neue Nummer anlegen." >&2
                exit 1
            fi

            UEBERSPRUNGEN=$((UEBERSPRUNGEN + 1))
            continue
        fi
    fi

    echo "→ $NAME"
    BEGINN=$(date +%s%3N)

    # ON_ERROR_STOP: ohne den Schalter meldet psql einen Fehler und macht
    # weiter – am Ende steht ein halbes Schema und der Rueckgabewert ist 0.
    if ! docker exec -i -e PGPASSWORD="$POSTGRES_PASSWORD" "$CONTAINER" \
            psql -U "$BENUTZER" -d "$DB" -v ON_ERROR_STOP=1 < "$DATEI"; then
        echo "FEHLER: $NAME ist gescheitert. Abbruch." >&2
        exit 1
    fi

    DAUER=$(( $(date +%s%3N) - BEGINN ))

    # Ab jetzt existiert die Tabelle in jedem Fall.
    TABELLE_DA=$(psql_still -c \
        "SELECT to_regclass('public.migrationsstand') IS NOT NULL")

    if [ "$TABELLE_DA" = "t" ]; then
        psql_still -c "INSERT INTO migrationsstand
                           (nummer, dateiname, pruefsumme, dauer_ms)
                       VALUES ('$NUMMER', '$NAME', '$SUMME', $DAUER)
                       ON CONFLICT (nummer) DO UPDATE
                           SET pruefsumme = EXCLUDED.pruefsumme,
                               dauer_ms   = EXCLUDED.dauer_ms" >/dev/null
    fi

    EINGESPIELT=$((EINGESPIELT + 1))
done

# --- Bericht ---------------------------------------------------------------

echo
echo "eingespielt:   $EINGESPIELT"
echo "uebersprungen: $UEBERSPRUNGEN"

# Gegenprobe ueber eine frische Abfrage: das Skript glaubt nicht seiner eigenen
# Buchfuehrung, sondern liest den Stand zurueck.
echo
echo "Stand laut Datenbank:"
psql_still -c "SELECT nummer || '  ' || dateiname ||
                      '  ' || to_char(eingespielt_am, 'YYYY-MM-DD HH24:MI')
               FROM migrationsstand ORDER BY nummer"
