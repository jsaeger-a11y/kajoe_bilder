#!/usr/bin/env python3
"""ingest/aufraeumen.py – Dateien vorgemerkter Bilder entfernen.

Zweistufiges Loeschen, zweite Stufe: Zeilen, deren `geloescht_am` laenger als
die Frist zurueckliegt, verlieren ihre Dateien – Original, Vorschau, Ansicht
und, falls vorhanden, die Wiedergabefassung.

**Die Zeile in `bild` bleibt stehen.** Sie ist der Grabstein, an dem der
naechste Ingest erkennt, dass diese Datei schon einmal da war. Ohne ihn liest
er sie aus OneDrive wieder ein, und alles, was gerade aussortiert wurde, ist
beim naechsten Kopieren zurueck. Der `sha256` bleibt deshalb erhalten.

Mehrfach ausfuehrbar: ein zweiter Lauf findet nichts mehr, weil
`vorschau_erzeugt` und `wiedergabe_erzeugt` danach auf FALSE stehen und die
Dateien weg sind.

    ingest/aufraeumen.py                # wirklich loeschen
    ingest/aufraeumen.py --nur-zaehlen  # nur sagen, was wegfiele
    ingest/aufraeumen.py --frist 30     # Frist in Tagen (Vorgabe 30)
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from datenbank import verbindung  # noqa: E402

DATEN = Path("/data/kajoe_bilder")
FRIST_TAGE = 30


def ableitungen(jahr: int, monat: int, sha256: str) -> list[Path]:
    ordner = DATEN / "abgeleitet" / f"{jahr:04d}" / f"{monat:02d}"
    return [
        ordner / f"{sha256}-vorschau.jpg",
        ordner / f"{sha256}-ansicht.jpg",
        ordner / f"{sha256}-wiedergabe.mp4",
    ]


def main() -> int:
    p = argparse.ArgumentParser(description="Dateien vorgemerkter Bilder entfernen")
    p.add_argument("--frist", type=int, default=FRIST_TAGE,
                   help=f"Tage zwischen Vormerken und Entfernen (Vorgabe {FRIST_TAGE})")
    p.add_argument("--nur-zaehlen", action="store_true")
    args = p.parse_args()

    with verbindung(autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT id::int, pfad, jahr, monat, sha256, dateigroesse,
                          to_char(geloescht_am, 'YYYY-MM-DD') AS seit
                     FROM bild
                    WHERE geloescht_am IS NOT NULL
                      AND geloescht_am < now() - %s * interval '1 day'
                    ORDER BY geloescht_am""",
                (args.frist,),
            )
            zeilen = cur.fetchall()

        print(f"{len(zeilen)} Zeile(n) laenger als {args.frist} Tage vorgemerkt")

        dateien_weg = 0
        bytes_frei = 0
        zeilen_bearbeitet = 0
        schon_sauber = 0

        for bild_id, pfad, jahr, monat, sha256, groesse, seit in zeilen:
            zu_loeschen = [DATEN / "original" / pfad, *ableitungen(jahr, monat, sha256)]
            vorhanden = [d for d in zu_loeschen if d.exists()]

            if not vorhanden:
                schon_sauber += 1
                continue

            summe = sum(d.stat().st_size for d in vorhanden)
            print(f"  Nr. {bild_id} (vorgemerkt {seit}): "
                  f"{len(vorhanden)} Datei(en), {summe / 1048576:.1f} MB")
            for d in vorhanden:
                print(f"      {d.relative_to(DATEN)}")

            if args.nur_zaehlen:
                dateien_weg += len(vorhanden)
                bytes_frei += summe
                zeilen_bearbeitet += 1
                continue

            for d in vorhanden:
                d.unlink()
            dateien_weg += len(vorhanden)
            bytes_frei += summe
            zeilen_bearbeitet += 1

            # Die Zeile BLEIBT. Nur die Merkmale werden zurueckgesetzt, damit
            # die Oberflaeche keine Ableitung mehr anbietet, die es nicht gibt
            # – und damit ein zweiter Lauf hier nichts mehr findet.
            with conn.cursor() as cur:
                cur.execute(
                    """UPDATE bild
                          SET vorschau_erzeugt = FALSE, wiedergabe_erzeugt = FALSE
                        WHERE id = %s""",
                    (bild_id,),
                )

        print()
        print(f"  {'Zeilen mit Dateien':28s} {zeilen_bearbeitet:6d}")
        print(f"  {'davon schon sauber':28s} {schon_sauber:6d}")
        print(f"  {'Dateien entfernt':28s} {dateien_weg:6d}")
        print(f"  {'Platz frei':28s} {bytes_frei / 1048576:6.1f} MB")
        if args.nur_zaehlen:
            print("  nur gezaehlt, nichts geloescht")

        # Gegenprobe ueber eine frische Abfrage: das Skript glaubt nicht seiner
        # eigenen Buchfuehrung.
        with conn.cursor() as cur:
            cur.execute("SELECT count(*) FROM bild WHERE geloescht_am IS NOT NULL")
            vorgemerkt = cur.fetchone()[0]
            cur.execute("SELECT count(*) FROM bild")
            gesamt = cur.fetchone()[0]
        print(f"\n  Zeilen in bild: {gesamt}, davon vorgemerkt: {vorgemerkt} "
              f"(die Zeilen bleiben, auch nach dem Aufraeumen)")

    return 0


if __name__ == "__main__":
    sys.exit(main())
