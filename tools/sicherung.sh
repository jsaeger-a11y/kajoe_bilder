#!/usr/bin/env bash
#
# Taegliche Sicherung der Datenbank.
#
# Die Bilder sind ersetzbar – sie liegen weiter in OneDrive. Einmalig ist nur,
# was hier entsteht: Benutzer, Auswahllisten, Kategorien. Deshalb laeuft der
# pg_dump ab Phase 0 und nicht spaeter.
#
# Laeuft aus systemd (kajoe-sicherung.service) und von Hand. Mehrfach am Tag
# aufrufen ist unschaedlich: der Dateiname traegt die Uhrzeit.

set -euo pipefail

AUFBEWAHRUNG_TAGE=14
CONTAINER=kajoe_bilder_db

# Projektwurzel aus dem Ort dieses Skripts ableiten, nicht aus $PWD:
# systemd startet Dienste in einem beliebigen Verzeichnis.
PROJEKT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ZIEL="$PROJEKT/sicherung"

meldung() { printf '%s  %s\n' "$(date -u '+%Y-%m-%d %H:%M:%SZ')" "$*"; }
fehler()  { meldung "FEHLER: $*" >&2; exit 1; }

[ -r "$PROJEKT/.env" ] || fehler "$PROJEKT/.env fehlt oder ist nicht lesbar"
set -a; . "$PROJEKT/.env"; set +a
: "${POSTGRES_USER:?POSTGRES_USER fehlt in .env}"
: "${POSTGRES_DB:?POSTGRES_DB fehlt in .env}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD fehlt in .env}"

docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null | grep -qx true \
    || fehler "Container $CONTAINER laeuft nicht – keine Sicherung moeglich"

mkdir -p "$ZIEL"
chmod 700 "$ZIEL"

STEMPEL="$(date -u '+%Y%m%d-%H%M%S')"
DATEI="$ZIEL/kajoe_bilder-$STEMPEL.dump"
ROH="$DATEI.unfertig"

# Erst unter einem anderen Namen schreiben, dann umbenennen. Ein abgebrochener
# pg_dump darf nicht als gueltige Sicherung liegenbleiben – man merkt das sonst
# erst, wenn man sie braucht.
trap 'rm -f "$ROH"' EXIT

meldung "Sicherung nach $DATEI"
docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" "$CONTAINER" \
    pg_dump --format=custom --compress=6 \
            --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" \
    > "$ROH" || fehler "pg_dump abgebrochen"

[ -s "$ROH" ] || fehler "pg_dump lieferte eine leere Datei"

# Nicht nur auf den Rueckgabewert verlassen: pg_restore muss die Datei auch
# lesen koennen und das Grundschema muss darin vorkommen.
docker exec -i "$CONTAINER" pg_restore --list < "$ROH" > /dev/null 2>&1 \
    || fehler "Sicherung ist nicht lesbar (pg_restore --list)"
docker exec -i "$CONTAINER" pg_restore --list < "$ROH" 2>/dev/null \
    | grep -q 'TABLE .* bild ' \
    || fehler "Sicherung enthaelt die Tabelle 'bild' nicht"

mv "$ROH" "$DATEI"
trap - EXIT
chmod 600 "$DATEI"
meldung "fertig, $(du -h "$DATEI" | cut -f1)"

# Aufraeumen erst NACH einer geglueckten Sicherung. Andernfalls loescht eine
# Reihe fehlgeschlagener Laeufe nach und nach den gesamten Bestand.
ALT=$(find "$ZIEL" -maxdepth 1 -type f -name 'kajoe_bilder-*.dump' \
          -mtime "+$AUFBEWAHRUNG_TAGE" -print | wc -l)
if [ "$ALT" -gt 0 ]; then
    find "$ZIEL" -maxdepth 1 -type f -name 'kajoe_bilder-*.dump' \
         -mtime "+$AUFBEWAHRUNG_TAGE" -print -delete
    meldung "$ALT Sicherung(en) aelter als $AUFBEWAHRUNG_TAGE Tage geloescht"
fi

# Liegengebliebene Bruchstuecke abgebrochener Laeufe (z.B. nach einem Neustart
# mitten im Dump) nach einem Tag wegraeumen.
find "$ZIEL" -maxdepth 1 -type f -name 'kajoe_bilder-*.dump.unfertig' \
     -mtime +1 -print -delete

meldung "Bestand: $(find "$ZIEL" -maxdepth 1 -type f -name 'kajoe_bilder-*.dump' | wc -l) Sicherung(en), $(du -sh "$ZIEL" | cut -f1)"
