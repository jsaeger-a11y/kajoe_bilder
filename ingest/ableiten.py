#!/usr/bin/env python3
"""ingest/ableiten.py – Vorschau und Ansicht zu jeder Zeile in `bild`.

    tools/ableiten.sh                 # alles Offene
    tools/ableiten.sh --grenze 20     # nur die ersten 20
    tools/ableiten.sh --erneut        # auch schon Erzeugtes noch einmal
    tools/ableiten.sh --pruefen       # Flag ignorieren, wenn Dateien fehlen

Wiederaufsetzbar ueber `bild.vorschau_erzeugt`, nicht ueber eine eigene
Fortschrittstabelle: der Stand steht damit dort, wo er hingehoert, und ein
abgebrochener Lauf hinterlaesst keine zweite Wahrheit.

Eine kaputte Datei haelt die 921 anderen nicht auf – Fehler werden je Datei
vermerkt und der Lauf laeuft weiter.

Video-Wiedergabefassungen entstehen hier NICHT. Sie werden erst beim ersten
Abspielen erzeugt (siehe ableitung.wiedergabe): H.264 ist bei gleicher
Qualitaet rund doppelt so gross wie HEVC, und die meisten Videos sieht ohnehin
nie jemand an.
"""

from __future__ import annotations

import argparse
import sys
import time
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import ableitung                       # noqa: E402
import verarbeitung                    # noqa: E402
from datenbank import verbindung       # noqa: E402

DATEN = Path("/data/kajoe_bilder")
FORTSCHRITT_ALLE = 50


def ziele(abgeleitet: Path, jahr: int, monat: int, sha256: str) -> tuple[Path, Path]:
    ordner = abgeleitet / f"{jahr:04d}" / f"{monat:02d}"
    return ordner / f"{sha256}-vorschau.jpg", ordner / f"{sha256}-ansicht.jpg"


