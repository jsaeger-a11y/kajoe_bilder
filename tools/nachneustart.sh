#!/usr/bin/env bash
# tools/nachneustart.sh – kommt nach einem Neustart alles von selbst wieder?
#
# Ein automatischer Neustart (unattended-upgrades, 03:45 UTC) ist nur so viel
# wert, wie danach von selbst wieder laeuft. Die Kette ist laenger, als sie
# aussieht: Einhaengepunkt aus der fstab, Docker-Container mit
# `restart: unless-stopped`, Benutzerdienste, die ohne `enable-linger` gar
# nicht erst starten, und die Gruppen `render`/`video`, ohne die ffmpeg still
# auf den Prozessor zurueckfaellt statt auf VAAPI.
#
# Nur lesend. Aufruf jederzeit, sinnvoll aber direkt nach einem Neustart.
#
#   tools/nachneustart.sh            pruefen und berichten
#   tools/nachneustart.sh --merken   dabei den Zaehlerstand merken
#
# ES GIBT NUR EINEN RICHTIGEN AUFRUF, UND DER IST OHNE sudo.
#
# Fast alles hier ist an den Benutzer gebunden: `loginctl show-user`,
# `systemctl --user`, die Gruppenzugehoerigkeit. Unter `sudo` beantwortet das
# alles root – und root hat keinen Linger, keine Benutzerdienste und weder
# `render` noch `video`. Der Bericht zeigte dann acht rote Kreuze, von denen
# keines ein Fehler ist. Ein Pruefwerkzeug, das im falschen Aufruf Alarm
# schlaegt, bringt einem irgendwann bei, den Alarm zu ueberlesen.
#
# Der eine Wert, der wirklich Rootrechte braucht – `Unsafe Shutdowns` aus
# SMART –, wird deshalb vom Skript selbst per `sudo` geholt, fuer diesen einen
# Aufruf. Wer das ganze Skript unter `sudo` startet, bekommt eine Meldung und
# keinen Prueflauf.

set -uo pipefail

PROJEKT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Seit dem Plattenumzug ist /data der Einhaengepunkt (eigene 1-TB-SSD) und
# /data/kajoe_bilder nur noch ein Ordner darin. Beides steht hier getrennt,
# weil beides getrennt schiefgehen kann.
DATEN=/data
PROJEKTDATEN=/data/kajoe_bilder
CONTAINER=kajoe_bilder_db

# Der gemerkte Zaehlerstand liegt im Projekt und nicht unter $HOME: dann haengt
# er nicht daran, wer das Skript aufgerufen hat, und liegt neben allem anderen,
# was zu diesem Projekt gehoert. `.zustand/` steht in der .gitignore.
ZUSTAND="$PROJEKT/.zustand"
MERKDATEI="$ZUSTAND/unsafe-shutdowns"

titel() { printf '\n\033[1m%s\033[0m\n' "$1"; }
ok()    { printf '  \033[32m✓\033[0m %-34s %s\n' "$1" "${2:-}"; }
weh()   { printf '  \033[31m✗\033[0m %-34s %s\n' "$1" "${2:-}"; FEHLER=$((FEHLER + 1)); }
huh()   { printf '  \033[33m?\033[0m %-34s %s\n' "$1" "${2:-}"; OFFEN=$((OFFEN + 1)); }
FEHLER=0
OFFEN=0

MERKEN=nein
[ "${1:-}" = "--merken" ] && MERKEN=ja

# --- Als root? Dann gar nicht erst anfangen -------------------------------
if [ "$(id -u)" -eq 0 ]; then
    NAME="${SUDO_USER:-<benutzer>}"
    cat >&2 <<ENDE
tools/nachneustart.sh gehoert NICHT unter sudo.

Fast alles hier ist an den Benutzer gebunden – Linger, die Benutzerdienste,
die Gruppen render und video. Als root sind das alles andere Antworten, und
der Bericht zeigte acht Fehler, die keine sind.

Bitte so aufrufen:

    tools/nachneustart.sh${1:+ $1}

Das Skript holt sich den einen Wert, der Rootrechte braucht (Unsafe Shutdowns
aus SMART), selbst per sudo und fragt dabei gegebenenfalls nach dem Passwort.
ENDE
    [ "$NAME" != "<benutzer>" ] && echo "(Aufgerufen ueber sudo von $NAME.)" >&2
    exit 2
fi

