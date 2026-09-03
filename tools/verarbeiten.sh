#!/usr/bin/env bash
# tools/verarbeiten.sh – einlesen, ableiten, Gesichter.
#
# Wird von kajoe-verarbeiten.service aufgerufen, sobald die Auslesedatei
# /data/kajoe_bilder/.anstoss auftaucht (kajoe-verarbeiten.path). Laesst sich
# auch von Hand starten.
#
# **Der Lauf gehoert systemd, nicht der Weboberflaeche.** Ein Kindprozess aus
# Node heraus haengt am Webdienst: bei jedem Neustart stirbt er mit oder bleibt
# als Waise zurueck. Die Anwendung schreibt deshalb nur eine Datei; alles
# weitere macht systemd.
#
# **Nur einer gleichzeitig.** Die Sperre ist ein flock auf .sperre, kein
# selbstgebautes Vorhandensein einer Datei: der Kern gibt ein flock frei,
# sobald der Prozess endet – auch wenn er abstuerzt. Eine Sperrdatei, die
# niemand aufraeumt, blockiert dagegen dauerhaft.

set -uo pipefail

PROJEKT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATEN=/data/kajoe_bilder
ANSTOSS="$DATEN/.anstoss"
SPERRE="$DATEN/.sperre"

meldung() { printf '%s  %s\n' "$(date -u '+%Y-%m-%d %H:%M:%SZ')" "$*"; }

exec 9>"$SPERRE" || { echo "Sperrdatei nicht zu oeffnen: $SPERRE" >&2; exit 1; }
if ! flock -n 9; then
    meldung "Es laeuft bereits ein Vorgang – nichts zu tun."
    exit 0
fi

# Wer hat angestossen? Steht als Benutzernummer in der Auslesedatei. Die Datei
# wird ZUERST entfernt: sonst startet die path-Einheit den Dienst gleich noch
# einmal, sobald er fertig ist.
BENUTZER=""
if [ -f "$ANSTOSS" ]; then
    BENUTZER=$(head -c 32 "$ANSTOSS" 2>/dev/null | tr -dc '0-9')
    rm -f "$ANSTOSS"
fi

ARG=()
[ -n "$BENUTZER" ] && ARG=(--angestossen-von "$BENUTZER")

meldung "Verarbeitung beginnt${BENUTZER:+ (angestossen von Benutzer $BENUTZER)}"

# Ein gescheiterter SCHRITT haelt die Kette an. Einzelne gescheiterte DATEIEN
# tun das nicht – dafuer gibt es den Rueckgabewert 3.
#
# Der Unterschied musste sein: im Bestand liegen 18 abgeschnittene JPEGs aus
# 2020, die sich nicht ableiten lassen und es nie werden. Ohne diese
# Unterscheidung waere jeder Lauf gescheitert, die Gesichtserkennung liefe nie
# wieder an, und der Dienst stuende dauerhaft auf `failed` – genau der Zustand,
# den CLAUDE.md als "macht die Zustandsanzeige wertlos" beschreibt. Sichtbar
# bleiben die Fehlschlaege trotzdem: namentlich in der Datenbank und im
# Bericht.
EINZELFEHLER=0
schritt() {   # name, Befehl …
    local name="$1"; shift
    meldung "--- $name ---"
    "$@"
    local code=$?
    case $code in
        0) return 0 ;;
        3) EINZELFEHLER=1
           meldung "$name: durchgelaufen, aber einzelne Dateien sind gescheitert."
           return 0 ;;
        *) meldung "$name GESCHEITERT (Rueckgabewert $code) – die folgenden Schritte laufen NICHT an."
           return 1 ;;
    esac
}

schritt "Schritt 1: einlesen"  "$PROJEKT/tools/einlesen.sh"  "${ARG[@]}" || exit 1
schritt "Schritt 2: ableiten"  "$PROJEKT/tools/ableiten.sh"  "${ARG[@]}" || exit 1

# Schritt 3 haengt an Schritt 2, und zwar zwingend: gerechnet wird auf der
# Ansichtsfassung. Waere das Ableiten gescheitert, faende dieser Schritt
# entweder nichts oder arbeitete auf einem halben Bestand – und ein zweiter
# Lauf holte das Fehlende spaeter nach, ohne dass jemand wuesste, warum es
# fehlte.
#
# Der Schritt ORDNET NICHTS ZU. Neue Funde landen im Gruppierungsschritt; wo
# sie an ein benanntes Haeufchen passen, warten sie dort auf einen Menschen
# (Phase 9b). Und er gruppiert nicht neu: --neu-gruppieren bleibt ein Aufruf
# von Hand, weil er alle Ablage-Entscheidungen verwirft.
schritt "Schritt 3: Gesichter" "$PROJEKT/tools/gesichter.sh" "${ARG[@]}" || exit 1

if [ "$EINZELFEHLER" = 1 ]; then
    meldung "Verarbeitung fertig – mit Einzelfehlern. Welche Dateien es waren, steht"
    meldung "in der Oberflaeche unter Verarbeiten und oben in diesem Protokoll."
else
    meldung "Verarbeitung fertig."
fi
