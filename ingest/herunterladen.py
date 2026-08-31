#!/usr/bin/env python3
"""ingest/herunterladen.py – Dateien zum Herunterladen bereitstellen.

Zwei Betriebsarten, beide schreiben nach **stdout**; alles Erklaerende geht
nach stderr, damit der Strom sauber bleibt.

    herunterladen.py einzeln --id 42 --art jpeg
    herunterladen.py paket   --art jpeg --ordner "Kalender 2027" < ids.txt

Die Berechtigung wird NICHT hier geprueft. Das tut die Weboberflaeche, die
weiss, wer angemeldet ist und welche Liste wem gehoert. Dieses Werkzeug
bekommt eine Liste von Kennungen und fuehrt aus.

**Im Datenstrom, nicht im Speicher.** Ein Paket aus zweihundert Vollbildern
ist gut ein Gigabyte; wer es erst im Speicher zusammensetzt oder auf die
Platte legt, wirft den Dienst bei zwei gleichzeitigen Anfragen um. Deshalb
geht jede Datei einzeln durch: umwandeln, hineinschreiben, wegwerfen.
"""

from __future__ import annotations

import argparse
import errno
import re
import shutil
import sys
import tempfile
import zipfile
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from datenbank import verbindung  # noqa: E402

DATEN = Path("/data/kajoe_bilder")
ORIGINAL = DATEN / "original"

# Endung nach Dateityp fuer die JPEG-Ausfuehrung.
JPEG_TYPEN = {"JPEG"}


def melde(*teile: object) -> None:
    print(*teile, file=sys.stderr, flush=True)


# ---------------------------------------------------------------------------
# Namen
# ---------------------------------------------------------------------------

def sauber(text: str) -> str:
    """Fuer Ordnernamen im Paket: nichts, was einen Pfad aufmacht."""
    text = text.replace("/", "-").replace("\\", "-")
    text = re.sub(r"[\x00-\x1f\x7f]", "", text)
    text = re.sub(r"\s+", " ", text).strip(" .")
    return text[:60] or "Auswahl"


def dateiname(aufnahme: datetime, endung: str) -> str:
    """`2023-07-15_142305.jpg`.

    Der sha256 sagt niemandem etwas. Aufnahmedatum und Uhrzeit dagegen sind
    sortierbar, eindeutig genug und ueberall unfaellig – keine Umlaute, keine
    Sonderzeichen, keine Leerzeichen.
    """
    return f"{aufnahme:%Y-%m-%d_%H%M%S}.{endung.lower().lstrip('.')}"


def eindeutig(name: str, vergeben: set[str]) -> str:
    """Doppelte Namen bekommen einen Zusatz.

    Zwei Aufnahmen in derselben Sekunde kommen bei Serienbildern vor, und ein
    Paket mit zwei gleichnamigen Eintraegen packt mancher Entpacker
    stillschweigend uebereinander – dann fehlt hinterher ein Bild und niemand
    weiss, welches.
    """
    if name not in vergeben:
        vergeben.add(name)
        return name
    stamm, _, endung = name.rpartition(".")
    nummer = 2
    while f"{stamm}-{nummer}.{endung}" in vergeben:
        nummer += 1
    neu = f"{stamm}-{nummer}.{endung}"
    vergeben.add(neu)
    return neu


# ---------------------------------------------------------------------------
# Eine Datei bereitstellen
# ---------------------------------------------------------------------------

def hole_zeilen(ids: list[int]) -> list[dict]:
    """Zeilen in der Reihenfolge der uebergebenen Kennungen."""
    if not ids:
        return []
    with verbindung() as conn, conn.cursor() as cur:
        cur.execute(
            """SELECT id::int, pfad, dateityp, typ, aufnahme_lokal, dateigroesse
                 FROM bild
                WHERE id = ANY(%s) AND geloescht_am IS NULL""",
            (ids,),
        )
        nach_id = {
            z[0]: {"id": z[0], "pfad": z[1], "dateityp": z[2], "typ": z[3],
                   "aufnahme": z[4], "groesse": int(z[5])}
            for z in cur.fetchall()
        }
    return [nach_id[i] for i in ids if i in nach_id]