# ---------------------------------------------------------------------------
titel "Neustart"
printf '  %-36s %s\n' "gestartet" "$(uptime -s 2>/dev/null)"
printf '  %-36s %s\n' "laeuft seit" "$(uptime -p 2>/dev/null)"
printf '  %-36s %s\n' "Kern" "$(uname -r)"
if [ -f /var/run/reboot-required ]; then
    huh "Neustart steht (wieder) aus" "$(tr '\n' ' ' < /var/run/reboot-required.pkgs 2>/dev/null)"
else
    ok "kein Neustart ausstehend"
fi

# ---------------------------------------------------------------------------
titel "Einhaengepunkt"
if findmnt -n "$DATEN" >/dev/null 2>&1; then
    ok "$DATEN eingehaengt" "$(findmnt -no SOURCE,FSTYPE,LABEL,SIZE "$DATEN")"

    # Ohne Eintrag in der fstab kommt er beim naechsten Mal nicht wieder, auch
    # wenn er jetzt da ist. `findmnt --fstab` liest die Datei richtig – ein
    # `grep /data /etc/fstab` traefe auch die AUSKOMMENTIERTE Zeile des alten
    # Logical Volume und meldete Erfolg, wo keiner ist.
    if findmnt -n --fstab "$DATEN" >/dev/null 2>&1; then
        ok "steht in der fstab" "$(findmnt -no SOURCE --fstab "$DATEN")"
    else
        weh "steht NICHT in der fstab" "kommt beim naechsten Neustart nicht wieder"
    fi
else
    weh "$DATEN NICHT eingehaengt" "ohne ihn liefert die Anwendung keine Bilder"
fi

# DIE WICHTIGERE FRAGE: liegt das Projektverzeichnis auch wirklich auf der
# Datenplatte?
#
# Haengt /data nicht ein, existiert /data/kajoe_bilder trotzdem – als leerer
# Ordner auf der Systemplatte. Alles sieht dann normal aus, der Ingest legt
# munter Dateien an, und sie landen auf der 100-GB-Wurzel statt auf der SSD.
# Auffallen wuerde es erst, wenn / vollaeuft oder jemand seine Bilder sucht.
TRAEGER=$(findmnt -no TARGET -T "$PROJEKTDATEN" 2>/dev/null)
if [ "$TRAEGER" = "$DATEN" ]; then
    ok "$PROJEKTDATEN liegt auf $DATEN"
else
    weh "$PROJEKTDATEN liegt auf ${TRAEGER:-?}" "erwartet: $DATEN – die Datenplatte fehlt"
fi

PROBE="$PROJEKTDATEN/.schreibprobe.$$"
if touch "$PROBE" 2>/dev/null; then
    rm -f "$PROBE"; ok "beschreibbar"
else
    weh "nicht beschreibbar" "$PROJEKTDATEN"
fi
for u in eingang original abgeleitet quarantaene; do
    [ -d "$PROJEKTDATEN/$u" ] || weh "Unterverzeichnis fehlt" "$u"
done

# Platz. Die Platte gehoert allen Projekten unter /data – ohne LVM begrenzt
# nichts ein einzelnes, und wer sie vollschreibt, trifft die uebrigen mit.
read -r _ GROESSE BELEGT FREI ANTEIL _ <<< "$(df -h --output=source,size,used,avail,pcent,target "$DATEN" | tail -1)"
if [ "${ANTEIL%\%}" -ge 90 ] 2>/dev/null; then
    weh "Platz auf $DATEN" "$BELEGT von $GROESSE belegt ($ANTEIL), nur noch $FREI frei"
else
    ok "Platz auf $DATEN" "$BELEGT von $GROESSE belegt ($ANTEIL), $FREI frei"
fi

# ---------------------------------------------------------------------------
titel "Datenbank"
if docker inspect "$CONTAINER" >/dev/null 2>&1; then
    Z=$(docker inspect -f '{{.State.Status}}' "$CONTAINER")
    R=$(docker inspect -f '{{.HostConfig.RestartPolicy.Name}}' "$CONTAINER")
    G=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}ohne Pruefung{{end}}' "$CONTAINER")
    [ "$Z" = running ] && ok "Container laeuft" "($G)" || weh "Container laeuft nicht" "$Z"
    [ "$R" = unless-stopped ] || [ "$R" = always ] \
        && ok "Neustartregel" "$R" \
        || weh "Neustartregel" "$R – kommt nach einem Neustart nicht von selbst"
    B=$(docker inspect -f '{{range $p, $c := .NetworkSettings.Ports}}{{range $c}}{{.HostIp}}:{{.HostPort}} {{end}}{{end}}' "$CONTAINER")
    case "$B" in
        127.0.0.1:*) ok "Port" "$B – nur lokal" ;;
        *)           weh "Port" "$B – nicht auf 127.0.0.1" ;;
    esac
