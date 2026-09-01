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

**Erst zaehlen, dann loeschen.** Der Lauf sammelt in einem ersten Durchgang
alles ein, was wegfiele, prueft die Obergrenze und faengt erst danach an zu
entfernen. Ein Abbruch an der Grenze laesst damit garantiert keine halb
aufgeraeumte Menge zurueck.

    ingest/aufraeumen.py                # wirklich loeschen
    ingest/aufraeumen.py --nur-zaehlen  # nur sagen, was wegfiele (= --probe)
    ingest/aufraeumen.py --frist 30     # Frist in Tagen (Vorgabe 30)
    ingest/aufraeumen.py --hoechstens N # Obergrenze fuer diesen Lauf
    ingest/aufraeumen.py --lauf-id N    # Zeile in `aufraeumlauf` nachfuehren
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from datenbank import verbindung  # noqa: E402

DATEN = Path("/data/kajoe_bilder")
FRIST_TAGE = 30

# Ab wie vielen Dateien in EINEM Lauf abgebrochen wird.
#
# Die Grenze steht hier und nirgends sonst. Sie ist keine Optimierung, sondern
# eine Notbremse: findet der Lauf auf einmal deutlich mehr als moeglich, ist
# das kein normaler Betrieb, sondern ein Versehen – ein Sammelvorgang, der
# danebenging, oder eine Abfrage, die zu viel getroffen hat. Dann ist Anhalten
# und Melden richtig und Weiterarbeiten falsch: Dateien kommen nicht zurueck.
#
# Hergeleitet: die Oberflaeche laesst hoechstens HOECHSTENS_JE_VORGANG = 500
# Aufnahmen je Sammelvorgang vormerken (web/src/lib/rechte.ts). Je Aufnahme
# fallen bis zu vier Dateien an – Original, Vorschau, Ansicht und bei Videos
# die Wiedergabefassung –, also bis zu 2.000 aus einem einzigen Vorgang.
# 2.500 laesst so einen Vorgang samt Rest eines Vortages durch und faengt
# alles darueber ab. Der ganze Bestand waere rund 50.000.
HOECHSTENS_DATEIEN = 2500

# Rueckgabewert bei Ueberschreitung – unterscheidbar von einem echten Fehler.
ABBRUCH_GRENZE = 3


def ableitungen(jahr: int, monat: int, sha256: str) -> list[Path]:
    ordner = DATEN / "abgeleitet" / f"{jahr:04d}" / f"{monat:02d}"
    return [
        ordner / f"{sha256}-vorschau.jpg",
        ordner / f"{sha256}-ansicht.jpg",
        ordner / f"{sha256}-wiedergabe.mp4",
    ]


def lauf_nachfuehren(conn, lauf_id: int | None, **werte) -> None:
    """Die Zeile in `aufraeumlauf` fortschreiben, falls es eine gibt.

    Der Lauf laeuft auch ohne Protokollzeile durch – von Hand aufgerufen gibt
    es keine. Das Protokoll ist Beiwerk und darf das Aufraeumen nicht
    aufhalten.
    """
    if lauf_id is None or not werte:
        return
    teile = ", ".join(f"{name} = %s" for name in werte)
    with conn.cursor() as cur:
        cur.execute(
            f"UPDATE aufraeumlauf SET {teile} WHERE id = %s",
            (*werte.values(), lauf_id),
        )


def main() -> int:
    p = argparse.ArgumentParser(description="Dateien vorgemerkter Bilder entfernen")
    p.add_argument("--frist", type=int, default=FRIST_TAGE,
                   help=f"Tage zwischen Vormerken und Entfernen (Vorgabe {FRIST_TAGE})")
    # --probe ist derselbe Schalter unter dem Namen, den der Timer benutzt.
    # Zwei Namen fuer dieselbe Sache sind einer zu viel, aber ein dritter
    # Schalter waere schlimmer als ein Zweitname.
    p.add_argument("--nur-zaehlen", "--probe", dest="nur_zaehlen", action="store_true",
                   help="nur sagen, was wegfiele")
    p.add_argument("--hoechstens", type=int, default=HOECHSTENS_DATEIEN,
                   help=f"Obergrenze fuer Dateien in einem Lauf (Vorgabe {HOECHSTENS_DATEIEN})")
    p.add_argument("--lauf-id", type=int, default=None,
                   help="Zeile in `aufraeumlauf`, die nachgefuehrt wird")
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

        # --- Erster Durchgang: einsammeln, nichts anfassen -----------------
        vorhaben: list[tuple[int, list[Path], int, str]] = []
        schon_sauber = 0
        dateien_gesamt = 0
        bytes_gesamt = 0

        for bild_id, pfad, jahr, monat, sha256, _groesse, seit in zeilen:
            zu_loeschen = [DATEN / "original" / pfad, *ableitungen(jahr, monat, sha256)]
            vorhanden = [d for d in zu_loeschen if d.exists()]
            if not vorhanden:
                schon_sauber += 1
                continue
            summe = sum(d.stat().st_size for d in vorhanden)
            vorhaben.append((bild_id, vorhanden, summe, seit))
            dateien_gesamt += len(vorhanden)
            bytes_gesamt += summe

        lauf_nachfuehren(
            conn, args.lauf_id,
            zeilen_faellig=len(vorhaben),
            dateien_faellig=dateien_gesamt,
            bytes_faellig=bytes_gesamt,
        )

        # --- Die Notbremse, VOR jeder Loeschung ---------------------------
        if dateien_gesamt > args.hoechstens:
            hinweis = (
                f"ABBRUCH: {dateien_gesamt} Datei(en) in {len(vorhaben)} Zeile(n) "
                f"faellig, erlaubt sind {args.hoechstens}."
            )
            print()
            print(f"  {hinweis}")
            print("  Das ist kein normaler Betrieb. Es wurde NICHTS entfernt.")
            print("  Nachsehen, woher die Menge kommt (z.B. ein Sammelvorgang, der")
            print("  danebenging – zurueckholen geht unter /vorgemerkt). Ist die Menge")
            print("  richtig, den Lauf einmal von Hand mit --hoechstens N anstossen.")
            lauf_nachfuehren(conn, args.lauf_id, ausgang="grenze", bemerkung=hinweis)
            return ABBRUCH_GRENZE

        # --- Zweiter Durchgang: berichten und (wenn scharf) entfernen ------
        dateien_weg = 0
        for bild_id, vorhanden, summe, seit in vorhaben:
            print(f"  Nr. {bild_id} (vorgemerkt {seit}): "
                  f"{len(vorhanden)} Datei(en), {summe / 1048576:.1f} MB")
            for d in vorhanden:
                print(f"      {d.relative_to(DATEN)}")

            if args.nur_zaehlen:
                continue

            for d in vorhanden:
                d.unlink()
            dateien_weg += len(vorhanden)

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
        print(f"  {'Zeilen mit Dateien':28s} {len(vorhaben):6d}")
        print(f"  {'davon schon sauber':28s} {schon_sauber:6d}")
        print(f"  {'Dateien faellig':28s} {dateien_gesamt:6d}")
        print(f"  {'Dateien entfernt':28s} {dateien_weg:6d}")
        print(f"  {'Platz':28s} {bytes_gesamt / 1048576:6.1f} MB")
        print(f"  {'Obergrenze':28s} {args.hoechstens:6d}")
        if args.nur_zaehlen:
            print("  PROBELAUF – nur gezaehlt, nichts geloescht")

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
