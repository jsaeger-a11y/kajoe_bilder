#!/usr/bin/env python3
"""ingest/wiedergeben.py – eine Wiedergabefassung erzeugen.

Duenner Aufruf um `ableitung.wiedergabe()` aus Phase 1b, damit die
Weboberflaeche ihn anstossen kann. Die Logik selbst bleibt an einer Stelle:
zwei Fassungen derselben ffmpeg-Zeile laufen frueher oder spaeter auseinander.

    ingest/wiedergeben.py --quelle <datei> --ziel <datei> [--hdr]

Gibt eine JSON-Zeile auf die Standardausgabe:

    {"ok": true, "weg": "vaapi", "sekunden": 12.3, "groesse": 44210688}
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import ableitung  # noqa: E402


def main() -> int:
    p = argparse.ArgumentParser(description="Wiedergabefassung erzeugen")
    p.add_argument("--quelle", required=True)
    p.add_argument("--ziel", required=True)
    p.add_argument("--hdr", action="store_true")
    p.add_argument("--hoehe", type=int, default=1080)
    args = p.parse_args()

    quelle = Path(args.quelle)
    ziel = Path(args.ziel)

    if not quelle.is_file():
        print(json.dumps({"ok": False, "fehler": f"Original fehlt: {quelle}"}))
        return 1

    # Unter einem anderen Namen schreiben und erst danach umbenennen: eine
    # abgebrochene Umwandlung darf nicht als fertige Fassung liegenbleiben und
    # dem naechsten Aufruf ein halbes Video unterschieben.
    #
    # Die Endung .mp4 bleibt dabei stehen. ffmpeg leitet das Containerformat
    # aus ihr ab; ein Ziel namens "…mp4.unfertig" scheitert mit
    # "Error opening output files: Invalid argument".
    roh = ziel.with_name(f"{ziel.stem}.unfertig{ziel.suffix}")
    try:
        u = ableitung.wiedergabe(quelle, roh, hdr=args.hdr, hoehe=args.hoehe)
    except ableitung.AbleitungsFehler as fehler:
        roh.unlink(missing_ok=True)
        print(json.dumps({"ok": False, "fehler": str(fehler)}))
        return 1

    roh.replace(ziel)
    print(json.dumps({
        "ok": True, "weg": u.weg,
        "sekunden": round(u.sekunden, 2),
        "groesse": ziel.stat().st_size,
    }))
    return 0


if __name__ == "__main__":
    sys.exit(main())
