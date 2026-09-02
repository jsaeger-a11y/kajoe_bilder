#!/usr/bin/env python3
"""ingest/screenshots_nachtragen.py – vorhandene Zeilen neu bewerten.

Der Ingest erkennt Bildschirmfotos seit Migration 009. Die Zeilen, die VOR
dieser Migration eingelesen wurden, tragen weiterhin `ohne_exif` – dort lagen
Bildschirmfotos mit allem anderen ohne `Make` zusammen. Dieses Skript holt sie
heraus.

    ingest/screenshots_nachtragen.py            zaehlen und Belege legen
    ingest/screenshots_nachtragen.py --scharf   und wirklich schreiben

**Zaehlen ist die Vorgabe.** Ohne `--scharf` wird keine Zeile angefasst; es
werden nur die Zahl genannt und die Bildbelege gelegt. Eine Zahl sagt nicht,
ob die Erkennung taugt – dafuer muss man ein paar Treffer ansehen.

**Nur `ohne_exif` wird angefasst.** `iphone`, `apple_sonstig` und `fremd`
bleiben unberuehrt: dort ist ein `Make` vorhanden, also ist es per Definition
kein Bildschirmfoto. Ein Nachlauf, der auch dort suchte, koennte nur Schaden
anrichten.

**Wiederholt ausfuehrbar.** Ein zweiter Lauf findet nichts mehr, weil die
umgesetzten Zeilen dann `screenshot` tragen und nicht mehr in die Auswahl
fallen.

**Dieselbe Erkennung wie der Ingest**, aus tools/bestand.py – nicht als
SQL-Bedingung nachgebaut. Zwei Fassungen derselben Regel laufen frueher oder
spaeter auseinander, und dann urteilt der Nachlauf anders als der naechste
Ingest ueber dieselbe Datei. Die Bildmasse stehen schon in `bild.breite` und
`bild.hoehe`; die Dateien werden dafuer nicht noch einmal gelesen.
"""

from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tools"))

from bestand import ist_bildschirmgroesse  # noqa: E402
from datenbank import verbindung  # noqa: E402

DATEN = Path("/data/kajoe_bilder")
BELEGE = DATEN / "probe" / "screenshots"

# So viele Treffer werden als Bild abgelegt. Genug, um sich ein Urteil zu
# bilden, wenig genug, um sie tatsaechlich anzusehen.
BELEGE_ANZAHL = 12


def beleg_quelle(jahr: int, monat: int, sha256: str, pfad: str) -> Path | None:
    """Die handlichste vorhandene Fassung: Ansicht, sonst Vorschau, sonst Original."""
    ordner = DATEN / "abgeleitet" / f"{jahr:04d}" / f"{monat:02d}"
    for kandidat in (ordner / f"{sha256}-ansicht.jpg",
                     ordner / f"{sha256}-vorschau.jpg",
                     DATEN / "original" / pfad):
        if kandidat.exists():
            return kandidat
    return None


def main() -> int:
    p = argparse.ArgumentParser(description="ohne_exif neu bewerten")
    p.add_argument("--scharf", action="store_true",
                   help="wirklich schreiben (Vorgabe: nur zaehlen)")
    p.add_argument("--belege", type=int, default=BELEGE_ANZAHL,
                   help=f"so viele Bildbelege ablegen (Vorgabe {BELEGE_ANZAHL})")
    args = p.parse_args()

    with verbindung(autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT id::int, dateiname, typ, dateityp, breite, hoehe,
                          jahr, monat, sha256, pfad
                     FROM bild
                    WHERE herkunft = 'ohne_exif'
                    ORDER BY id""",
            )
            zeilen = cur.fetchall()

        treffer = [
            z for z in zeilen
            if z[2] == "bild" and ist_bildschirmgroesse(z[4], z[5])
        ]

        print(f"{len(zeilen)} Zeile(n) mit herkunft = 'ohne_exif'")
        print(f"{len(treffer)} davon sind Bildschirmfotos "
              f"({100 * len(treffer) / len(zeilen):.1f} %)" if zeilen else "")

        if treffer:
            nach_masse: dict[str, int] = {}
            for z in treffer:
                nach_masse[f"{z[4]}x{z[5]}"] = nach_masse.get(f"{z[4]}x{z[5]}", 0) + 1
            print("\n  nach Aufloesung:")
            for masse, anzahl in sorted(nach_masse.items(), key=lambda x: -x[1]):
                print(f"    {masse:>12s}  {anzahl:5d}")

        # --- Bildbelege ---------------------------------------------------
        # Ob die Erkennung taugt, sieht man nicht an einer Zahl.
        gelegt = 0
        if treffer and args.belege > 0:
            BELEGE.mkdir(parents=True, exist_ok=True)
            for alt in BELEGE.glob("*"):
                if alt.is_file():
                    alt.unlink()
            schritt = max(1, len(treffer) // args.belege)
            for z in treffer[::schritt][:args.belege]:
                quelle = beleg_quelle(z[6], z[7], z[8], z[9])
                if quelle is None:
                    continue
                ziel = BELEGE / f"{z[0]}-{z[4]}x{z[5]}-{z[1][:40]}{quelle.suffix}"
                shutil.copy2(quelle, ziel)
                gelegt += 1
            print(f"\n  {gelegt} Bildbeleg(e) in {BELEGE}")
            print("  Bitte ansehen: sind das wirklich Bildschirmfotos?")

        # --- Schreiben ----------------------------------------------------
        if not args.scharf:
            print("\n  NUR GEZAEHLT – keine Zeile geaendert.")
            print("  Wenn die Belege ueberzeugen: noch einmal mit --scharf.")
            return 0

        with conn.cursor() as cur:
            cur.execute(
                """UPDATE bild SET herkunft = 'screenshot'
                    WHERE id = ANY(%s) AND herkunft = 'ohne_exif'""",
                ([z[0] for z in treffer],),
            )
            geschrieben = cur.rowcount

        print(f"\n  {geschrieben} Zeile(n) auf 'screenshot' gesetzt.")

        # Gegenprobe ueber eine frische Abfrage: das Skript glaubt nicht seiner
        # eigenen Buchfuehrung. Die Summe ueber alle Herkunftswerte muss
        # weiterhin die Gesamtzahl ergeben – umgeteilt, nicht verloren.
        with conn.cursor() as cur:
            cur.execute("SELECT herkunft, count(*) FROM bild GROUP BY 1 ORDER BY 1")
            verteilung = cur.fetchall()
            cur.execute("SELECT count(*) FROM bild")
            gesamt = cur.fetchone()[0]
        print("\n  Herkunft nach dem Lauf:")
        for name, anzahl in verteilung:
            print(f"    {name:16s} {anzahl:7d}")
        summe = sum(a for _, a in verteilung)
        print(f"    {'Summe':16s} {summe:7d}  "
              f"{'stimmt' if summe == gesamt else f'ABWEICHUNG, bild hat {gesamt}'}")
        return 0


if __name__ == "__main__":
    sys.exit(main())
