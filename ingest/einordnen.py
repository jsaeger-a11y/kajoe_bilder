"""Aus Metadaten werden Spaltenwerte: Dateityp, Herkunft, Zeit, Ort.

Hier steckt die Fachlogik des Ingest. Sie steht bewusst getrennt vom Durchlauf
in lauf.py, damit sie ohne Dateien und ohne Datenbank geprueft werden kann.
"""

from __future__ import annotations

import re
import sys
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

from metadaten import wert, wert_beliebig

# Die Einteilung der Herkunft ist bereits in tools/bestand.py belegt und hat
# die Bestandsmessung getragen. Sie wird hier eingebunden statt nachgebaut:
# zwei Fassungen derselben Regel laufen frueher oder spaeter auseinander, und
# dann stimmt die Messung nicht mehr mit dem Bestand ueberein.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tools"))
from bestand import herkunft as _herkunft_aus_messung  # noqa: E402

# Angenommene Zeitzone fuer Quellen, die UTC liefern (siehe zeit()). Alle
# Aufnahmen der Messung 2026 stammen aus dieser Zone.
ZONE = ZoneInfo("Europe/Berlin")

BILDTYPEN = {"HEIC", "HEIF", "JPEG", "PNG", "TIFF", "DNG", "GIF", "WEBP", "BMP"}
VIDEOTYPEN = {"MOV", "MP4", "M4V", "AVI", "3GP", "MPEG", "MKV", "WEBM"}

# Wildkameras gehoeren zum Jagdprojekt auf hunter und werden hier nicht
# eingelesen – siehe CLAUDE.md, "Herkunft statt Objekterkennung".
WILDKAMERA = ("zeiss", "ventrade")

CODECS = {
    "hvc1": "hevc", "hev1": "hevc", "hvcC": "hevc",
    "avc1": "h264", "avc3": "h264",
    "mp4v": "mpeg4", "jpeg": "mjpeg",
}

# BT.2100 PQ (16) und HLG (18). Alles andere ist SDR.
HDR_TRANSFER = {16, 18}

FRUEHESTENS = datetime(1990, 1, 1)


# ---------------------------------------------------------------------------
# Dateityp – aus dem Inhalt, nicht aus der Endung
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class Typ:
    dateityp: str          # 'HEIC', 'JPEG', 'MOV' …
    endung: str            # Zielendung, klein: 'heic', 'jpg', 'mov'
    art: str               # 'bild' | 'video'


def typ(md: dict) -> Typ | None:
    """None heisst: unbekannt oder nicht unterstuetzt → Quarantaene.

    Der Dateityp kommt von exiftool und damit aus dem Inhalt. Eine .jpg mit
    HEIC-Inhalt kommt vor; im Bestand 2026 sind es fuenfzehn Dateien mit
    Endung .heic und Inhalt HEIF.
    """
    dateityp = (wert(md, "File:FileType") or "").strip().upper()
    if not dateityp:
        return None

    endung = (wert(md, "File:FileTypeExtension") or dateityp).strip().lower()

    if dateityp in BILDTYPEN:
        return Typ(dateityp, endung, "bild")
    if dateityp in VIDEOTYPEN:
        return Typ(dateityp, endung, "video")
    return None


# ---------------------------------------------------------------------------
# Herkunft
# ---------------------------------------------------------------------------

def geraet(md: dict) -> tuple[str, str]:
    """Make und Model, gleich aus welcher Gruppe sie kommen."""
    make = wert(md, "EXIF:Make", "QuickTime:Make", "XMP:Make") or ""
    model = wert(md, "EXIF:Model", "QuickTime:Model", "XMP:Model") or ""
    return str(make).strip(), str(model).strip()


def ist_wildkamera(make: str) -> bool:
    return make.strip().lower().startswith(WILDKAMERA)


def herkunft(make: str, model: str) -> str:
    return _herkunft_aus_messung(make, model)


