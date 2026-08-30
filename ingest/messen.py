#!/usr/bin/env python3
"""ingest/messen.py – Bildwerkzeuge an echten Dateien vergleichen.

Erzeugt mit jedem Werkzeug dieselben zwei Ableitungen und misst Zeit je Bild
und Spitzenspeicher. Jedes Werkzeug laeuft in einem eigenen Prozess, sonst
misst der zweite den Speicher des ersten mit.

    ingest/.venv/bin/python ingest/messen.py            # alle Werkzeuge
    ingest/.venv/bin/python ingest/messen.py pyvips     # nur eines (intern)
"""

from __future__ import annotations

import resource
import subprocess
import sys
import tempfile
import time
from pathlib import Path

ORIGINAL = Path("/data/kajoe_bilder/original")
ANZAHL = 50
VORSCHAU, ANSICHT = 300, 1600


def proben() -> list[Path]:
    """Gleichmaessig ueber den Bestand verteilt, damit nicht 50 Bilder aus
    demselben Monat und derselben Kamera gemessen werden."""
    alle = sorted(p for p in ORIGINAL.rglob("*")
                  if p.is_file() and p.suffix.lower() in {".heic", ".heif", ".jpg", ".png"})
    schritt = max(1, len(alle) // ANZAHL)
    return alle[::schritt][:ANZAHL]


def mit_pyvips(pfade: list[Path], ziel: Path) -> None:
    import pyvips
    for i, p in enumerate(pfade):
        for kante, q, unterabtastung in ((VORSCHAU, 80, "auto"), (ANSICHT, 88, "off")):
            im = pyvips.Image.thumbnail(str(p), kante, height=kante, size="down",
                                        input_profile="srgb", output_profile="srgb",
                                        intent="perceptual")
            im.jpegsave(str(ziel / f"{i}-{kante}.jpg"), Q=q,
                        subsample_mode=unterabtastung, optimize_coding=True,
                        keep=0)


def mit_pillow(pfade: list[Path], ziel: Path) -> None:
    """Die tatsaechlich gebaute Kette aus ableitung.py – damit die gemessene
    Zeit auch die ist, die der Stapellauf braucht."""
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import ableitung
    for i, p in enumerate(pfade):
        ableitung.bild_ableitungen(p, ziel / f"{i}-vorschau.jpg",
                                   ziel / f"{i}-ansicht.jpg")


WERKZEUGE = {"pyvips": mit_pyvips, "pillow-heif": mit_pillow}


def einzeln(name: str) -> None:
    pfade = proben()
    with tempfile.TemporaryDirectory() as tmp:
        beginn = time.perf_counter()
        WERKZEUGE[name](pfade, Path(tmp))
        dauer = time.perf_counter() - beginn
        groesse = sum(f.stat().st_size for f in Path(tmp).iterdir())
    spitze = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024
    print(f"{name}\t{dauer:.2f}\t{dauer/len(pfade)*1000:.0f}\t{spitze:.0f}\t{groesse}")


def main() -> None:
    if len(sys.argv) > 1:
        einzeln(sys.argv[1])
        return

    pfade = proben()
    print(f"{len(pfade)} Dateien aus {ORIGINAL}, je Vorschau ({VORSCHAU} px) "
          f"und Ansicht ({ANSICHT} px)\n")
    print(f"{'Werkzeug':14s} {'gesamt s':>9s} {'ms/Bild':>9s} {'Spitze MB':>10s} {'Ausgabe':>10s}")
    for name in WERKZEUGE:
        lauf = subprocess.run([sys.executable, __file__, name],
                              capture_output=True, text=True)
        if lauf.returncode != 0:
            print(f"{name:14s} gescheitert: {lauf.stderr.strip().splitlines()[-1]}")
            continue
        _, dauer, je_bild, spitze, bytes_ = lauf.stdout.strip().split("\t")
        print(f"{name:14s} {float(dauer):9.2f} {float(je_bild):9.0f} "
              f"{float(spitze):10.0f} {int(bytes_)/1024:9.0f} kB")


if __name__ == "__main__":
    main()
