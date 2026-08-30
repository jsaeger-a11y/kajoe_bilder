"""Ableitungen erzeugen: Vorschau, Ansicht, Download-JPEG, Videofassungen.

Das Original wird dabei **nie** angefasst – nicht gedreht, nicht umbenannt,
nicht neu komprimiert. Alles hier schreibt ausschliesslich nach
`abgeleitet/` beziehungsweise in eine uebergebene Zieldatei.

Warum pillow-heif und nicht libvips: siehe ingest/LIESMICH.md, Abschnitt
"Werkzeugwahl". Kurz – das libvips-Rad bringt keinen HEVC-Dekoder mit und
scheitert an 39 von 50 Probedateien; 54 % des Bestands sind HEIC.
"""

from __future__ import annotations

import io
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

import pillow_heif
from PIL import Image, ImageCms, ImageOps

pillow_heif.register_heif_opener()

# Pillow bricht ab einer Grenze mit DecompressionBombWarning ab. Der Bestand
# ist eigenes Material, keine Fremdeingabe; 4032x3024 ist normal, Panoramen
# sind deutlich groesser.
Image.MAX_IMAGE_PIXELS = 400_000_000

VORSCHAU_KANTE = 300
ANSICHT_KANTE = 1600

Q_VORSCHAU = 80
Q_ANSICHT = 88
Q_DOWNLOAD = 95

# Pillow: 0 = 4:4:4, 2 = 4:2:0.
VOLL = 0
GEVIERTELT = 2

# Einzelbild bei 10 % der Laufzeit, nicht bei Sekunde null: der Anfang ist
# oft schwarz oder verwackelt.
VIDEO_ANTEIL = 0.10

VAAPI_GERAET = "/dev/dri/renderD128"

# Feste Quantisierung statt Bitrate. Gemessen an 60 s 1080p aus dem Bestand:
#
#   qp 22   94,8 MB     qp 26   57,6 MB
#   qp 24   72,0 MB     qp 28   43,9 MB
#   libx264 crf 23   46,5 MB   (aber gut zweieinhalbmal so lange)
#
# qp 24 waere mit 9,6 Mbit/s deutlich mehr, als die Fassung braucht, die nur
# im Browser laufen soll. 26 liegt dazwischen und laesst sich hier in einer
# Zeile aendern.
VAAPI_QP = 26
X264_CRF = 23

_SRGB = ImageCms.createProfile("sRGB")
_SRGB_BYTES = ImageCms.ImageCmsProfile(_SRGB).tobytes()
_umrechnungen: dict[bytes, ImageCms.ImageCmsTransform] = {}


class AbleitungsFehler(RuntimeError):
    pass


# ---------------------------------------------------------------------------
# Bilder
# ---------------------------------------------------------------------------

def _nach_srgb(im: Image.Image, profil: bytes | None) -> Image.Image:
    """Display P3 → sRGB, sauber gerechnet statt das Profil fallenzulassen.

    Das iPhone nimmt in Display P3 auf. Wer das Profil einfach wegwirft,
    bekommt flaue, verschobene Farben – rote Blumen und Sonnenuntergaenge
    sichtbar daneben. Ohne eingebettetes Profil wird sRGB angenommen, denn
    genau das tut jeder Betrachter auch.

    Die Umrechnung wird je Profil einmal gebaut und gemerkt: alle iPhone-
    Aufnahmen tragen dasselbe P3-Profil, und das Bauen kostet mehr als das
    Anwenden.
    """
    if not profil or profil == _SRGB_BYTES:
        return im
    umrechnung = _umrechnungen.get(profil)
    if umrechnung is None:
        try:
            quelle = ImageCms.ImageCmsProfile(io.BytesIO(profil))
            umrechnung = ImageCms.buildTransform(
                quelle, _SRGB, "RGB", "RGB",
                renderingIntent=ImageCms.Intent.PERCEPTUAL,
            )
        except ImageCms.PyCMSError:
            return im
        _umrechnungen[profil] = umrechnung
    return ImageCms.applyTransform(im, umrechnung)