# ---------------------------------------------------------------------------
# Zeit
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class Zeitangabe:
    lokal: datetime           # ohne Zeitzone – das, was die Kamera zeigte
    utc: datetime | None      # nur wenn wirklich bekannt
    versatz: str | None       # nur wenn das GERAET ihn geschrieben hat
    quelle: str               # 'exif' | 'dateiname' | 'ordner' | 'dateizeit'


# Dateinamenmuster. Die dritte Angabe sagt, ob die Ziffern Ortszeit oder UTC
# sind – das ist der entscheidende Unterschied und kein Detail:
#
#   OneDrive benennt seine Kamerauploads nach UTC. Nachgemessen am Bestand
#   2026: bei allen 587 Bildern mit DateTimeOriginal UND OffsetTimeOriginal
#   gilt ausnahmslos  DateTimeOriginal = Dateiname + Zeitversatz. Wer die
#   Ziffern als Ortszeit nimmt, legt ein Bild von Silvester 00:30 Berliner
#   Zeit als 31.12. 23:30 ab – genau der Fehler, den CLAUDE.md ausschliesst.
#
#   Android (IMG_/VID_/PXL_) benennt dagegen nach Ortszeit.
MUSTER = (
    (re.compile(r"^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})\d*_iOS", re.I), "utc"),
    (re.compile(r"^(?:IMG|VID|PXL|PANO|SVID)[_-](\d{4})(\d{2})(\d{2})[_-](\d{2})(\d{2})(\d{2})", re.I), "lokal"),
    (re.compile(r"(\d{4})-(\d{2})-(\d{2})[ T_](\d{2})[.:-](\d{2})[.:-](\d{2})"), "lokal"),
)

ORDNERMUSTER = re.compile(r"(?:^|/)(19\d\d|20\d\d)[/_-]?(0[1-9]|1[0-2])(?:/|$)")


def _als_datum(*teile: str) -> datetime | None:
    try:
        d = datetime(*(int(t) for t in teile))
    except (TypeError, ValueError):
        return None
    return d if FRUEHESTENS <= d <= datetime.now() + timedelta(days=366) else None


def _zerlege(text: str | None) -> datetime | None:
    """'2026:02:15 11:41:32' → datetime. Auch '0000:00:00 00:00:00' faellt hier
    heraus, und das ist Absicht: 39 MP4 im Bestand 2026 tragen genau das."""
    if not text:
        return None
    m = re.match(r"^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})", str(text))
    return _als_datum(*m.groups()) if m else None


def _versatz_sekunden(text: str | None) -> int | None:
    if not text:
        return None
    m = re.match(r"^([+-])(\d{2}):?(\d{2})$", str(text).strip())
    if not m:
        return None
    vorzeichen = 1 if m.group(1) == "+" else -1
    return vorzeichen * (int(m.group(2)) * 3600 + int(m.group(3)) * 60)


def _aus_utc(u: datetime) -> tuple[datetime, datetime]:
    """UTC → (Ortszeit nach ZONE, UTC). Die Ortszeit ist eine Annahme."""
    mit_zone = u.replace(tzinfo=timezone.utc)
    return mit_zone.astimezone(ZONE).replace(tzinfo=None), u


