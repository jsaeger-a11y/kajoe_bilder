#!/usr/bin/env python3
"""ingest/lauf.py – Dateien aus eingang/ einlesen und katalogisieren.

Aufruf (ueber tools/einlesen.sh, das die .venv aktiviert):

    tools/einlesen.sh                    # regulaerer Lauf
    tools/einlesen.sh --trockenlauf      # nichts anfassen, nur berichten
    tools/einlesen.sh --grenze 50        # nur die ersten 50 Dateien

Mehrfach ausfuehrbar. Ein zweiter Lauf ueber denselben Bestand legt nichts
doppelt an: erkannt wird ausschliesslich ueber den SHA-256 des Inhalts.
"""

from __future__ import annotations

import argparse
import hashlib
import os
import sys
import time
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import einordnen                       # noqa: E402
import metadaten                       # noqa: E402
import verarbeitung                    # noqa: E402
from datenbank import gegenprobe, verbindung  # noqa: E402

DATEN = Path("/data/kajoe_bilder")
FORTSCHRITT_ALLE = 100

# Ab wie vielen Dateien mit auf die letzte Nachkommastelle identischer
# Koordinate diese als Platzhalter gilt. Ein Geraet mit echtem Empfaenger
# liefert nie zweimal exakt dieselbe Fliesskommazahl; Secacam-Kameras mit
# ARGUS-Firmware schreiben dagegen fuer jede Aufnahme 1,0225/1,0225.
PLATZHALTER_AB = 25


@dataclass
class Zaehler:
    gefunden: int = 0
    uebernommen: int = 0
    dubletten: int = 0
    quarantaene: int = 0
    uebersprungen: int = 0
    bereits_geloescht: int = 0
    mov_mit_bildpartner: int = 0
    herkunft: Counter = field(default_factory=Counter)
    zeitquelle: Counter = field(default_factory=Counter)
    gps: Counter = field(default_factory=Counter)