def _laden(pfad: Path) -> tuple[Image.Image, bytes | None]:
    """Oeffnen, aufrichten, nach RGB.

    `exif_transpose` ist der entscheidende Schritt und verhaelt sich je nach
    Format anders:

    * **HEIC** – pillow-heif wendet die Drehung schon beim Laden an und setzt
      das EXIF-Feld auf 1. `exif_transpose` tut dann nichts mehr, und genau
      das ist richtig.
    * **JPEG** – Pillow dreht NICHT, das Feld bleibt auf 6 stehen.
      `exif_transpose` dreht hier tatsaechlich.

    In beiden Faellen traegt das Ergebnis kein Orientation-Feld mehr. Wer das
    Bild dreht und den Wert stehenlaesst, bekommt im Betrachter eine zweite
    Drehung – der haeufigste Fehler an dieser Stelle, und er faellt nur bei
    Hochformaten auf. Gespeichert wird ohnehin ohne EXIF.
    """
    with Image.open(pfad) as roh:
        profil = roh.info.get("icc_profile")
        im = ImageOps.exif_transpose(roh)
        if im.mode != "RGB":
            # Graustufen, Palette, RGBA – alles nach RGB. Transparenz wird
            # dabei auf Schwarz gelegt; JPEG kennt keinen Alphakanal.
            im = im.convert("RGB")
        im.load()
    return im, profil


def _sichern(im: Image.Image, ziel: Path, guete: int, unterabtastung: int,
             *, mit_profil: bool) -> None:
    ziel.parent.mkdir(parents=True, exist_ok=True)
    vorlaeufig = ziel.with_name(ziel.name + ".unfertig")
    # Pillow schreibt ohne `exif=`-Angabe keine Metadaten. Kein EXIF, kein
    # GPS, kein Geraetename – die Ableitungen gehen massenhaft durchs Netz,
    # und die Koordinate der eigenen Wohnung hat dort nichts verloren.
    im.save(vorlaeufig, "JPEG", quality=guete, subsampling=unterabtastung,
            optimize=True, icc_profile=_SRGB_BYTES if mit_profil else None)
    vorlaeufig.replace(ziel)


def _verkleinern(im: Image.Image, kante: int) -> Image.Image:
    """Laengste Kante auf `kante`, Seitenverhaeltnis erhalten, nie vergroessern."""
    if max(im.size) <= kante:
        return im.copy()
    kopie = im.copy()
    kopie.thumbnail((kante, kante), Image.LANCZOS)
    return kopie


def bild_ableitungen(quelle: Path, vorschau: Path, ansicht: Path) -> tuple[int, int]:
    """Vorschau (~300 px) und Ansicht (~1600 px) erzeugen.

    Umgerechnet wird EINMAL, auf der Ansicht: die Vorschau entsteht daraus
    durch weiteres Verkleinern. Das spart die zweite Farbumrechnung ueber ein
    12-Megapixel-Bild, und bei 300 px sieht den Unterschied niemand.
    """
    im, profil = _laden(quelle)
    try:
        gross = _verkleinern(im, ANSICHT_KANTE)
    finally:
        im.close()
    gross = _nach_srgb(gross, profil)

    # Ansicht: 4:4:4, sonst franst Rot an Kanten aus. sRGB-Profil bleibt
    # eingebettet, damit farbverwaltete Bildschirme richtig anzeigen.
    _sichern(gross, ansicht, Q_ANSICHT, VOLL, mit_profil=True)

    klein = _verkleinern(gross, VORSCHAU_KANTE)
    # Vorschau: 4:2:0 reicht – bei 300 px sieht es niemand – und nichts
    # weiter drin.
    _sichern(klein, vorschau, Q_VORSCHAU, GEVIERTELT, mit_profil=False)

    masse = (gross.size, klein.size)
    gross.close()
    klein.close()
    return masse