def unveraendert(zeile: dict, art: str) -> bool:
    """Wird die Originaldatei durchgereicht?

    Drei Regeln, und sie stehen HIER:

    * **Videos gehen immer als Original.** Die Wiedergabefassung ist zum
      Ansehen im Browser gedacht, nicht zum Behalten – sie ist teils groesser
      als das Original und schlechter.
    * **Ein JPEG-Original wird unveraendert ausgeliefert**, auch unter "JPEG".
      Ein zweites Kodieren waere eine weitere Generation ohne jeden Gewinn.
      Das betrifft rund ein Fuenftel des Bestands.
    * Alles andere wird nach JPEG umgewandelt.

    Die Weboberflaeche braucht dieselbe Regel, um die Kopfzeile mit dem
    Dateinamen zu setzen, bevor der Strom laeuft; sie steht dort noch einmal
    in `web/src/lib/herunterladen.ts`. Damit die beiden nicht auseinander
    laufen, gibt es `herunterladen.py name` und eine Gegenprobe darueber.
    """
    return art == "original" or zeile["typ"] == "video" or zeile["dateityp"] in JPEG_TYPEN


def zielendung(zeile: dict, art: str) -> str:
    if unveraendert(zeile, art):
        return Path(zeile["pfad"]).suffix.lstrip(".").lower() or "bin"
    return "jpg"


def bereitstellen(zeile: dict, art: str, tempordner: Path) -> tuple[Path, str, bool]:
    """(Pfad zur auszuliefernden Datei, Endung, ist_temporaer)."""
    quelle = ORIGINAL / zeile["pfad"]
    endung = zielendung(zeile, art)

    if unveraendert(zeile, art):
        return quelle, endung, False

    # Erst hier laden: `ableitung` zieht pillow-heif mit, und das kostet
    # rund eine Drittelsekunde. Wer ein Original oder ein Video holt, soll
    # nicht dafuer bezahlen – und das ist der haeufigere Fall.
    import ableitung

    ziel = tempordner / f"{zeile['id']}.jpg"
    ableitung.download_jpeg(quelle, ziel)
    return ziel, "jpg", True


# ---------------------------------------------------------------------------
# Betriebsarten
# ---------------------------------------------------------------------------

def einzeln(bild_id: int, art: str) -> int:
    zeilen = hole_zeilen([bild_id])
    if not zeilen:
        melde(f"Zeile {bild_id} gibt es nicht oder sie ist vorgemerkt.")
        return 1

    with tempfile.TemporaryDirectory(prefix="kajoe-download-") as tmp:
        pfad, _, _ = bereitstellen(zeilen[0], art, Path(tmp))
        if not pfad.is_file():
            melde(f"Datei fehlt: {pfad}")
            return 1
        try:
            with pfad.open("rb") as f:
                shutil.copyfileobj(f, sys.stdout.buffer, length=1 << 20)
            sys.stdout.buffer.flush()
        except (BrokenPipeError, ConnectionResetError):
            melde("Abnehmer weg")
            return 1
    return 0