def zeit(md: dict, pfad: Path, relpfad: str) -> Zeitangabe:
    """Rangfolge: EXIF → Dateinamenmuster → Ordnername → Dateizeit.

    `aufnahme_lokal` ist immer belegt und immer massgeblich. `utc` wird nur
    gesetzt, wo er wirklich bekannt ist; `versatz` nur, wo ihn das Geraet
    selbst geschrieben hat. Steht `quelle='dateiname'` und `versatz IS NULL`,
    dann heisst das: die UTC-Zeit ist sicher, die Ortszeit beruht auf der
    Annahme Europe/Berlin.
    """
    # --- 1. EXIF ----------------------------------------------------------
    lokal = _zerlege(wert(md, "EXIF:DateTimeOriginal"))
    if lokal:
        sek = _versatz_sekunden(wert(md, "EXIF:OffsetTimeOriginal"))
        if sek is None:
            return Zeitangabe(lokal, None, None, "exif")
        u = (lokal.replace(tzinfo=timezone.utc) - timedelta(seconds=sek))
        return Zeitangabe(lokal, u.replace(tzinfo=None),
                          _versatz_text(sek), "exif")

    # Videos: QuickTime:CreationDate traegt Ortszeit MIT Versatz und ist damit
    # die beste Quelle. QuickTime:CreateDate ist laut Format UTC – am Bestand
    # 2026 gegen die Dateinamen bestaetigt – und wird umgerechnet.
    roh = wert(md, "QuickTime:CreationDate")
    if roh:
        m = re.match(r"^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})\s*([+-]\d{2}:?\d{2})?", str(roh))
        if m:
            lokal = _als_datum(*m.groups()[:6])
            sek = _versatz_sekunden(m.group(7))
            if lokal and sek is not None:
                u = lokal.replace(tzinfo=timezone.utc) - timedelta(seconds=sek)
                return Zeitangabe(lokal, u.replace(tzinfo=None),
                                  _versatz_text(sek), "exif")
            if lokal:
                return Zeitangabe(lokal, None, None, "exif")

    u = _zerlege(wert(md, "QuickTime:CreateDate"))
    if u:
        lokal, u = _aus_utc(u)
        return Zeitangabe(lokal, u, None, "exif")

    # --- 2. Dateinamenmuster ---------------------------------------------
    name = pfad.name
    for muster, art in MUSTER:
        m = muster.search(name)
        if not m:
            continue
        d = _als_datum(*m.groups()[:6])
        if not d:
            continue
        if art == "utc":
            lokal, u = _aus_utc(d)
            return Zeitangabe(lokal, u, None, "dateiname")
        return Zeitangabe(d, None, None, "dateiname")

    # --- 3. Ordnername ----------------------------------------------------
    m = ORDNERMUSTER.search(relpfad.replace("\\", "/"))
    if m:
        d = _als_datum(m.group(1), m.group(2), "1", "0", "0", "0")
        if d:
            return Zeitangabe(d, None, None, "ordner")

    # --- 4. Dateizeit -----------------------------------------------------
    # Steht ganz unten: nach einem OneDrive-Abgleich ist das meist das
    # Kopierdatum und damit der schlechteste verfuegbare Wert.
    u = datetime.fromtimestamp(pfad.stat().st_mtime, tz=timezone.utc)
    lokal = u.astimezone(ZONE).replace(tzinfo=None)
    return Zeitangabe(lokal, u.replace(tzinfo=None), None, "dateizeit")


def _versatz_text(sekunden: int) -> str:
    vorzeichen = "+" if sekunden >= 0 else "-"
    sekunden = abs(sekunden)
    return f"{vorzeichen}{sekunden // 3600:02d}:{(sekunden % 3600) // 60:02d}"


# ---------------------------------------------------------------------------
# Ort
# ---------------------------------------------------------------------------

# Wie nah an 0/0 noch als Platzhalter gilt. 0,05 Grad sind rund 5 km – dort
# liegt nur Wasser im Golf von Guinea.
NULLINSEL = 0.05