def main() -> int:
    p = argparse.ArgumentParser(description="kajoe_bilder – Ableitungen erzeugen")
    p.add_argument("--original", default=str(DATEN / "original"))
    p.add_argument("--abgeleitet", default=str(DATEN / "abgeleitet"))
    p.add_argument("--grenze", type=int, default=0)
    p.add_argument("--erneut", action="store_true",
                   help="auch Zeilen bearbeiten, die schon als erzeugt gelten")
    p.add_argument("--pruefen", action="store_true",
                   help="zusaetzlich nachsehen, ob die Dateien wirklich da sind")
    p.add_argument("--angestossen-von", type=int, default=None,
                   help="Benutzernummer, wenn aus der Oberflaeche angestossen")
    args = p.parse_args()

    original = Path(args.original)
    abgeleitet = Path(args.abgeleitet)

    # --pruefen muss die fertigen Zeilen mitlesen, sonst kann es gar nicht
    # nachsehen, ob deren Dateien noch da sind.
    alles = args.erneut or args.pruefen
    bedingung = "" if alles else "AND NOT vorschau_erzeugt"
    grenze = f"LIMIT {int(args.grenze)}" if args.grenze else ""

    zaehler = Counter()
    fehler: list[tuple[str, str]] = []

    with verbindung(autocommit=True) as conn:
        schon = verarbeitung.laeuft_schon(conn)
        if schon:
            print(f"FEHLER: es laeuft bereits ein Vorgang "
                  f"(Nr. {schon[0]}, {schon[1]}).", file=sys.stderr)
            return 2

        with conn.cursor() as cur:
            cur.execute(f"""SELECT id, sha256, pfad, typ, jahr, monat,
                                   dauer_sekunden, hdr, vorschau_erzeugt
                              FROM bild
                             WHERE geloescht_am IS NULL {bedingung}
                             ORDER BY jahr, monat, id {grenze}""")
            zeilen = cur.fetchall()

            cur.execute("SELECT count(*) FROM bild WHERE geloescht_am IS NULL")
            gesamt = cur.fetchone()[0]

            # Zeilen, die die Abfrage schon aussortiert hat, zaehlen trotzdem
            # als uebersprungen: sonst meldet ein zweiter Lauf ueber einen
            # fertigen Bestand dreimal die Null und man weiss nicht, ob er
            # nichts zu tun fand oder nichts tat.
            if not alles and not args.grenze:
                cur.execute("""SELECT count(*) FROM bild
                                WHERE geloescht_am IS NULL AND vorschau_erzeugt""")
                zaehler["uebersprungen"] = cur.fetchone()[0]

        fortschritt = verarbeitung.beginne(
            "ableiten", len(zeilen), args.angestossen_von, conn)
        fortschritt.takt(0, erzwingen=True)

        print(f"{len(zeilen)} von {gesamt} Zeile(n) zu bearbeiten")
        nutzbar, grund = ableitung.vaapi_verfuegbar()
        print(f"VAAPI: {grund}  (fuer diesen Lauf ohne Belang – "
              f"Wiedergabefassungen entstehen erst beim Abspielen)\n")

        beginn = time.monotonic()
        for i, (bild_id, sha, pfad, typ, jahr, monat, dauer, hdr, fertig) in enumerate(zeilen, 1):
            vorschau, ansicht = ziele(abgeleitet, jahr, monat, sha)

            if fertig and not args.erneut:
                # Ohne --pruefen wird dem Flag geglaubt. Mit --pruefen wird
                # nachgesehen: fehlt eine der beiden Dateien, wird sie neu
                # erzeugt.
                if not args.pruefen or (vorschau.exists() and ansicht.exists()):
                    zaehler["uebersprungen"] += 1
                    continue
                print(f"    fehlende Ableitung, wird neu erzeugt: {pfad}")

            quelle = original / pfad
            try:
                if not quelle.is_file():
                    raise ableitung.AbleitungsFehler("Original fehlt")
                if typ == "video":
                    ableitung.video_ableitungen(
                        quelle, vorschau, ansicht,
                        float(dauer) if dauer is not None else None, hdr=hdr)
                else:
                    ableitung.bild_ableitungen(quelle, vorschau, ansicht)
            except Exception as f:  # noqa: BLE001
                zaehler["fehlgeschlagen"] += 1
                text = f"{type(f).__name__}: {f}"
                fehler.append((pfad, text))
                # Namentlich, nicht nur gezaehlt: wer am Ende drei
                # Fehlschlaege sieht und nicht weiss, welche Dateien es
                # waren, kann damit nichts anfangen.
                fortschritt.fehler(pfad, text, bild_id)
                print(f"    FEHLER {pfad}: {text}", flush=True)
                continue

            # Erst die Dateien, dann das Flag. Andersherum stuende ein Bild als
            # fertig in der Datenbank, dessen Vorschau nie geschrieben wurde,
            # und kein spaeterer Lauf wuerde es noch einmal versuchen.
            with conn.cursor() as cur:
                cur.execute("UPDATE bild SET vorschau_erzeugt = TRUE WHERE id = %s",
                            (bild_id,))
            zaehler["erzeugt"] += 1

            fortschritt.takt(i)

            if i % FORTSCHRITT_ALLE == 0:
                d = time.monotonic() - beginn
                print(f"  {i}/{len(zeilen)}  erzeugt {zaehler['erzeugt']}, "
                      f"uebersprungen {zaehler['uebersprungen']}, "
                      f"fehlgeschlagen {zaehler['fehlgeschlagen']}  "
                      f"({i/d:.1f} Dateien/s)", flush=True)

        fortschritt.beende(
            "fertig" if not zaehler["fehlgeschlagen"] else "fehler",
            None if not fehler else f"{len(fehler)} Fehlschlag(e)",
            erzeugt=zaehler["erzeugt"],
            uebersprungen=zaehler["uebersprungen"],
            fehlgeschlagen=zaehler["fehlgeschlagen"],
        )

    print("\n--- Lauf ---")
    for name in ("erzeugt", "uebersprungen", "fehlgeschlagen"):
        print(f"  {name:16s} {zaehler[name]:6d}")
    summe = sum(zaehler[n] for n in ("erzeugt", "uebersprungen", "fehlgeschlagen"))
    print(f"  {'Summe':16s} {summe:6d}")
    if fehler:
        print("\n--- Fehler ---")
        for pfad, text in fehler[:50]:
            print(f"  {pfad}  {text}")
        if len(fehler) > 50:
            print(f"  … und {len(fehler)-50} weitere")
    # 3 heisst: der Schritt ist DURCHGELAUFEN, einzelne Dateien sind
    # gescheitert. Das ist etwas anderes als ein gescheiterter Schritt, und
    # seit Phase 10 haengt ein dritter Schritt daran.
    #
    # Der Unterschied ist nicht theoretisch: in diesem Bestand liegen 18
    # abgeschnittene JPEGs aus 2020, die sich nicht ableiten lassen und es nie
    # werden. Mit einer 1 waere JEDER Lauf gescheitert, die Gesichtserkennung
    # liefe nie wieder an, und der Dienst stuende dauerhaft auf `failed` – der
    # Zustand, vor dem CLAUDE.md ausdruecklich warnt.
    #
    # Sichtbar bleiben die Fehlschlaege trotzdem: namentlich in
    # `verarbeitung_fehler`, gezaehlt in `verarbeitung.fehlgeschlagen` und im
    # Bericht der Oberflaeche.
    return 3 if fehler else 0


if __name__ == "__main__":
    sys.exit(main())
