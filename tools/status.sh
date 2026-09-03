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

    # --- Die entscheidende Pruefung ---------------------------------------
    # Alles darueber lief ueber `docker exec`, also ueber den Unix-Socket im
    # Container – und dort gilt `trust`: das Passwort wird gar nicht geprueft.
    # Die Anwendung kommt aber von aussen ueber 127.0.0.1:5432 und muss sich
    # ausweisen. Am 31.08.2026 stimmte das Passwort dort nicht mehr, die ganze
    # Anwendung war unten, und nichts davon fiel auf: die Anmeldeseite ist die
    # einzige Seite, die ohne Datenbank rendert.
    #
    # Deshalb hier eine ECHTE Abfrage auf dem Weg der Anwendung.
    PYTHON="$PROJEKT/ingest/.venv/bin/python"
    if [ -x "$PYTHON" ]; then
        ANTWORT=$(KAJOE_INGEST="$PROJEKT/ingest" "$PYTHON" - <<'PY' 2>&1
import os, sys
sys.path.insert(0, os.environ["KAJOE_INGEST"])
try:
    from datenbank import verbindung
    with verbindung() as c, c.cursor() as k:
        k.execute("SELECT count(*) FROM bild")
        print(f"ok {k.fetchone()[0]}")
except Exception as fehler:
    print(f"FEHLER {type(fehler).__name__}: {str(fehler).strip().splitlines()[0][:90]}")
PY
        )
        case "$ANTWORT" in
            ok\ *) printf '  %-18s %s\n' "Zugang der Anwendung" \
                        "ueber 127.0.0.1:5432 mit Passwort – ok (${ANTWORT#ok } Zeilen in bild)" ;;
            *)     printf '  %-18s %s\n' "Zugang der Anwendung" "$ANTWORT"
                   echo "  ACHTUNG: die Anwendung kommt NICHT an die Datenbank." ;;
        esac
    else
        echo "  Zugang der Anwendung nicht geprueft – ingest/.venv fehlt"
    fi
fi

# ---------------------------------------------------------------------------
titel "Weboberflaeche"

if systemctl --user list-unit-files kajoe-web.service >/dev/null 2>&1; then
    printf '  %-14s %s / %s\n' "Dienst" \
        "$(systemctl --user is-enabled kajoe-web.service 2>&1)" \
        "$(systemctl --user is-active  kajoe-web.service 2>&1)"
else
    echo "  Dienst         nicht eingerichtet – siehe systemd/LIESMICH.md"
fi

# Die Bindung ist sicherheitsrelevant wie beim Datenbankport: steht hier
# 0.0.0.0, ist die Oberflaeche am ufw vorbei im ganzen Netz erreichbar.
WEBPORT=$(ss -tlnH 'sport = :3000' 2>/dev/null | awk '{print $4}' | head -1)
if [ -n "$WEBPORT" ]; then
    printf '  %-14s %s' "Port" "$WEBPORT"
    case "$WEBPORT" in
        127.0.0.1:*) printf ' – nur lokal, richtig\n' ;;
        *)           printf ' – ACHTUNG: nicht auf 127.0.0.1 gebunden\n' ;;
    esac
else
    printf '  %-14s %s\n' "Port" "niemand hoert auf 3000"
fi

# COOKIE_SECURE steht in der .env; ohne Eintrag gilt die Vorgabe im Code (an).
SICHER=$(grep -E '^COOKIE_SECURE=' "$PROJEKT/.env" 2>/dev/null | tail -1 | cut -d= -f2)
case "${SICHER:-1}" in
    0) printf '  %-14s %s\n' "COOKIE_SECURE" "0 – Sitzungscookie OHNE Secure, nur fuers LAN gedacht" ;;
    *) printf '  %-14s %s\n' "COOKIE_SECURE" "${SICHER:-1 (Vorgabe)} – Sitzungscookie mit Secure" ;;
esac

