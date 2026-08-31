#!/usr/bin/env bash
# tools/verarbeiten.sh – einlesen, dann ableiten.
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

meldung "--- Schritt 1: einlesen ---"
if ! "$PROJEKT/tools/einlesen.sh" "${ARG[@]}"; then
    meldung "Einlesen gescheitert – das Ableiten laeuft NICHT an."
    exit 1
fi

meldung "--- Schritt 2: ableiten ---"
if ! "$PROJEKT/tools/ableiten.sh" "${ARG[@]}"; then
    meldung "Ableiten gescheitert."
    exit 1
fi

meldung "Verarbeitung fertig."
