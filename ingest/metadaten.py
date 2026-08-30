"""EXIF und Containerangaben lesen – im Stapel, nicht je Datei.

**exiftool je Datei einzeln aufzurufen ist zu langsam**: der Programmstart
kostet mehr als das Auslesen selbst. Hier laeuft ein Aufruf ueber jeweils
STAPEL Dateien; die Dateiliste geht ueber die Standardeingabe (`-@ -`), damit
kein Argumentlimit greift.

Zwei Fallen, die hier bewusst umgangen werden:

1. **`-G0` ist Pflicht.** Ohne Gruppenpraefix liefert exiftool fuer
   `GPSLatitude` den *Composite*-Wert – der ist bereits vorzeichenbehaftet.
   Mit `-G0` stehen `EXIF:GPSLatitude` (Betrag, immer positiv) und
   `Composite:GPSLatitude` (vorzeichenbehaftet) nebeneinander. Wer die beiden
   verwechselt, spiegelt entweder alles auf die Nordhalbkugel oder dreht
   Vorzeichen doppelt um. Ausgewertet wird ausschliesslich die EXIF-Gruppe
   plus Himmelsrichtung, so wie CLAUDE.md es vorschreibt.

2. **`-n` ist Pflicht.** Sonst kommen Koordinaten als
   "53 deg 46' 37.13\" N" und Dauern als "0:00:09" zurueck.
"""

from __future__ import annotations

import json
import subprocess
from collections.abc import Iterator, Sequence
from pathlib import Path

STAPEL = 200

# Ohne Gruppenpraefix angefordert, damit exiftool alle Gruppen liefert, die
# den Namen kennen; die Antwort ist dank -G0 trotzdem eindeutig zugeordnet.
TAGS = [
    "-FileType", "-FileTypeExtension", "-MIMEType",
    "-Make", "-Model", "-Software",
    "-DateTimeOriginal", "-OffsetTimeOriginal", "-CreateDate", "-CreationDate",
    "-GPSLatitude", "-GPSLatitudeRef", "-GPSLongitude", "-GPSLongitudeRef",
    "-GPSCoordinates",
    "-ImageWidth", "-ImageHeight", "-Orientation", "-Rotation",
    "-Duration", "-CompressorID", "-CompressorName",
    "-TransferCharacteristics",
    "-FileSize", "-FileModifyDate",
]


class ExiftoolFehler(RuntimeError):
    pass


def _aufruf(pfade: Sequence[Path]) -> list[dict]:
    liste = "\n".join(str(p) for p in pfade) + "\n"
    befehl = [
        "exiftool",
        "-json", "-n", "-G0",
        "-charset", "filename=utf8",
        # -q unterdrueckt nur die Zusammenfassung, nicht die Fehler auf stderr.
        "-q",
        *TAGS,
        "-@", "-",
    ]
    lauf = subprocess.run(
        befehl, input=liste, capture_output=True, text=True, check=False
    )
    # exiftool gibt 1 zurueck, wenn EINE Datei nicht lesbar war – die uebrigen
    # stehen trotzdem in der Ausgabe. Abgebrochen wird nur, wenn gar nichts
    # zurueckkam.
    roh = lauf.stdout.strip()
    if not roh:
        raise ExiftoolFehler(lauf.stderr.strip() or "exiftool lieferte nichts")
    try:
        return json.loads(roh)
    except json.JSONDecodeError as fehler:
        raise ExiftoolFehler(f"Ausgabe nicht lesbar: {fehler}") from fehler


def stapelweise(pfade: Sequence[Path], groesse: int = STAPEL) -> Iterator[tuple[Path, dict | None]]:
    """Liefert (Pfad, Metadaten) in der uebergebenen Reihenfolge.

    Metadaten ist None, wenn exiftool zu dieser Datei nichts geliefert hat –
    das ist ein Quarantaenefall und kein Grund, den Lauf abzubrechen.

    Es liegen nie mehr als `groesse` Ergebnisse gleichzeitig im Speicher.
    """
    for anfang in range(0, len(pfade), groesse):
        teil = pfade[anfang : anfang + groesse]
        try:
            antwort = _aufruf(teil)
        except ExiftoolFehler:
            # Der ganze Stapel ist gescheitert. Einzeln nachfassen, damit nicht
            # 199 lesbare Dateien wegen einer kaputten in Quarantaene landen.
            antwort = []
            for einzeln in teil:
                try:
                    antwort.extend(_aufruf([einzeln]))
                except ExiftoolFehler:
                    pass

        nach_pfad = {eintrag.get("SourceFile"): eintrag for eintrag in antwort}
        for pfad in teil:
            yield pfad, nach_pfad.get(str(pfad))


def wert(md: dict, *schluessel: str):
    """Erster belegter Wert aus mehreren gruppenqualifizierten Schluesseln."""
    for s in schluessel:
        v = md.get(s)
        if v is not None and v != "":
            return v
    return None


def wert_beliebig(md: dict, tag: str, *, ohne: tuple[str, ...] = ("Composite",)):
    """Wert eines Tags, gleich aus welcher Gruppe er kommt.

    Noetig, weil dieselbe Angabe je nach Format in einer anderen Gruppe steht:
    Bildmasse liegen bei HEIC und JPEG unter `File:`, bei Videos unter
    `QuickTime:` und bei PNG unter `PNG:`. Eine feste Gruppenliste laesst
    genau ein Format still leer – im Bestand 2026 waeren das die 70 PNG
    gewesen, deren Breite und Hoehe dann NULL geblieben waeren.

    `Composite:` bleibt aussen vor: dort stehen von exiftool errechnete Werte,
    und bei GPS ist der Composite-Wert bereits vorzeichenbehaftet.
    """
    for schluessel, v in md.items():
        gruppe, _, name = schluessel.partition(":")
        if name == tag and gruppe not in ohne and v is not None and v != "":
            return v
    return None


__all__ = ["ExiftoolFehler", "stapelweise", "wert", "wert_beliebig"]