if [ "$LAEUFT" = ja ] && [ -r "$PROJEKT/.env" ]; then
    ZEILE=$(docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" "$CONTAINER" \
        psql -qAt -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "
            SELECT count(*) FILTER (WHERE laeuft_ab_am > now()) || ' laufend, ' ||
                   count(*) FILTER (WHERE laeuft_ab_am <= now()) || ' abgelaufen'
              FROM sitzung" 2>/dev/null)
    printf '  %-14s %s\n' "Sitzungen" "${ZEILE:-?}"
fi

# ---------------------------------------------------------------------------
titel "Aufraeumen"

# Der Aufraeumlauf ist der einzige Vorgang, der Dateien wirklich entfernt.
# Solange er von Hand lief, sah der Bericht, wer ihn anstiess. Ein Timer stoesst
# ihn nachts an, und dann sieht ihn niemand – deshalb stehen die letzten Laeufe
# hier. Ein Vorgang, der unbeobachtet loescht, ist derselbe Fall wie eine
# ungetestete Sicherung.

if [ "$LAEUFT" != ja ] || [ ! -r "$PROJEKT/.env" ]; then
    echo "  uebersprungen – Container laeuft nicht oder .env fehlt"
else
    set -a; . "$PROJEKT/.env"; set +a

    SCHARF="${AUFRAEUMEN_SCHARF:-0}"
    if [ "$SCHARF" = "1" ]; then
        printf '  %-14s %s\n' "Modus" "SCHARF – der Timer entfernt Dateien wirklich"
    else
        printf '  %-14s %s\n' "Modus" \
               "Probelauf – es wird nur gezaehlt (AUFRAEUMEN_SCHARF=1 schaltet scharf)"
    fi

    LAEUFE=$(docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" "$CONTAINER" \
        psql -qAt -F$'\t' -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "
            SELECT to_char(begonnen_am, 'YYYY-MM-DD HH24:MI'),
                   modus, ausloeser, coalesce(ausgang, 'offen'),
                   sitzungen_faellig, versuche_faellig,
                   coalesce(zeilen_faellig::text, '-'),
                   coalesce(dateien_faellig::text, '-'),
                   coalesce(round(bytes_faellig / 1048576.0)::text || ' MB', '-'),
                   coalesce(bemerkung, '')
              FROM aufraeumlauf ORDER BY begonnen_am DESC LIMIT 5;" 2>/dev/null)

    if [ -z "$LAEUFE" ]; then
        echo "  noch kein Lauf protokolliert"
    else
        printf '  %-16s %-7s %-6s %-7s %6s %6s %6s %6s %9s\n' \
               "begonnen" "Modus" "durch" "Ausgang" "Sitz." "Versu." "Zeilen" "Datei." "Platz"
        while IFS=$'\t' read -r wann modus durch ausgang sitz versu zeilen dateien platz bemerkung; do
            printf '  %-16s %-7s %-6s %-7s %6s %6s %6s %6s %9s\n' \
                   "$wann" "$modus" "$durch" "$ausgang" "$sitz" "$versu" "$zeilen" "$dateien" "$platz"
            [ -n "$bemerkung" ] && printf '  %-16s %s\n' "" "$bemerkung"
        done <<< "$LAEUFE"
        echo "  Die Zahlen sagen, was GEFUNDEN wurde; ob es wegkam, sagt die Spalte Modus."
    fi

    # Ein Ausgang, der nie gesetzt wurde, heisst: der Prozess ist gestorben.
    OFFEN=$(docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" "$CONTAINER" \
        psql -qAt -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "
            SELECT count(*) FROM aufraeumlauf
             WHERE ausgang IS NULL AND begonnen_am < now() - interval '2 hours';" 2>/dev/null)
    [ "${OFFEN:-0}" -gt 0 ] && echo "  ACHTUNG: $OFFEN Lauf/Laeufe ohne Ausgang – abgestuerzt?"

    GRENZE=$(docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" "$CONTAINER" \
        psql -qAt -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "
            SELECT count(*) FROM aufraeumlauf
             WHERE ausgang = 'grenze' AND begonnen_am > now() - interval '7 days';" 2>/dev/null)
    [ "${GRENZE:-0}" -gt 0 ] && \
        echo "  ACHTUNG: $GRENZE Lauf/Laeufe der letzten Woche an der Obergrenze abgebrochen"
fi

if systemctl --user list-unit-files kajoe-aufraeumen.timer >/dev/null 2>&1; then
    printf '  %-14s %s / %s\n' "Timer" \
        "$(systemctl --user is-enabled kajoe-aufraeumen.timer 2>&1)" \
        "$(systemctl --user is-active  kajoe-aufraeumen.timer 2>&1)"
    systemctl --user list-timers --all kajoe-aufraeumen.timer --no-pager 2>/dev/null \
        | sed -n '2p' | sed 's/^/  naechster Lauf: /'
else
    echo "  Timer        nicht eingerichtet – siehe systemd/LIESMICH.md"
fi

# ---------------------------------------------------------------------------
titel "Systempflege"

if dpkg -s unattended-upgrades >/dev/null 2>&1; then
    printf '  %-24s %s\n' "unattended-upgrades" \
        "$(systemctl is-enabled unattended-upgrades.service 2>&1) / $(systemctl is-active unattended-upgrades.service 2>&1)"
    NEUSTARTZEIT=$(apt-config dump 2>/dev/null \
        | sed -n 's/^Unattended-Upgrade::Automatic-Reboot-Time "\(.*\)";$/\1/p')
    AUTONEUSTART=$(apt-config dump 2>/dev/null \
        | sed -n 's/^Unattended-Upgrade::Automatic-Reboot "\(.*\)";$/\1/p')
    printf '  %-24s %s\n' "automatischer Neustart" \
        "${AUTONEUSTART:-nicht gesetzt (= aus)}${NEUSTARTZEIT:+ um $NEUSTARTZEIT}"
    systemctl list-timers --all apt-daily-upgrade.timer --no-pager 2>/dev/null \
        | sed -n '2p' | sed 's/^/  naechste Pruefung: /'
else
    echo "  unattended-upgrades ist nicht installiert"
fi

# WANN der Neustart faellig wurde, steht hier bewusst NICHT: die Datei wird bei
# JEDEM neuen Kernel neu angefasst, ihre Zeit springt also Monat fuer Monat auf
# heute, auch wenn seit einem halben Jahr niemand neu gestartet hat. Wer das
# anzeigen will, braucht eine eigene Erstsichtung. Hier genuegt das OB.
if [ -f /var/run/reboot-required ]; then
    echo "  ACHTUNG: ein Neustart steht aus"
    [ -r /var/run/reboot-required.pkgs ] && \
        sed 's/^/    wegen: /' /var/run/reboot-required.pkgs | sort -u | head -5
else
    echo "  kein Neustart ausstehend"
fi
printf '  %-24s %s\n' "laeuft seit" "$(uptime -p 2>/dev/null || true)"
printf '  %-24s %s\n' "laufender Kern" "$(uname -r)"

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

# ---------------------------------------------------------------------------
titel "Repository"

# KEIN `git fetch`. Dieser Ueberblick soll jederzeit durchlaufen – auch ohne
# Netz, ohne SSH-Schluessel und ohne jemanden, der eine Passphrase eintippt;
# bei einer Passphrase bliebe er sonst einfach stehen. Gelesen wird allein der
# lokale Stand, und der weiss genau das, worauf es hier ankommt: was noch
# nicht gepusht ist. Der Preis steht in der Ausgabe und wird nicht verschwiegen
# – "hinter" ist der Stand des letzten fetch, nicht der von jetzt. Ein
# "gleichauf" heisst also: hier liegt nichts herum, nicht: die Gegenseite hat
# sich nicht bewegt.
#
# Und die Zahlen kommen aus `git rev-list`, nicht aus einem Bericht, einer
# Zaehlung von Hand oder dem Gedaechtnis von irgendwem. Genau daran ist hier
# schon mehrfach falsch geraten worden.

if ! command -v git >/dev/null 2>&1; then
    echo "  git ist nicht installiert"
elif ! git -C "$PROJEKT" rev-parse --git-dir >/dev/null 2>&1; then
    echo "  $PROJEKT ist kein Git-Repository"
else
    ZWEIG=$(git -C "$PROJEKT" symbolic-ref --quiet --short HEAD)

    # Das Gegenstueck ist der eingestellte Upstream; fehlt er (oder haengt der
    # Kopf ab), wird ersatzweise origin/main genommen, falls es das gibt.
    # Woher der Verweis stammt, wird mitgefuehrt und auch angezeigt: ein Pfeil
    # "zweig -> origin/main" behauptet sonst einen Upstream, den niemand
    # eingestellt hat, und beim naechsten `git push` ohne Argumente wundert
    # sich jemand.
    FERN=$(git -C "$PROJEKT" rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' 2>/dev/null)
    FERN_QUELLE=upstream
    if [ -z "$FERN" ]; then
        FERN_QUELLE=keins
        if git -C "$PROJEKT" rev-parse --verify --quiet origin/main >/dev/null; then
            FERN=origin/main
            FERN_QUELLE=ersatz
        fi
    fi

    if [ -n "$ZWEIG" ]; then
        case "$FERN_QUELLE" in
            upstream) ZWEIGTEXT="$ZWEIG -> $FERN" ;;
            ersatz)   ZWEIGTEXT="$ZWEIG – kein Upstream eingestellt, verglichen mit $FERN" ;;
            *)        ZWEIGTEXT="$ZWEIG" ;;
        esac
        printf '  %-24s %s\n' "Zweig" "$ZWEIGTEXT"
    else
        printf '  %-24s %s\n' "Zweig" \
            "abgeloest bei $(git -C "$PROJEKT" rev-parse --short HEAD) – kein Zweig ausgecheckt"
        echo "  ACHTUNG: ein Commit hier haengt an keinem Zweig und geht beim naechsten"
        echo "           Wechsel verloren – 'git switch -c <name>' oder 'git switch main'"
    fi

    if [ -z "$FERN" ]; then
        echo "  kein Gegenstueck: weder ein eingestellter Upstream noch origin/main"
    else
        # rev-list --left-right --count A...B liefert "hinter<TAB>vor".
        STAND=$(git -C "$PROJEKT" rev-list --left-right --count "$FERN"...HEAD 2>/dev/null)
        HINTER=${STAND%%[[:space:]]*}
        VOR=${STAND##*[[:space:]]}

        if [ -z "$STAND" ]; then
            printf '  %-24s %s\n' "Stand" "nicht bestimmbar – $FERN und HEAD haben keine gemeinsame Wurzel"
        elif [ "$VOR" -eq 0 ] && [ "$HINTER" -eq 0 ]; then
            printf '  %-24s %s\n' "Stand" "gleichauf mit $FERN (Stand des letzten fetch)"
        elif [ "$HINTER" -eq 0 ]; then
            printf '  %-24s %s\n' "Stand" "$VOR Commit(s) nicht gepusht"
        elif [ "$VOR" -eq 0 ]; then
            printf '  %-24s %s\n' "Stand" "$HINTER Commit(s) von $FERN fehlen hier"
        else
            printf '  %-24s %s\n' "Stand" \
                "$VOR nicht gepusht, $HINTER fehlend – auseinandergelaufen"
        fi

        if [ -n "$STAND" ] && [ "$VOR" -gt 0 ]; then
            # Alter des AELTESTEN nicht gepushten Commits. Einmal in eine
            # Variable lesen statt `| head -1`: eine abgeschnittene Leitung
            # laesst git mit 141 enden, und `pipefail` machte daraus einen
            # Fehlschlag der ganzen Zeile.
            ZEITEN=$(git -C "$PROJEKT" log --reverse --format=%ct "$FERN"..HEAD 2>/dev/null)
            AELTESTE=${ZEITEN%%$'\n'*}
            if [ -n "$AELTESTE" ]; then
                LIEGT_S=$(( $(date +%s) - AELTESTE ))
                if [ "$LIEGT_S" -ge 86400 ]; then
                    LIEGT="$((LIEGT_S / 86400)) Tag(e)"
                else
                    LIEGT="$((LIEGT_S / 3600)) Stunde(n)"
                fi
                printf '  %-24s %s\n' "aeltester davon" "liegt seit $LIEGT hier"
                # Erst ab einem Tag eine Warnung: unmittelbar nach einem Commit
                # ist "nicht gepusht" der Normalzustand, und eine Warnung, die
                # im Normalbetrieb erscheint, liest nach dem dritten Mal
                # niemand mehr. Liegt der aelteste dagegen einen Tag hier, ist
                # der Push vergessen worden – und die Arbeit gibt es dann nur
                # auf dieser Maschine.
                if [ "$LIEGT_S" -ge 86400 ]; then
                    echo "  ACHTUNG: $VOR Commit(s) gibt es nur auf dieser Maschine, den aeltesten"
                    echo "           seit $LIEGT – 'git push'"
                fi
            fi
        fi

        if [ -n "$STAND" ] && [ "$HINTER" -gt 0 ]; then
            echo "  ACHTUNG: $FERN hatte beim letzten fetch $HINTER Commit(s), die hier fehlen"
            echo "           – 'git pull' (dieser Ueberblick holt selbst nichts)"
        fi
    fi

    # Ungespeicherte Aenderungen. Ueber eine Variable und `<<<` geprueft, aus
    # demselben Grund wie oben.
    AENDERUNGEN=$(git -C "$PROJEKT" status --porcelain 2>/dev/null)
    if [ -z "$AENDERUNGEN" ]; then
        printf '  %-24s %s\n' "Arbeitsstand" "sauber"
    else
        UNVERFOLGT=$(grep -c '^??' <<< "$AENDERUNGEN")
        GEAENDERT=$(grep -vc '^??' <<< "$AENDERUNGEN")
        printf '  %-24s %s\n' "Arbeitsstand" \
            "$GEAENDERT geaendert, $UNVERFOLGT unverfolgt – nicht gespeichert"
    fi
fi
echo