def ort(md: dict) -> tuple[float | None, float | None, str]:
    """(lat, lon, gps_status).

    EXIF liefert den BETRAG plus Himmelsrichtung. `S` und `W` sind negativ –
    wer das vergisst, spiegelt seine Bilder auf die Nordhalbkugel. Deshalb
    wird hier ausdruecklich EXIF:GPSLatitude (immer positiv) mit
    EXIF:GPSLatitudeRef verrechnet und NICHT der fertige Composite-Wert
    genommen: welcher von beiden ohne Gruppenpraefix zurueckkommt, haengt
    davon ab, was sonst noch in der Datei steht.
    """
    lat = lon = None

    roh_lat = wert(md, "EXIF:GPSLatitude")
    roh_lon = wert(md, "EXIF:GPSLongitude")
    if roh_lat is not None and roh_lon is not None:
        try:
            lat, lon = abs(float(roh_lat)), abs(float(roh_lon))
        except (TypeError, ValueError):
            return None, None, "fehlt"
        if str(wert(md, "EXIF:GPSLatitudeRef") or "N").upper().startswith("S"):
            lat = -lat
        if str(wert(md, "EXIF:GPSLongitudeRef") or "E").upper().startswith("W"):
            lon = -lon

    if lat is None:
        # Videos: QuickTime:GPSCoordinates ist ISO 6709 und bereits
        # vorzeichenbehaftet – "53.7707 9.9838 32.541".
        roh = wert(md, "QuickTime:GPSCoordinates", "Keys:GPSCoordinates")
        if roh:
            teile = str(roh).replace(",", " ").split()
            if len(teile) >= 2:
                try:
                    lat, lon = float(teile[0]), float(teile[1])
                except ValueError:
                    return None, None, "fehlt"

    if lat is None or lon is None:
        return None, None, "fehlt"

    # Manche Geraete schreiben Platzhalter statt echter Werte. Ohne Pruefung
    # stuenden Familienbilder vor Westafrika auf der Karte.
    if not (-90.0 <= lat <= 90.0) or not (-180.0 <= lon <= 180.0):
        return lat, lon, "unplausibel"
    if abs(lat) < NULLINSEL and abs(lon) < NULLINSEL:
        return lat, lon, "unplausibel"
    return lat, lon, "ok"


# ---------------------------------------------------------------------------
# Video
# ---------------------------------------------------------------------------

def videoangaben(md: dict) -> tuple[float | None, str | None, bool]:
    """(dauer_sekunden, video_codec, hdr)."""
    roh = wert(md, "QuickTime:Duration", "Composite:Duration")
    try:
        dauer = round(float(roh), 3) if roh is not None else None
    except (TypeError, ValueError):
        dauer = None

    kennung = wert(md, "QuickTime:CompressorID")
    codec = CODECS.get(str(kennung).strip()) if kennung else None
    if codec is None and kennung:
        codec = str(kennung).strip().lower()

    # Nur die Containerangabe auswerten: HEIC-Bilder tragen ein
    # ICC_Profile:TransferCharacteristics, das nichts ueber HDR aussagt.
    uebertragung = wert(md, "QuickTime:TransferCharacteristics")
    try:
        hdr = int(uebertragung) in HDR_TRANSFER if uebertragung is not None else False
    except (TypeError, ValueError):
        hdr = False

    return dauer, codec, hdr


def masse(md: dict) -> tuple[int | None, int | None, int | None]:
    """(breite, hoehe, ausrichtung).

    ausrichtung ist die EXIF-Orientation. Bei Videos bleibt sie leer: dort
    steht die Drehung in Grad und gehoert nicht in dieselbe Spalte.
    """
    def zahl(x):
        try:
            return int(x)
        except (TypeError, ValueError):
            return None

    # Gleich aus welcher Gruppe: File bei HEIC/JPEG, QuickTime bei Videos,
    # PNG bei PNG. Eine feste Liste laesst sonst ein Format still leer.
    breite = zahl(wert_beliebig(md, "ImageWidth"))
    hoehe = zahl(wert_beliebig(md, "ImageHeight"))
    # EXIF hat Vorrang; 41 Dateien im Bestand 2026 tragen die Ausrichtung nur
    # im XMP-Block.
    ausrichtung = zahl(wert(md, "EXIF:Orientation") or wert_beliebig(md, "Orientation"))
    return breite, hoehe, ausrichtung


__all__ = [
    "BILDTYPEN", "VIDEOTYPEN", "ZONE", "Typ", "Zeitangabe",
    "geraet", "herkunft", "ist_wildkamera", "masse", "ort", "typ",
    "videoangaben", "zeit",
]