def _schreiben(zeilen: list[dict], art: str, unterordner: str,
               vergeben: set[str]) -> int:
    """Schreibt das Paket. Ein abgebrochener Strom kommt als
    BrokenPipeError heraus und beendet den Lauf."""
    geschrieben = 0
    with tempfile.TemporaryDirectory(prefix="kajoe-paket-") as tmp:
        tempordner = Path(tmp)
        with zipfile.ZipFile(sys.stdout.buffer, "w", allowZip64=True) as z:
            for zeile in zeilen:
                try:
                    pfad, endung, temporaer = bereitstellen(zeile, art, tempordner)
                    if not pfad.is_file():
                        melde(f"uebersprungen, Datei fehlt: {zeile['pfad']}")
                        continue

                    name = eindeutig(dateiname(zeile["aufnahme"], endung), vergeben)
                    groesse = pfad.stat().st_size

                    eintrag = zipfile.ZipInfo(
                        f"{unterordner}/{name}",
                        date_time=zeile["aufnahme"].timetuple()[:6],
                    )
                    # STORED, nicht DEFLATE: JPEG, HEIC und MP4 lassen sich
                    # nicht mehr zusammendruecken. Das spart die gesamte
                    # Rechenzeit und macht den Strom schneller als die Leitung.
                    eintrag.compress_type = zipfile.ZIP_STORED
                    eintrag.file_size = groesse
                    eintrag.external_attr = 0o644 << 16

                    with z.open(eintrag, "w", force_zip64=groesse >= 2**32) as ziel, \
                         pfad.open("rb") as f:
                        shutil.copyfileobj(f, ziel, length=1 << 20)

                    geschrieben += 1
                    if temporaer:
                        pfad.unlink(missing_ok=True)
                except (BrokenPipeError, ConnectionResetError):
                    # Der Abnehmer ist weg – Fenster zu, Verbindung ab. Hier
                    # MUSS abgebrochen werden. Ein `except Exception`, das das
                    # mitschluckt, rechnet den Rest des Pakets fuer niemanden
                    # weiter: der Prozess laeuft bis zum letzten Bild durch,
                    # obwohl er nichts mehr ausliefern kann.
                    melde("Abnehmer weg, Paket abgebrochen")
                    raise
                except OSError as fehler:
                    if fehler.errno == errno.EPIPE:
                        melde("Abnehmer weg, Paket abgebrochen")
                        raise
                    melde(f"uebersprungen: {zeile['pfad']}: "
                          f"{type(fehler).__name__}: {fehler}")
                except Exception as fehler:  # noqa: BLE001
                    # Eine kaputte Datei darf das Paket nicht abbrechen – der
                    # Rest ist brauchbar, und der Fehler steht im Journal.
                    melde(f"uebersprungen: {zeile['pfad']}: "
                          f"{type(fehler).__name__}: {fehler}")
    return geschrieben


def paket(ids: list[int], art: str, ordner: str) -> int:
    zeilen = hole_zeilen(ids)
    if not zeilen:
        melde("Nichts auszuliefern.")
        return 1

    unterordner = sauber(ordner)
    vergeben: set[str] = set()

    # allowZip64: ueber 4 GB braucht es ZIP64, sonst ist das Ergebnis
    # stillschweigend beschaedigt. Die Voreinstellung ist True; hier steht sie
    # ausdruecklich da, damit sie niemand versehentlich abschaltet.
    try:
        geschrieben = _schreiben(zeilen, art, unterordner, vergeben)
    except (BrokenPipeError, ConnectionResetError):
        return 1

    try:
        sys.stdout.buffer.flush()
    except (BrokenPipeError, ConnectionResetError):
        return 1

    melde(f"{geschrieben} von {len(zeilen)} Datei(en) im Paket")
    return 0 if geschrieben else 1


def main() -> int:
    p = argparse.ArgumentParser(description="Dateien zum Herunterladen bereitstellen")
    unter = p.add_subparsers(dest="was", required=True)

    e = unter.add_parser("einzeln")
    e.add_argument("--id", type=int, required=True)
    e.add_argument("--art", choices=("jpeg", "original"), default="jpeg")

    k = unter.add_parser("paket")
    k.add_argument("--art", choices=("jpeg", "original"), default="jpeg")
    k.add_argument("--ordner", default="Auswahl")

    n = unter.add_parser(
        "name",
        help="nur die Zieldateinamen ausgeben – zum Gegenpruefen der Fassung "
             "in web/src/lib/herunterladen.ts",
    )
    n.add_argument("--art", choices=("jpeg", "original"), default="jpeg")

    args = p.parse_args()

    if args.was == "einzeln":
        return einzeln(args.id, args.art)

    if args.was == "name":
        ids = [int(z) for z in sys.stdin.read().split() if z.strip().isdigit()]
        vergeben: set[str] = set()
        for zeile in hole_zeilen(ids):
            endung = zielendung(zeile, args.art)
            print(f"{zeile['id']}\t{eindeutig(dateiname(zeile['aufnahme'], endung), vergeben)}")
        return 0

    ids = [int(z) for z in sys.stdin.read().split() if z.strip().isdigit()]
    return paket(ids, args.art, args.ordner)


if __name__ == "__main__":
    sys.exit(main())
