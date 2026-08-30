#!/usr/bin/env python3
"""tools/bestand.py – Bestandsmessung auswerten.

Liest die von exiftool erzeugte CSV und zaehlt aus. Bewusst Python und nicht
awk: exiftool setzt Felder mit Komma darin in Anfuehrungszeichen
("VenTrade GmbH, Germany"), und ein Trennen an jedem Komma verschiebt ab da
alle Spalten der Zeile. Das faellt nur auf, wenn man hinsieht – die Zahlen
sehen plausibel aus und sind falsch.

Aufruf:  python3 tools/bestand.py bestand-2026.csv
"""

import csv
import sys
from collections import Counter
from pathlib import Path

BILD = {"HEIC", "HEIF", "JPEG", "PNG", "TIFF", "DNG"}
VIDEO = {"MOV", "MP4", "M4V", "AVI"}


def herkunft(make: str, model: str) -> str:
    """Dieselbe Einteilung wie spaeter im Ingest."""
    if not make.strip():
        return "ohne_exif"
    if make.strip().lower().startswith("apple"):
        return "iphone" if "iphone" in model.lower() else "apple_sonstig"
    return "fremd"


def zeige(titel: str, zaehler: Counter, gesamt: int, grenze: int = 20) -> None:
    print(f"\n--- {titel} ---")
    for wert, anzahl in zaehler.most_common(grenze):
        anteil = 100 * anzahl / gesamt if gesamt else 0
        print(f"{anzahl:6d}  {anteil:5.1f}%  {wert}")
    if len(zaehler) > grenze:
        print(f"        … und {len(zaehler) - grenze} weitere")


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit("Aufruf: bestand.py <csv-datei>")

    pfad = Path(sys.argv[1])
    if not pfad.exists():
        sys.exit(f"Datei nicht gefunden: {pfad}")

    typen, hersteller, modelle, kategorien = Counter(), Counter(), Counter(), Counter()
    bytes_je_art = Counter()
    mit_gps = ohne_zeit = mit_versatz = 0
    kurze_movs: list[str] = []
    bildnamen: set[str] = set()
    gesamt = 0

    with pfad.open(newline="", encoding="utf-8", errors="replace") as f:
        for zeile in csv.DictReader(f):
            gesamt += 1
            typ = (zeile.get("FileType") or "").strip()
            make = (zeile.get("Make") or "").strip()
            model = (zeile.get("Model") or "").strip()

            typen[typ or "(unbekannt)"] += 1
            hersteller[make or "(kein Make)"] += 1
            modelle[model or "(kein Model)"] += 1
            kategorien[herkunft(make, model)] += 1

            try:
                groesse = int(float(zeile.get("FileSize") or 0))
            except ValueError:
                groesse = 0
            bytes_je_art["video" if typ in VIDEO else "bild"] += groesse

            if (zeile.get("GPSLatitude") or "").strip():
                mit_gps += 1
            if not (zeile.get("DateTimeOriginal") or "").strip():
                ohne_zeit += 1
            if (zeile.get("OffsetTimeOriginal") or "").strip():
                mit_versatz += 1

            # Live Photos: MOV unter 5 s, zu der eine gleichnamige Bilddatei
            # gehoert. Ohne diese Pruefung stehen sie als Videos in der Galerie.
            name = Path(zeile.get("SourceFile", "")).with_suffix("").as_posix()
            if typ in BILD:
                bildnamen.add(name)
            elif typ in VIDEO:
                try:
                    dauer = float(zeile.get("Duration") or 0)
                except ValueError:
                    dauer = 0.0
                if 0 < dauer < 5:
                    kurze_movs.append(name)

    live = sum(1 for n in kurze_movs if n in bildnamen)
    videos = sum(typen[t] for t in VIDEO if t in typen)

    print(f"Dateien gesamt: {gesamt}")
    zeige("Dateityp", typen, gesamt)
    zeige("Herkunft (wie im Ingest)", kategorien, gesamt)
    zeige("Hersteller", hersteller, gesamt)
    zeige("Modell", modelle, gesamt)

    print("\n--- Kennzahlen ---")
    print(f"mit GPS:                {mit_gps:6d}  ({100*mit_gps/gesamt:.1f} %)")
    print(f"ohne DateTimeOriginal:  {ohne_zeit:6d}  ({100*ohne_zeit/gesamt:.1f} %)")
    print(f"mit Zeitversatz:        {mit_versatz:6d}  ({100*mit_versatz/gesamt:.1f} %)")
    print(f"Videodateien:           {videos:6d}")
    print(f"davon Live Photos:      {live:6d}  (zaehlen nicht als Video)")
    print(f"echte Videos:           {videos - live:6d}")

    gb = 1024 ** 3
    print(f"\nVolumen Bilder: {bytes_je_art['bild']/gb:7.1f} GB")
    print(f"Volumen Videos: {bytes_je_art['video']/gb:7.1f} GB")


if __name__ == "__main__":
    main()