def download_jpeg(quelle: Path, ziel: Path) -> Path:
    """Vollaufloesendes JPEG fuer den Download.

    Qualitaet 95, 4:4:4, sRGB, **nicht verkleinert** – 4032 x 3024 sind bei
    300 dpi rund 34 x 25 cm, fuer ein Kalenderblatt reichlich. Ueber 95
    waechst die Datei stark, ohne dass etwas sichtbar besser wird.

    **Mit vollstaendigem EXIF**: Aufnahmezeit und GPS gehoeren in die Datei,
    die jemand herunterlaedt, nicht nur in die Datenbank. Uebernommen wird per
    exiftool aus dem Original – ohne dessen ICC-Profil, denn die Pixel sind
    jetzt sRGB, und mit `Orientation = 1`, weil das Bild bereits aufgerichtet
    ist.

    Wird in Phase 1b nur gebaut und geprueft, nicht im Stapel ausgefuehrt –
    aufgerufen wird sie spaeter aus der Weboberflaeche.
    """
    im, profil = _laden(quelle)
    try:
        im = _nach_srgb(im, profil)
        _sichern(im, ziel, Q_DOWNLOAD, VOLL, mit_profil=True)
    finally:
        im.close()

    lauf = subprocess.run(
        ["exiftool", "-q", "-overwrite_original",
         "-tagsFromFile", str(quelle),
         "-EXIF:all", "-XMP:all", "-IPTC:all",
         # Das Gatter ist Pflicht. Ohne es liest exiftool die 1 als
         # Klartextwert, sucht sie unter den Beschreibungen ("Horizontal
         # (normal)", "Rotate 90 CW", "Rotate 180", …), findet sie in
         # "Rotate 180" wieder und schreibt am Ende eine 3. Das Bild kaeme
         # dann im Betrachter auf dem Kopf an.
         "-Orientation#=1",
         str(ziel)],
        capture_output=True, text=True,
    )
    if lauf.returncode != 0:
        raise AbleitungsFehler(f"exiftool: {lauf.stderr.strip()}")
    return ziel


# ---------------------------------------------------------------------------
# Videos
# ---------------------------------------------------------------------------

def _ffmpeg(argumente: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                           *argumente], capture_output=True, text=True)


def video_einzelbild(quelle: Path, ziel: Path, dauer: float | None,
                     *, hdr: bool = False) -> float:
    """Einzelbild bei etwa 10 % der Laufzeit nach `ziel` (PNG).

    Nicht bei Sekunde null: der Anfang ist oft schwarz oder verwackelt.
    Gibt den gewaehlten Zeitpunkt zurueck.
    """
    zeitpunkt = max(0.0, (dauer or 0.0) * VIDEO_ANTEIL)
    filter_ = []
    if hdr:
        # Ohne Farbraumumsetzung sieht ein Dolby-Vision-Einzelbild
        # ausgewaschen und grau aus – ein Effekt, den man leicht fuer einen
        # Kodierfehler haelt.
        filter_ = ["-vf", TONEMAP_WEICH]

    ziel.parent.mkdir(parents=True, exist_ok=True)
    lauf = _ffmpeg(["-ss", f"{zeitpunkt:.3f}", "-i", str(quelle),
                    *filter_, "-frames:v", "1", str(ziel)])
    if lauf.returncode != 0 or not ziel.exists():
        # Kurze Videos oder kaputte Sprungmarken: noch einmal von vorn.
        lauf = _ffmpeg(["-i", str(quelle), *filter_, "-frames:v", "1", str(ziel)])
        zeitpunkt = 0.0
    if lauf.returncode != 0 or not ziel.exists():
        raise AbleitungsFehler(f"ffmpeg: {lauf.stderr.strip().splitlines()[-1:]}")
    return zeitpunkt


# HDR nach SDR in Software. zscale rechnet nach linear, tonemap bildet ab,
# zscale rechnet zurueck nach BT.709.
TONEMAP_WEICH = (
    "zscale=transfer=linear:npl=100,"
    "tonemap=tonemap=hable:desat=0,"
    "zscale=primaries=bt709:transfer=bt709:matrix=bt709:range=tv,"
    "format=yuv420p"
)


@dataclass
class Umwandlung:
    ziel: Path
    sekunden: float
    weg: str            # 'vaapi' | 'software'
    groesse: int


def vaapi_verfuegbar() -> tuple[bool, str]:
    """(nutzbar, Begruendung).

    Haeufigster Grund fuer ein Nein ist nicht fehlende Hardware, sondern eine
    Sitzung, die aelter ist als die Gruppenmitgliedschaft: /dev/dri/renderD128
    gehoert der Gruppe `render`, und die Rechte einer Anmeldung aendern sich
    nicht rueckwirkend.
    """
    geraet = Path(VAAPI_GERAET)
    if not geraet.exists():
        return False, f"{VAAPI_GERAET} gibt es nicht"
    try:
        with geraet.open("rb"):
            pass
    except PermissionError:
        return False, (f"kein Zugriff auf {VAAPI_GERAET} – in der Gruppe 'render' "
                       f"sein und sich neu anmelden (oder: sg render -c '…')")
    return True, "ok"


