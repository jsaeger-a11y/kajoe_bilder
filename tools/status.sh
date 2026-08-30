#!/usr/bin/env bash
#
# Ueberblick: Container, Tabellenzeilen, Plattenplatz, letzte Sicherung.
# Nur lesend – aendert nichts und kann jederzeit laufen.

set -uo pipefail

CONTAINER=kajoe_bilder_db
DATEN=/data/kajoe_bilder

PROJEKT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ZIEL="$PROJEKT/sicherung"

titel() { printf '\n\033[1m%s\033[0m\n' "$1"; }

# ---------------------------------------------------------------------------
titel "Container"

if ! docker inspect "$CONTAINER" >/dev/null 2>&1; then
    echo "  $CONTAINER ist nicht angelegt – 'docker compose up -d' fehlt"
    LAEUFT=nein
else
    ZUSTAND=$(docker inspect -f '{{.State.Status}}' "$CONTAINER")
    GESUND=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}ohne Pruefung{{end}}' "$CONTAINER")
    SEIT=$(docker inspect -f '{{.State.StartedAt}}' "$CONTAINER")
    NEUSTART=$(docker inspect -f '{{.HostConfig.RestartPolicy.Name}}' "$CONTAINER")
    printf '  %-14s %s (%s), seit %s\n' "$CONTAINER" "$ZUSTAND" "$GESUND" "${SEIT:0:19}"
    printf '  %-14s %s\n' "Neustart" "$NEUSTART"
    # Die Bindung ist sicherheitsrelevant: steht hier 0.0.0.0, ist der Port am
    # ufw vorbei im ganzen Netz offen.
    BINDUNG=$(docker inspect -f '{{range $p, $c := .NetworkSettings.Ports}}{{range $c}}{{.HostIp}}:{{.HostPort}} {{end}}{{end}}' "$CONTAINER")
    printf '  %-14s %s' "Port" "$BINDUNG"
    case "$BINDUNG" in
        127.0.0.1:*) printf ' – nur lokal, richtig\n' ;;
        *)           printf ' – ACHTUNG: nicht auf 127.0.0.1 gebunden\n' ;;
    esac
    [ "$ZUSTAND" = running ] && LAEUFT=ja || LAEUFT=nein
fi

# ---------------------------------------------------------------------------
titel "Datenbank"

if [ "$LAEUFT" != ja ]; then
    echo "  uebersprungen – Container laeuft nicht"
elif [ ! -r "$PROJEKT/.env" ]; then
    echo "  uebersprungen – $PROJEKT/.env fehlt"
else
    set -a; . "$PROJEKT/.env"; set +a
    docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" "$CONTAINER" \
        psql -qAt -F$'\t' -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "
            SELECT relname, n_live_tup
              FROM pg_stat_user_tables
             ORDER BY relname;" 2>/dev/null \
    | while IFS=$'\t' read -r tabelle zeilen; do
          printf '  %-18s %10s\n' "$tabelle" "$zeilen"
      done

    GROESSE=$(docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" "$CONTAINER" \
        psql -qAt -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
        -c "SELECT pg_size_pretty(pg_database_size('$POSTGRES_DB'));" 2>/dev/null)
    printf '  %-18s %10s\n' "(Datenbank gesamt)" "$GROESSE"
    echo "  Hinweis: n_live_tup ist eine Schaetzung des Planers, kein COUNT(*)."
fi

# ---------------------------------------------------------------------------
titel "Plattenplatz"

df -h --output=target,size,used,avail,pcent / "$DATEN" 2>/dev/null \
    | sed 's/^/  /'

VOL=$(docker volume inspect kajoe_bilder_db -f '{{.Mountpoint}}' 2>/dev/null)
if [ -n "$VOL" ]; then
    # Auf das Volume kommt man ohne root nicht drauf; dann bleibt die Angabe
    # der Datenbank oben.
    BELEGT=$(du -sh "$VOL" 2>/dev/null | cut -f1)
    printf '  %-24s %s\n' "Volume kajoe_bilder_db" "${BELEGT:-nur als root lesbar}"
fi

# ---------------------------------------------------------------------------
titel "Sicherung"

LETZTE=$(find "$ZIEL" -maxdepth 1 -type f -name 'kajoe_bilder-*.dump' 2>/dev/null \
         -printf '%T@ %p\n' | sort -rn | head -1 | cut -d' ' -f2-)

if [ -z "$LETZTE" ]; then
    echo "  keine Sicherung vorhanden – tools/sicherung.sh ausfuehren"
else
    ALTER_S=$(( $(date +%s) - $(stat -c %Y "$LETZTE") ))
    printf '  %-14s %s\n' "letzte"   "$(basename "$LETZTE")"
    printf '  %-14s %s, %s alt\n' "" "$(du -h "$LETZTE" | cut -f1)" \
           "$(printf '%dh %dm' $((ALTER_S/3600)) $(((ALTER_S%3600)/60)))"
    printf '  %-14s %s Datei(en), %s\n' "Bestand" \
           "$(find "$ZIEL" -maxdepth 1 -type f -name 'kajoe_bilder-*.dump' | wc -l)" \
           "$(du -sh "$ZIEL" | cut -f1)"
    # Aelter als 26 Stunden heisst: der Timer hat mindestens einen Lauf
    # ausgelassen. Das faellt sonst erst auf, wenn man die Sicherung braucht.
    [ "$ALTER_S" -gt 93600 ] && echo "  ACHTUNG: aelter als 26 Stunden – Timer pruefen"
fi

printf '  %-14s %s\n' "Linger" "$(loginctl show-user "$USER" -p Linger --value 2>/dev/null)"
if systemctl --user list-unit-files kajoe-sicherung.timer >/dev/null 2>&1; then
    printf '  %-14s %s / %s\n' "Timer" \
        "$(systemctl --user is-enabled kajoe-sicherung.timer 2>&1)" \
        "$(systemctl --user is-active  kajoe-sicherung.timer 2>&1)"
    systemctl --user list-timers --all kajoe-sicherung.timer --no-pager 2>/dev/null \
        | sed -n '2p' | sed 's/^/  naechster Lauf: /'
else
    echo "  Timer        nicht eingerichtet – siehe systemd/LIESMICH.md"
fi
echo