else
    weh "Container $CONTAINER fehlt"
fi

# Die entscheidende Pruefung: der Weg der Anwendung, ueber 127.0.0.1 mit
# Passwort – nicht ueber `docker exec`, wo fuer den Unix-Socket `trust` gilt.
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
    print(f"FEHLER {type(fehler).__name__}: {str(fehler).strip().splitlines()[0][:70]}")
PY
    )
    case "$ANTWORT" in
        ok\ *) ok "Zugang der Anwendung" "127.0.0.1:5432 mit Passwort, ${ANTWORT#ok } Zeilen in bild" ;;
        *)     weh "Zugang der Anwendung" "$ANTWORT" ;;
    esac
else
    huh "Zugang der Anwendung" "ingest/.venv fehlt"
fi

# ---------------------------------------------------------------------------
titel "Dienste und Timer"
printf '  %-36s %s\n' "Linger (sonst startet nichts davon)" \
       "$(loginctl show-user "$USER" -p Linger --value 2>/dev/null)"
[ "$(loginctl show-user "$USER" -p Linger --value 2>/dev/null)" = yes ] \
    || weh "Linger ist NICHT gesetzt" "loginctl enable-linger $USER"

for e in kajoe-web.service kajoe-sicherung.timer kajoe-aufraeumen.timer kajoe-verarbeiten.path; do
    A=$(systemctl --user is-active "$e" 2>&1)
    E=$(systemctl --user is-enabled "$e" 2>&1)
    if [ "$A" = active ] || [ "$A" = waiting ]; then
        ok "$e" "$E / $A"
    else
        weh "$e" "$E / $A"
    fi
done

KODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:3000/anmelden 2>/dev/null)
[ "$KODE" = 200 ] && ok "Weboberflaeche antwortet" "HTTP $KODE auf /anmelden" \
                  || weh "Weboberflaeche antwortet nicht" "HTTP ${KODE:-–}"

FEHLGESCHLAGEN=$(systemctl --user list-units --state=failed --no-legend --no-pager 2>/dev/null | wc -l)
[ "$FEHLGESCHLAGEN" -eq 0 ] && ok "keine fehlgeschlagene Benutzereinheit" \
    || weh "$FEHLGESCHLAGEN fehlgeschlagene Benutzereinheit(en)" \
           "$(systemctl --user list-units --state=failed --no-legend --no-pager | awk '{print $1}' | tr '\n' ' ')"

# ---------------------------------------------------------------------------
titel "Hardwarebeschleunigung"
# Ohne die Gruppen faellt ffmpeg still auf den Prozessor zurueck: es laeuft
# weiter, nur zehnmal langsamer. Genau deshalb wird es hier geprueft und nicht
# erst bemerkt, wenn ein Video eine Viertelstunde braucht.
for g in render video docker; do
    id -nG | tr ' ' '\n' | grep -qx "$g" && ok "Gruppe $g" || weh "Gruppe $g fehlt"
done
if [ -e /dev/dri/renderD128 ]; then
    ok "/dev/dri/renderD128" "$(stat -c '%U:%G %a' /dev/dri/renderD128)"
    # OHNE `sg render` – das ist der Punkt: die Gruppe muss schon in der
    # laufenden Sitzung wirken, sonst braeuchte jeder Dienst einen Umweg.
    if VAI=$(vainfo 2>&1) && grep -q 'VAProfileH264.*VAEntrypointEncSlice' <<< "$VAI"; then
        ok "VAAPI ohne sg render" "$(grep -m1 'Driver version' <<< "$VAI" | sed 's/.*: //')"
    else
        weh "VAAPI antwortet nicht" "$(head -2 <<< "$VAI" | tr '\n' ' ')"
    fi
else
    weh "/dev/dri/renderD128 fehlt"
fi

# ---------------------------------------------------------------------------
titel "Verarbeitung"
# Phase 4: eine Zeile mit totem Prozess wird erkannt und auf `abgebrochen`
# gesetzt. Ein Neustart mitten im Lauf ist genau dieser Fall.
if [ -x "$PYTHON" ]; then
    KAJOE_INGEST="$PROJEKT/ingest" "$PYTHON" - <<'PY' 2>&1 | sed 's/^/  /'
import os, sys
sys.path.insert(0, os.environ["KAJOE_INGEST"])
from datenbank import verbindung
import verarbeitung
with verbindung(autocommit=True) as c:
    weg = verarbeitung.verwaiste_aufraeumen(c)
    with c.cursor() as k:
        k.execute("""SELECT id, schritt, zustand, pid,
                            to_char(begonnen_am, 'YYYY-MM-DD HH24:MI'),
                            erledigt, gesamt
                       FROM verarbeitung ORDER BY id DESC LIMIT 3""")
        zeilen = k.fetchall()