def wiedergabe(quelle: Path, ziel: Path, *, hdr: bool = False,
               vaapi: bool = True, hoehe: int = 1080) -> Umwandlung:
    """H.264-Fassung in 1080p, browsertauglich.

    HEVC spielt kein Chrome und kein Firefox; Umpacken in einen MP4-Container
    hilft nicht, der Codec ist das Problem, nicht der Container.

    `-movflags +faststart` ist Pflicht: ohne den Schalter liegen die
    Sprungmarken am Dateiende und der Browser laedt erst alles herunter, bevor
    das erste Bild erscheint. Hinter dem Tunnel ist das der Unterschied
    zwischen "laeuft" und "laeuft nicht".

    Wird in Phase 1b nur gebaut und geprueft, nicht im Stapel ausgefuehrt: die
    Fassung entsteht erst beim ersten Abspielen. H.264 ist bei gleicher
    Qualitaet rund doppelt so gross wie HEVC, und die meisten Videos sieht
    ohnehin nie jemand an.
    """
    import time

    ziel.parent.mkdir(parents=True, exist_ok=True)
    nutzbar, grund = vaapi_verfuegbar() if vaapi else (False, "abgeschaltet")

    if nutzbar:
        if hdr:
            # Tone Mapping auf der Grafikeinheit, damit die Bilder gar nicht
            # erst in den Hauptspeicher muessen.
            filter_ = (f"tonemap_vaapi=format=nv12:matrix=bt709:"
                       f"primaries=bt709:transfer=bt709,"
                       f"scale_vaapi=w=-2:h={hoehe}")
        else:
            filter_ = f"scale_vaapi=w=-2:h={hoehe}:format=nv12"
        argumente = [
            "-hwaccel", "vaapi", "-hwaccel_device", VAAPI_GERAET,
            "-hwaccel_output_format", "vaapi",
            "-i", str(quelle),
            "-vf", filter_,
            "-c:v", "h264_vaapi", "-qp", str(VAAPI_QP),
            "-c:a", "aac", "-b:a", "128k",
            "-movflags", "+faststart", str(ziel),
        ]
        weg = "vaapi"
    else:
        filter_ = TONEMAP_WEICH if hdr else "format=yuv420p"
        argumente = [
            "-i", str(quelle),
            "-vf", f"scale=-2:{hoehe},{filter_}",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", str(X264_CRF),
            "-c:a", "aac", "-b:a", "128k",
            "-movflags", "+faststart", str(ziel),
        ]
        weg = f"software ({grund})" if vaapi else "software"

    beginn = time.monotonic()
    lauf = _ffmpeg(argumente)
    dauer = time.monotonic() - beginn

    if lauf.returncode != 0 and weg == "vaapi":
        # Haeufigster Grund bei HDR: `tonemap_vaapi` verlangt die
        # Mastering-Display-Angaben nach ST 2086 ("No mastering display data
        # from input") und bricht ohne sie ab. HDR10 traegt sie, HLG nicht –
        # und Apple nimmt HLG auf. Dann eben in Software: eine langsamere
        # Fassung ist besser als gar keine.
        return wiedergabe(quelle, ziel, hdr=hdr, vaapi=False, hoehe=hoehe)

    if lauf.returncode != 0:
        raise AbleitungsFehler(
            f"ffmpeg ({weg}): {lauf.stderr.strip().splitlines()[-1] if lauf.stderr.strip() else '?'}"
        )
    return Umwandlung(ziel, dauer, weg, ziel.stat().st_size)


def video_ableitungen(quelle: Path, vorschau: Path, ansicht: Path,
                      dauer: float | None, *, hdr: bool = False) -> tuple[int, int]:
    """Einzelbild greifen und danach wie ein Bild behandeln."""
    with tempfile.TemporaryDirectory() as tmp:
        einzelbild = Path(tmp) / "bild.png"
        video_einzelbild(quelle, einzelbild, dauer, hdr=hdr)
        return bild_ableitungen(einzelbild, vorschau, ansicht)


__all__ = [
    "ANSICHT_KANTE", "AbleitungsFehler", "Q_DOWNLOAD", "Umwandlung",
    "VORSCHAU_KANTE", "bild_ableitungen", "download_jpeg", "vaapi_verfuegbar",
    "video_ableitungen", "video_einzelbild", "wiedergabe",
]