def sha256(pfad: Path) -> str:
    h = hashlib.sha256()
    with pfad.open("rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def dateien(wurzel: Path) -> list[Path]:
    """Sortierte Liste aller regulaeren Dateien unterhalb von wurzel."""
    gefunden = [
        p for p in sorted(wurzel.rglob("*"))
        if p.is_file() and not p.name.startswith(".")
    ]
    return gefunden


BILDENDUNGEN = {"HEIC", "HEIF", "JPG", "JPEG", "PNG", "TIF", "TIFF", "DNG"}
VIDEOENDUNGEN = {"MOV", "MP4", "M4V"}


def mov_partner(pfade: list[Path]) -> set[str]:
    """Staemme der MOV-Dateien, zu denen eine gleichnamige Bilddatei gehoert.

    Das Merkmal eines Live Photo. Wird EINMAL zu Beginn ueber die vollstaendige
    Liste bestimmt und danach nur noch nachgeschlagen – nicht waehrend des
    Laufs auf dem Dateisystem nachgesehen: der Lauf raeumt eingang/ ja gerade
    leer, und ob der Bildpartner noch daliegt, haengt dann an der
    Sortierreihenfolge. In 2026 ist die Menge leer, weil OneDrive den
    Bewegtteil nicht uebertraegt; auffallen soll es trotzdem, falls die alten
    Jahrgaenge anders aussehen.
    """
    bilder = {
        p.with_suffix("").as_posix().lower()
        for p in pfade
        if p.suffix.lstrip(".").upper() in BILDENDUNGEN
    }
    return {
        p.with_suffix("").as_posix().lower()
        for p in pfade
        if p.suffix.lstrip(".").upper() in VIDEOENDUNGEN
        and p.with_suffix("").as_posix().lower() in bilder
    }


def verknuepfen(quelle: Path, ziel: Path) -> None:
    """Hardlink anlegen. Beide liegen auf demselben Dateisystem.

    Ein bereits vorhandener Ziellink ist unschaedlich: der Name ist der
    SHA-256 des Inhalts, gleicher Name heisst also gleicher Inhalt. Er kann
    von einem Lauf stammen, der zwischen Verknuepfen und Commit abgebrochen
    ist – dann liegt die Datei schon da und die Zeile fehlt noch.
    """
    ziel.parent.mkdir(parents=True, exist_ok=True)
    try:
        os.link(quelle, ziel)
    except FileExistsError:
        pass


class Lauf:
    def __init__(self, args) -> None:
        self.args = args
        self.eingang = Path(args.eingang)
        self.original = Path(args.original)
        self.quarantaene = Path(args.quarantaene)
        self.trocken = args.trockenlauf
        self.zaehler = Zaehler()
        self.lauf_id: int | None = None
        self.gegengeprueft = False
        self.partner: set[str] = set()
        self.conn = None
        self.fortschritt: verarbeitung.Lauf | None = None

    # -- Buchfuehrung ------------------------------------------------------

    def beginne(self, quelle_id: int | None) -> None:
        if self.trocken:
            return
        with self.conn.cursor() as cur:
            cur.execute(
                "INSERT INTO ingest_lauf (quelle_id) VALUES (%s) RETURNING id",
                (quelle_id,),
            )
            self.lauf_id = cur.fetchone()[0]
        if self.fortschritt is not None:
            self.fortschritt.verknuepfe_ingest(self.lauf_id)

    def schliesse_ab(self, bemerkung: str | None = None) -> None:
        if self.trocken or self.lauf_id is None:
            return
        z = self.zaehler
        with self.conn.cursor() as cur:
            cur.execute(
                """UPDATE ingest_lauf
                      SET beendet_am = now(), gefunden = %s, uebernommen = %s,
                          dubletten = %s, quarantaene = %s, uebersprungen = %s,
                          mov_mit_bildpartner = %s, bemerkung = %s
                    WHERE id = %s""",
                (z.gefunden, z.uebernommen, z.dubletten, z.quarantaene,
                 z.uebersprungen, z.mov_mit_bildpartner,
                 self._bemerkung(bemerkung), self.lauf_id),
            )
        with self.conn.cursor() as cur:
            cur.execute("UPDATE ingest_lauf SET aktualisiert_am = now() WHERE id = %s",
                        (self.lauf_id,))

    def zwischenstand(self) -> None:
        """Zaehler des laufenden ingest_lauf fortschreiben."""
        if self.trocken or self.lauf_id is None:
            return
        z = self.zaehler
        with self.conn.cursor() as cur:
            cur.execute(
                """UPDATE ingest_lauf
                      SET gefunden = %s, uebernommen = %s, dubletten = %s,
                          quarantaene = %s, uebersprungen = %s,
                          mov_mit_bildpartner = %s, aktualisiert_am = now()
                    WHERE id = %s""",
                (z.gefunden, z.uebernommen, z.dubletten, z.quarantaene,
                 z.uebersprungen, z.mov_mit_bildpartner, self.lauf_id),
            )

    def _bemerkung(self, bemerkung: str | None) -> str | None:
        """Schon geloeschte Wiedergaenger gehoeren in den Laufbericht.

        Sie stecken sonst unsichtbar in der Zahl der Dubletten, und gerade sie
        will man spaeter wiederfinden: sie sind der Beleg, dass das Aussortieren
        gehalten hat.
        """
        teile = [t for t in (bemerkung,) if t]
        if self.zaehler.bereits_geloescht:
            teile.append(
                f"{self.zaehler.bereits_geloescht} Datei(en) uebersprungen, weil ihre "
                f"Zeile als geloescht vermerkt ist"
            )
        return "; ".join(teile) if teile else None

    # -- Einzelne Datei ----------------------------------------------------

    def in_quarantaene(self, pfad: Path, grund: str, groesse: int | None) -> None:
        """Erst verknuepfen, dann eintragen, dann aus eingang loesen.

        Dieselbe Reihenfolge wie beim regulaeren Weg und aus demselben Grund:
        eine Datei, die verschoben ist und in keiner Tabelle steht, ist
        verloren, ohne dass es jemandem auffaellt.
        """
        self.zaehler.quarantaene += 1
        rel = pfad.relative_to(self.eingang)
        print(f"    Quarantaene: {rel}  ({grund})")
        if self.trocken:
            return

        verknuepfen(pfad, self.quarantaene / rel)
        with self.conn.cursor() as cur:
            cur.execute(
                """INSERT INTO quarantaene (pfad, dateigroesse, grund, ingest_lauf_id)
                   VALUES (%s, %s, %s, %s)""",
                (rel.as_posix(), groesse, grund, self.lauf_id),
            )
        pfad.unlink()

    def uebernimm(self, pfad: Path, md: dict, quelle_id: int | None) -> None:
        rel = pfad.relative_to(self.eingang)
        z = self.zaehler

        art = einordnen.typ(md)
        if art is None:
            roh = metadaten.wert(md, "File:FileType") or "(kein FileType)"
            self.in_quarantaene(pfad, f"nicht unterstuetzter dateityp: {roh}",
                                pfad.stat().st_size)
            return

        make, model = einordnen.geraet(md)

        # Wildkamera VOR dem Hashen: die Datei bekommt keine Zeile, also
        # braucht sie auch keine Pruefsumme.
        if einordnen.ist_wildkamera(make):
            z.uebersprungen += 1
            print(f"    uebersprungen (Wildkamera {make}): {rel}")
            if not self.trocken:
                # Nicht loeschen, nur aus dem Weg raeumen: die Aufnahmen
                # liegen sonst nirgends auf dieser Maschine, und der Auftrag
                # will sie lediglich aus eingang/ heraus haben.
                verknuepfen(pfad, DATEN / "uebersprungen" / "wildkamera" / rel)
                pfad.unlink()
            return

        pruefsumme = sha256(pfad)
        groesse = pfad.stat().st_size

        with self.conn.cursor() as cur:
            cur.execute(
                "SELECT pfad, geloescht_am FROM bild WHERE sha256 = %s",
                (pruefsumme,),
            )
            treffer = cur.fetchone()

        zeitangabe = einordnen.zeit(md, pfad, rel.as_posix())
        ziel_rel = Path(f"{zeitangabe.lokal.year:04d}/{zeitangabe.lokal.month:02d}"
                        f"/{pruefsumme}.{art.endung}")

        if treffer:
            # Dublette. Ausschliesslich ueber den Inhalt erkannt, nie ueber den
            # Dateinamen: iPhones zaehlen IMG_0001..IMG_9999 und fangen wieder
            # von vorn an.
            z.dubletten += 1
            vorhanden = self.original / treffer[0]
            geloescht_am = treffer[1]

            if geloescht_am is not None:
                # **Grabstein.** Diese Datei war schon einmal da und wurde
                # ausdruecklich aussortiert. Sie wird NICHT neu angelegt und
                # NICHT neu verknuepft – sonst waere alles, was jemand
                # weggeraeumt hat, beim naechsten Kopieren aus OneDrive
                # zurueck, und niemand wuesste, warum.
                z.bereits_geloescht += 1
                print(f"    schon geloescht am {geloescht_am:%Y-%m-%d}, "
                      f"uebersprungen: {rel}")
                if not self.trocken:
                    pfad.unlink()
                return

            if not self.trocken:
                if not vorhanden.exists():
                    # Zeile da, Datei weg – reparieren statt wegwerfen.
                    print(f"    Dublette, Original fehlte, neu verknuepft: {treffer[0]}")
                    verknuepfen(pfad, vorhanden)
                pfad.unlink()
            return

        lat, lon, gps_status = einordnen.ort(md)
        breite, hoehe, ausrichtung = einordnen.masse(md)
        dauer, codec, hdr = einordnen.videoangaben(md) if art.art == "video" else (None, None, False)
        # Masse und Art gehen mit ein: ein Bildschirmfoto erkennt man an der
        # Kombination aus Bildschirmaufloesung und fehlendem `Make`, und ein
        # Video ist nie eines. `masse()` steht deshalb eine Zeile hoeher.
        kategorie = einordnen.herkunft(make, model, breite, hoehe, art.art == "bild")

        if self.trocken:
            z.uebernommen += 1
            z.herkunft[kategorie] += 1
            z.zeitquelle[zeitangabe.quelle] += 1
            z.gps[gps_status] += 1
            return

        # --- Reihenfolge: verknuepfen, eintragen, erst dann loesen ---------
        # Naheliegend waere, die Datei zuerst zu verschieben. Bricht der Lauf
        # dann zwischen Verschieben und Zeile ab, liegt sie am Ziel und ist in
        # keiner Tabelle verzeichnet – der naechste Lauf findet sie in eingang
        # nicht mehr und merkt nichts davon.
        verknuepfen(pfad, self.original / ziel_rel)

        with self.conn.cursor() as cur:
            cur.execute(
                """INSERT INTO bild (
                       sha256, dateiname, pfad, dateigroesse, dateityp, typ,
                       live_photo, herkunft, geraet_hersteller, geraet_modell,
                       quelle_id, ingest_lauf_id,
                       aufnahme_lokal, aufnahme_utc, zeitversatz, zeitquelle,
                       jahr, monat,
                       breite, hoehe, ausrichtung, dauer_sekunden, video_codec, hdr,
                       lat, lon, gps_status)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,
                           %s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                   ON CONFLICT (sha256) DO NOTHING
                   RETURNING id""",
                (pruefsumme, pfad.name, ziel_rel.as_posix(), groesse,
                 art.dateityp, art.art, self.ist_live_photo(pfad, dauer),
                 kategorie, make or None, model or None,
                 quelle_id, self.lauf_id,
                 zeitangabe.lokal, zeitangabe.utc, zeitangabe.versatz,
                 zeitangabe.quelle, zeitangabe.lokal.year, zeitangabe.lokal.month,
                 breite, hoehe, ausrichtung, dauer, codec, hdr,
                 lat, lon, gps_status),
            )
            neu = cur.fetchone()

        if neu is None:
            # Zwischen SELECT und INSERT ist derselbe Inhalt dazugekommen.
            z.dubletten += 1
            pfad.unlink()
            return

        # Autocommit heisst: die Zeile steht jetzt wirklich. Einmal je Lauf
        # wird das ueber eine ZWEITE Verbindung nachgeprueft – die eigene
        # Sitzung saehe auch das, was nur in ihrer offenen Transaktion steht.
        if not self.gegengeprueft:
            self.gegengeprueft = True
            sichtbar = gegenprobe(pruefsumme)
            print(f"    Gegenprobe ueber zweite Verbindung: {sichtbar} Zeile(n) "
                  f"fuer die erste Pruefsumme sichtbar")
            if sichtbar != 1:
                raise SystemExit(
                    "ABBRUCH: die erste Zeile ist ueber eine zweite Verbindung "
                    "nicht sichtbar – es wird nicht committet."
                )

        pfad.unlink()

        z.uebernommen += 1
        z.herkunft[kategorie] += 1
        z.zeitquelle[zeitangabe.quelle] += 1
        z.gps[gps_status] += 1

    def ist_live_photo(self, pfad: Path, dauer: float | None) -> bool:
        """Gleichnamige Bilddatei UND unter fuenf Sekunden."""
        if dauer is None or not (0 < dauer < 5):
            return False
        return pfad.with_suffix("").as_posix().lower() in self.partner

    # -- Nachlauf ----------------------------------------------------------

    def platzhalter_koordinaten(self) -> list[tuple[float, float, int]]:
        """Koordinaten, die auf die letzte Nachkommastelle mehrfach vorkommen.

        Laeuft ueber den gesamten Bestand, nicht nur ueber diesen Lauf: ein
        Platzhalter faellt erst auf, wenn genug Dateien mit ihm dastehen, und
        die koennen aus mehreren Laeufen stammen.
        """
        if self.trocken:
            return []
        with self.conn.cursor() as cur:
            cur.execute(
                """SELECT lat, lon, count(*)
                     FROM bild
                    WHERE gps_status = 'ok'
                    GROUP BY lat, lon
                   HAVING count(*) >= %s
                    ORDER BY 3 DESC""",
                (PLATZHALTER_AB,),
            )
            verdaechtig = cur.fetchall()

            for lat, lon, anzahl in verdaechtig:
                cur.execute(
                    """UPDATE bild SET gps_status = 'unplausibel'
                        WHERE lat = %s AND lon = %s AND gps_status = 'ok'""",
                    (lat, lon),
                )
        return verdaechtig

    # -- Durchlauf ---------------------------------------------------------

    def durchlauf(self) -> None:
        z = self.zaehler
        pfade = dateien(self.eingang)
        if self.args.grenze:
            pfade = pfade[: self.args.grenze]
        z.gefunden = len(pfade)
        self.partner = mov_partner(pfade)
        z.mov_mit_bildpartner = len(self.partner)

        if self.fortschritt is not None:
            self.fortschritt.gesamt = z.gefunden
            self.fortschritt.takt(0, erzwingen=True)

        print(f"gefunden: {z.gefunden} Datei(en) in {self.eingang}")
        print(f"MOV mit gleichnamiger Bilddatei: {z.mov_mit_bildpartner}")
        if self.trocken:
            print("TROCKENLAUF – es wird nichts angefasst und nichts geschrieben")
        print()

        quelle_id = None
        if not self.trocken:
            with self.conn.cursor() as cur:
                cur.execute(
                    "SELECT id FROM quelle WHERE bezeichnung = %s ORDER BY id LIMIT 1",
                    (self.args.quelle,),
                )
                treffer = cur.fetchone()
                if treffer is None:
                    cur.execute(
                        "INSERT INTO quelle (bezeichnung) VALUES (%s) RETURNING id",
                        (self.args.quelle,),
                    )
                    treffer = cur.fetchone()
                quelle_id = treffer[0]
        self.beginne(quelle_id)

        beginn = time.monotonic()
        erledigt = 0
        for pfad, md in metadaten.stapelweise(pfade):
            erledigt += 1
            try:
                if md is None:
                    self.in_quarantaene(pfad, "metadaten nicht lesbar",
                                        pfad.stat().st_size)
                elif pfad.stat().st_size == 0:
                    self.in_quarantaene(pfad, "leere datei", 0)
                else:
                    self.uebernimm(pfad, md, quelle_id)
            except SystemExit:
                raise
            except OSError as fehler:
                self.in_quarantaene(pfad, f"nicht lesbar: {fehler}", None)
            except Exception as fehler:  # noqa: BLE001
                self.in_quarantaene(pfad, f"{type(fehler).__name__}: {fehler}", None)

            if erledigt % FORTSCHRITT_ALLE == 0:
                dauer = time.monotonic() - beginn
                print(f"  {erledigt}/{z.gefunden}  "
                      f"uebernommen {z.uebernommen}, Dubletten {z.dubletten}, "
                      f"Quarantaene {z.quarantaene}, uebersprungen {z.uebersprungen}"
                      f"  ({erledigt/dauer:.1f} Dateien/s)", flush=True)
                # Der Stand gehoert in die Datenbank, nicht nur auf den
                # Bildschirm: die Anzeige im Browser liest ihn von dort, und
                # ein abgebrochener Lauf hinterlaesst so wenigstens eine
                # wahre Zahl.
                self.zwischenstand()

            if self.fortschritt is not None:
                self.fortschritt.takt(erledigt)

        print()
        verdaechtig = self.platzhalter_koordinaten()
        for lat, lon, anzahl in verdaechtig:
            print(f"  Platzhalterkoordinate {lat}/{lon} bei {anzahl} Dateien "
                  f"→ gps_status auf 'unplausibel' gesetzt")

    def bericht(self) -> None:
        z = self.zaehler
        print("--- Lauf ---")
        for name, wert_ in (
            ("gefunden", z.gefunden), ("uebernommen", z.uebernommen),
            ("Dubletten", z.dubletten), ("Quarantaene", z.quarantaene),
            ("uebersprungen (Wildkamera)", z.uebersprungen),
            ("davon schon geloescht", z.bereits_geloescht),
            ("MOV mit Bildpartner", z.mov_mit_bildpartner),
        ):
            print(f"  {name:28s} {wert_:6d}")

        summe = z.uebernommen + z.dubletten + z.quarantaene + z.uebersprungen
        print(f"  {'Summe (ohne Bildpartner)':28s} {summe:6d}"
              f"   {'stimmt' if summe == z.gefunden else 'STIMMT NICHT'}")
        if z.bereits_geloescht:
            print(f"  ({z.bereits_geloescht} der Dubletten sind Zeilen, die vorgemerkt "
                  f"oder schon aufgeraeumt waren – sie werden nicht neu angelegt.)")

        for titel, zaehler in (("Herkunft", z.herkunft),
                               ("Zeitquelle", z.zeitquelle),
                               ("GPS", z.gps)):
            if zaehler:
                print(f"\n--- {titel} (dieser Lauf) ---")
                for k, v in zaehler.most_common():
                    print(f"  {k:16s} {v:6d}  {100*v/max(z.uebernommen,1):5.1f} %")


def main() -> int:
    p = argparse.ArgumentParser(description="kajoe_bilder – Dateien einlesen")
    p.add_argument("--eingang", default=str(DATEN / "eingang"))
    p.add_argument("--original", default=str(DATEN / "original"))
    p.add_argument("--quarantaene", default=str(DATEN / "quarantaene"))
    p.add_argument("--quelle", default="OneDrive – Erstbestand",
                   help="Bezeichnung in der Tabelle quelle")
    p.add_argument("--grenze", type=int, default=0,
                   help="hoechstens so viele Dateien bearbeiten (zum Proben)")
    p.add_argument("--trockenlauf", action="store_true",
                   help="nichts verschieben, nichts schreiben")
    p.add_argument("--angestossen-von", type=int, default=None,
                   help="Benutzernummer, wenn aus der Oberflaeche angestossen")
    args = p.parse_args()

    if not Path(args.eingang).is_dir():
        print(f"FEHLER: {args.eingang} ist kein Verzeichnis", file=sys.stderr)
        return 1

    lauf = Lauf(args)
    # autocommit=True ist hier keine Bequemlichkeit, sondern Voraussetzung:
    # siehe datenbank.verbindung().
    with verbindung(autocommit=True) as conn:
        lauf.conn = conn
        bemerkung = None
        zustand = "fertig"

        if not args.trockenlauf:
            schon = verarbeitung.laeuft_schon(conn)
            if schon:
                print(f"FEHLER: es laeuft bereits ein Vorgang "
                      f"(Nr. {schon[0]}, {schon[1]}).", file=sys.stderr)
                return 2
            lauf.fortschritt = verarbeitung.beginne(
                "einlesen", 0, args.angestossen_von, conn)

        try:
            lauf.durchlauf()
        except KeyboardInterrupt:
            bemerkung = "abgebrochen (Strg-C)"
            zustand = "abgebrochen"
            print("\nabgebrochen – der Stand ist committet, ein neuer Lauf "
                  "macht weiter", file=sys.stderr)
        except SystemExit as fehler:
            bemerkung = str(fehler)
            zustand = "fehler"
            raise
        except Exception as fehler:  # noqa: BLE001
            bemerkung = f"{type(fehler).__name__}: {fehler}"
            zustand = "fehler"
            raise
        finally:
            lauf.schliesse_ab(bemerkung)
            if lauf.fortschritt is not None:
                lauf.fortschritt.beende(zustand, bemerkung)
            lauf.bericht()
    return 0


if __name__ == "__main__":
    sys.exit(main())