print(f"{weg} verwaiste Zeile(n) auf 'abgebrochen' gesetzt")
for z in zeilen:
    print(f"Nr. {z[0]}  {z[1]:9s} {z[2]:12s} PID {z[3]}  {z[4]}  {z[5]}/{z[6]}")
if not zeilen:
    print("noch kein Verarbeitungslauf")
PY
else
    huh "Verarbeitung nicht geprueft" "ingest/.venv fehlt"
fi

# ---------------------------------------------------------------------------
titel "Sauber heruntergefahren?"
# NVMe zaehlt mit, wie oft der Strom weg war, ohne dass die Platte Bescheid
# wusste. Steigt der Wert ueber einen Neustart, war es kein sauberer.
# SMART liest nur root – das ist der EINZIGE Wert hier, der das braucht, und
# deshalb holt das Skript ihn sich fuer diesen einen Aufruf selbst. Erst ohne
# Rueckfrage versuchen; nur wenn ein Terminal da ist, darf sudo nach dem
# Passwort fragen – aus einem Dienst heraus wartete eine Rueckfrage ewig.
#
# Rueckgabe ueber die Ausgabe und nicht ueber eine Variable: die Funktion
# laeuft in einer Ersatzumgebung ($(...)), eine Zuweisung darin kaeme draussen
# nie an. Und der GRUND wird mitgeliefert – "geht nicht" ohne Grund schickt
# einen auf die Suche.
smart_lesen() {
    local ausg w
    [ -e /dev/nvme0 ] || { echo "weg:keine NVMe unter /dev/nvme0 – nichts zu zaehlen"; return; }
    command -v smartctl >/dev/null 2>&1 \
        || { echo "weg:smartctl ist nicht installiert (Paket smartmontools)"; return; }

    if ausg=$(sudo -n smartctl -A /dev/nvme0 2>/dev/null); then
        :
    elif [ -t 0 ]; then
        printf '  SMART braucht root – sudo fragt jetzt nach dem Passwort.\n' >&2
        ausg=$(sudo smartctl -A /dev/nvme0 2>/dev/null) \
            || { echo "weg:sudo hat den Zugriff auf SMART nicht freigegeben"; return; }
    else
        echo "weg:SMART braucht root, und hier ist kein Terminal fuer die sudo-Rueckfrage"
        return
    fi

    w=$(grep -i 'Unsafe Shutdowns' <<< "$ausg" | tr -dc '0-9')
    [ -n "$w" ] && echo "ok:$w" || echo "weg:smartctl nennt keinen Zaehler 'Unsafe Shutdowns'"
}

ANTWORT=$(smart_lesen)
WERT=""
[ "${ANTWORT%%:*}" = ok ] && WERT="${ANTWORT#ok:}"

if [ -n "$WERT" ]; then
    ALT=""
    [ -r "$MERKDATEI" ] && ALT=$(cat "$MERKDATEI")
    if [ -n "$ALT" ]; then
        [ "$WERT" = "$ALT" ] \
            && ok "Unsafe Shutdowns" "$WERT – unveraendert gegenueber $ALT" \
            || weh "Unsafe Shutdowns" "$WERT, vorher $ALT – kein sauberes Herunterfahren"
    else
        ok "Unsafe Shutdowns" "$WERT (noch kein Vergleichswert – --merken legt einen an)"
    fi
    if [ "$MERKEN" = ja ]; then
        mkdir -p "$ZUSTAND" && printf '%s' "$WERT" > "$MERKDATEI"
        echo "  gemerkt: $WERT in ${MERKDATEI#"$PROJEKT/"}"
    fi
else
    huh "Unsafe Shutdowns" "${ANTWORT#weg:}"
fi

# ---------------------------------------------------------------------------
printf '\n'
if [ "$FEHLER" -eq 0 ] && [ "$OFFEN" -eq 0 ]; then
    printf '\033[32mAlles gepruefte kam von selbst wieder.\033[0m\n'
elif [ "$FEHLER" -eq 0 ]; then
    printf '\033[33m%d Punkt(e) offen, kein Fehler.\033[0m\n' "$OFFEN"
else
    printf '\033[31m%d Fehler, %d offen.\033[0m\n' "$FEHLER" "$OFFEN"
fi
exit $(( FEHLER > 0 ? 1 : 0 ))
