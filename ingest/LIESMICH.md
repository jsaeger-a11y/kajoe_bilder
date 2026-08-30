# ingest – Einlesen und Katalogisieren (Phase 1a)

Liest Dateien aus `/data/kajoe_bilder/eingang/`, legt sie unter
`original/<jahr>/<monat>/<sha256>.<endung>` ab und traegt sie in `bild` ein.
Ableitungen – Vorschau, Ansicht, Wiedergabefassung – sind **nicht** Teil davon;
das ist Phase 1b.

## Aufrufen

```bash
tools/einlesen.sh                 # regulaerer Lauf
tools/einlesen.sh --trockenlauf   # nichts anfassen, nur berichten
tools/einlesen.sh --grenze 50     # nur die ersten 50 Dateien
tools/einlesen.sh --quelle 'OneDrive – Zweitkonto'
```

Mehrfach ausfuehrbar. Ein zweiter Lauf ueber denselben Bestand legt nichts
doppelt an – erkannt wird ausschliesslich ueber den SHA-256 des **Inhalts**,
nie ueber den Dateinamen.

Noch **kein** systemd-Timer. Der kommt, wenn der Lauf ueber mehrere Jahrgaenge
erprobt ist.

## Aufbau

| Datei | Inhalt |
|---|---|
| `lauf.py` | Durchlauf, Reihenfolge, Buchfuehrung, Bericht |
| `metadaten.py` | exiftool im Stapelbetrieb |
| `einordnen.py` | Dateityp, Herkunft, Zeit, Ort – die Fachlogik, ohne Dateien und ohne Datenbank pruefbar |
| `datenbank.py` | Verbindung aus `.env`, Gegenprobe ueber eine zweite Verbindung |

## Die Reihenfolge beim Ablegen

1. **Hardlink** von `eingang/…` nach `original/<jahr>/<monat>/<sha256>.<endung>`
2. Datenbankzeile schreiben und **committen**
3. Erst danach die Datei aus `eingang/` loesen

Naheliegend waere, zuerst zu verschieben. Bricht der Lauf dann zwischen
Verschieben und Zeile ab, liegt die Datei am Ziel und ist in keiner Tabelle
verzeichnet – der naechste Lauf findet sie in `eingang/` nicht mehr und merkt
nichts davon. In dieser Reihenfolge bleibt sie liegen und der naechste Lauf
macht weiter. Beide Orte liegen auf demselben Dateisystem, der Hardlink kostet
also weder Platz noch Zeit.

## Umgebung einrichten

`python3-venv` ist auf `webspace` **nicht** installiert und `sudo` verlangt ein
Passwort, deshalb entsteht die Umgebung ohne `ensurepip`:

```bash
python3 -m venv --without-pip ingest/.venv

# pip einmalig aus dem Rad bootstrappen (ein Rad, kein Skript aus dem Netz)
curl -sSLO https://files.pythonhosted.org/packages/f3/6e/1736e5b4ae2b778ef2f81c47d797de9f891d4d8acb047a24ca37a60294dd/pip-26.2.1-py3-none-any.whl
ingest/.venv/bin/python pip-26.2.1-py3-none-any.whl/pip install --no-index pip-26.2.1-py3-none-any.whl

ingest/.venv/bin/python -m pip install -r ingest/anforderungen.txt
```

Sobald `sudo apt install python3.14-venv` moeglich ist, reicht wieder das
uebliche `python3 -m venv ingest/.venv`.

Ausserhalb der Umgebung gebraucht: **exiftool** (13.50) aus den Paketquellen.

## Was beim Auswerten leicht schiefgeht

**Der Zeitstempel im OneDrive-Dateinamen ist UTC, nicht Ortszeit.**
Nachgemessen am Bestand 2026: bei allen 587 Bildern, die sowohl
`DateTimeOriginal` als auch `OffsetTimeOriginal` tragen, gilt ausnahmslos
`DateTimeOriginal = Dateiname + Zeitversatz`. Wer die Ziffern als Ortszeit
nimmt, legt ein Bild von Silvester 00:30 Berliner Zeit als 31.12. 23:30 ab –
genau der Fehler, den `CLAUDE.md` ausschliesst. Android-Namen (`IMG_`, `PXL_`)
tragen dagegen Ortszeit; welches Muster wie gemeint ist, steht in
`einordnen.MUSTER`.

**`exiftool -G0` ist Pflicht.** Ohne Gruppenpraefix liefert exiftool fuer
`GPSLatitude` den *Composite*-Wert, der bereits vorzeichenbehaftet ist. Mit
`-G0` stehen `EXIF:GPSLatitude` (Betrag) und `Composite:GPSLatitude`
(vorzeichenbehaftet) nebeneinander. Ausgewertet wird der EXIF-Wert plus
`GPSLatitudeRef`; `S` und `W` sind negativ.

**Dieselbe Angabe steht je nach Format in einer anderen Gruppe.** Bildmasse
liegen bei HEIC und JPEG unter `File:`, bei Videos unter `QuickTime:`, bei PNG
unter `PNG:`. Eine feste Gruppenliste laesst genau ein Format still leer –
beim ersten Anlauf waren das die 70 PNG mit `breite IS NULL`. Dafuer gibt es
`metadaten.wert_beliebig()`.

**exiftool je Datei einzeln aufzurufen ist zu langsam.** Der Programmstart
kostet mehr als das Auslesen. Hier laufen 200 Dateien je Aufruf, die Liste
geht ueber die Standardeingabe.

## Zeitquellen

Rangfolge `exif` → `dateiname` → `ordner` → `dateizeit`; welche gegriffen hat,
steht in `bild.zeitquelle`.

`aufnahme_lokal` ist immer belegt und immer massgeblich. `aufnahme_utc` wird
nur gesetzt, wo die UTC-Zeit wirklich bekannt ist. `zeitversatz` **nur**, wo
ihn das Geraet selbst geschrieben hat. Steht also `zeitquelle = 'dateiname'`
und `zeitversatz IS NULL`, heisst das: die UTC-Zeit ist sicher, die Ortszeit
beruht auf der Annahme `Europe/Berlin` (`einordnen.ZONE`).

---

# Ableitungen (Phase 1b)

Zu jeder Zeile in `bild` entstehen zwei Dateien:

```
abgeleitet/<jahr>/<monat>/<sha256>-vorschau.jpg    laengste Kante 300 px, Q 80, 4:2:0
abgeleitet/<jahr>/<monat>/<sha256>-ansicht.jpg     laengste Kante 1600 px, Q 88, 4:4:4
```

```bash
tools/ableiten.sh                 # alles Offene
tools/ableiten.sh --grenze 20     # nur die naechsten 20 offenen Zeilen
tools/ableiten.sh --erneut        # auch schon Erzeugtes noch einmal
tools/ableiten.sh --pruefen       # Flag ignorieren, wenn die Dateien fehlen
```

Wiederaufsetzbar ueber `bild.vorschau_erzeugt`, nicht ueber eine eigene
Fortschrittstabelle. Erst werden die Dateien geschrieben, dann das Flag
gesetzt – andersherum stuende ein Bild als fertig in der Datenbank, dessen
Vorschau nie geschrieben wurde, und kein spaeterer Lauf wuerde es noch einmal
versuchen.

## Werkzeugwahl: gemessen, nicht geschaetzt

An 50 gleichmaessig ueber den Bestand verteilten Dateien
(`ingest/.venv/bin/python ingest/messen.py`), je Vorschau und Ansicht:

| Werkzeug | gesamt | je Bild | Spitzenspeicher |
|---|---|---|---|
| **pillow-heif 1.5.0** | 23,5 s | **471 ms** | 533 MB |
| pyvips 3.2 / libvips 8.18.6 | – | – | – |

**libvips faellt aus, und zwar nicht wegen der Geschwindigkeit.** Das Rad
`pyvips-binary` bringt libvips statisch gebunden mit, aber **ohne
HEVC-Dekoder**: 39 von 50 Probedateien scheitern mit
`heif: Decoder plugin generated an error`, naemlich genau alle HEIC und HEIF.
JPEG und PNG gehen. 54 % des Bestands sind HEIC – damit ist libvips hier
unbrauchbar.

Es liegt nicht am Rad allein: auch das System-libheif (1.21.2) hat nur die
AV1-Plugins `libheif-plugin-aomdec/aomenc`, kein
`libheif-plugin-libde265`. Ein von Hand entpacktes Plugin samt
`LIBHEIF_PLUGIN_PATH` half nicht, weil das Rad sein eigenes libheif
mitbringt und das System-libheif gar nicht laedt.

Der Weg zu libvips waere `sudo apt install libvips42 libheif-plugin-libde265`
und dann `pyvips` **ohne** `[binary]`. Das braucht Root; solange das nicht
geht, bleibt es bei pillow-heif. ImageMagick wurde nicht gemessen: weder
`magick` noch `libmagickwand` sind installiert, und beides kaeme aus derselben
Paketverwaltung.

**Der Spitzenspeicher von 533 MB** kommt vom Dekodieren: ein 4032 x 3024
grosses Bild belegt als RGB rund 36 MB, dazu die Zwischenstufen der
Farbumrechnung. Bei einem Prozess ist das unkritisch; wer spaeter parallel
ableitet, sollte die Zahl im Kopf behalten.

## Die vier Fallstricke

**Farbprofil.** Das iPhone nimmt in Display P3 auf. Umgerechnet wird mit
`ImageCms` nach sRGB, nicht durch Fallenlassen des Profils. Die Umrechnung
wird je Profil einmal gebaut und gemerkt – alle iPhone-Aufnahmen tragen
dasselbe P3-Profil, und das Bauen kostet mehr als das Anwenden.

Gerechnet wird **einmal**, auf der 1600-px-Fassung; die Vorschau entsteht
daraus durch weiteres Verkleinern. Das spart die zweite Farbumrechnung ueber
ein 12-Megapixel-Bild und halbiert die Laufzeit (838 ms je Bild in der ersten
Fassung, 471 ms jetzt).

**Ausrichtung.** `ImageOps.exif_transpose` – und das Ergebnis traegt danach
kein Orientation-Feld mehr, weil ohne EXIF gespeichert wird. Wer dreht und den
Wert stehenlaesst, bekommt im Betrachter eine zweite Drehung.

Das Verhalten unterscheidet sich je Format, und das ist die eigentliche Falle:

| | pillow-heif laedt | EXIF-Feld danach | `exif_transpose` |
|---|---|---|---|
| HEIC, Orientation 6 | schon gedreht (3024 x 4032) | 1 | tut nichts |
| JPEG, Orientation 6 | ungedreht (3840 x 2160) | 6 | dreht |

Beide Wege enden richtig, aber nur, weil `exif_transpose` das Feld liest und
nicht blind dreht.

**Farbunterabtastung.** Ansicht und Download 4:4:4 (`subsampling=0`), sonst
franst Rot an Kanten aus. Vorschau 4:2:0 – bei 300 px sieht das niemand, und
es spart Platz.

**Qualitaet.** Vorschau 80, Ansicht 88, Download 95. Ueber 95 waechst die
Datei stark, ohne dass etwas sichtbar besser wird.

## Metadaten in den Ableitungen

Pillow schreibt ohne `exif=`-Angabe keine Metadaten – kein EXIF, kein GPS,
kein Geraetename. Das gilt hier fuer **Vorschau und Ansicht**, nicht nur fuer
die Vorschau: beide gehen massenhaft durchs Netz, und hinter einem oeffentlich
erreichbaren Tunnel steht mit der Koordinate die Wohnadresse in den Daten.

Die Ansicht traegt als einzige Zutat ein eingebettetes sRGB-Profil, damit
farbverwaltete Bildschirme richtig anzeigen. Die Vorschau traegt gar nichts.

Das **Download-JPEG** ist die Ausnahme und bekommt das vollstaendige EXIF –
Aufnahmezeit und GPS gehoeren in die Datei, die jemand herunterlaedt.
Uebernommen wird es mit `exiftool -tagsFromFile`, ausdruecklich **ohne** das
ICC-Profil des Originals (die Pixel sind jetzt sRGB) und mit
`-Orientation=1` (das Bild ist bereits aufgerichtet).

## Videos

Vorschaubild bei **10 % der Laufzeit**, nicht bei Sekunde null: der Anfang ist
oft schwarz oder verwackelt. Danach wird das Einzelbild wie ein Bild
behandelt.

Die **Wiedergabefassung entsteht nicht im Stapel**, sondern erst beim ersten
Abspielen (`ableitung.wiedergabe`). H.264 ist bei gleicher Qualitaet rund
doppelt so gross wie HEVC, und die meisten Videos sieht ohnehin nie jemand an.

`-movflags +faststart` ist Pflicht: ohne den Schalter liegen die Sprungmarken
am Dateiende und der Browser laedt erst alles herunter, bevor das erste Bild
erscheint.

### Gemessen: VAAPI gegen Prozessor

An derselben Datei – 361 s HEVC 1080p, 333 MB, aus dem Bestand:

| Weg | Dauer | je Minute Video | Verhaeltnis zur Echtzeit | Ergebnis |
|---|---|---|---|---|
| **VAAPI** (`h264_vaapi`, qp 26) | 35 s | **5,9 s** | 10,2-fach | 444 MB bei qp 24 |
| Software (`libx264 -preset veryfast -crf 23`) | 98 s | 16,3 s | 3,7-fach | 280 MB |

**Damit traegt die Erzeugung bei Bedarf.** Der ganze Videobestand 2026 sind
93 Minuten; ueber VAAPI waeren das rund neun Minuten am Stueck, ein einzelnes
Video von drei Minuten ist in achtzehn Sekunden fertig. Wer beim ersten
Abspielen kurz wartet, wartet nicht lange, und in aller Regel wartet niemand,
weil die meisten Videos nie jemand ansieht.

Die Groesse haengt an `qp`, gemessen an 60 s 1080p:

| qp 22 | qp 24 | qp 26 | qp 28 | libx264 crf 23 |
|---|---|---|---|---|
| 94,8 MB | 72,0 MB | **57,6 MB** | 43,9 MB | 46,5 MB |

Voreingestellt ist `VAAPI_QP = 26`. qp 24 waeren 9,6 Mbit/s – deutlich mehr,
als eine Fassung braucht, die nur im Browser laufen soll.

### HDR: `tonemap_vaapi` braucht Angaben, die Apple nicht mitliefert

Im Bestand 2026 gibt es **keine einzige HDR-Aufnahme** – alle 167 Videos
tragen `TransferCharacteristics = 1` (BT.709) oder gar keine Angabe. Geprueft
wurde deshalb an einem selbst gebauten Prueffall: ein Foto aus dem Bestand,
ueber `zscale` nach BT.2020/PQ gerechnet und als HEVC 10 Bit kodiert.

Ergebnis, gemessen als mittlere Saettigung (Ausgangsfoto: 212):

| | Saettigung |
|---|---|
| Einzelbild **ohne** Tone Mapping | 122 – matt, das Rot wird braun |
| Einzelbild **mit** Tone Mapping | 211 |
| Wiedergabefassung ueber `tonemap_vaapi` | 227 |

Der Unterschied ist auch mit blossem Auge eindeutig; die Bilder liegen in
`/data/kajoe_bilder/probe/`.

**`tonemap_vaapi` verlangt die Mastering-Display-Angaben nach ST 2086** und
bricht ohne sie mit "No mastering display data from input" ab. HDR10 traegt
sie, **HLG nicht – und Apple nimmt HLG auf**. `wiedergabe()` faellt deshalb
bei einem gescheiterten VAAPI-Lauf auf die Software-Kette zurueck: eine
langsamere Fassung ist besser als gar keine.

**`zscale` braucht getaggte Eingaben.** Auf einer Quelle ohne Farbraumangaben
scheitert schon `zscale=transfer=linear` mit "no path between colorspaces".
In der Tonemap-Kette ist das unkritisch, weil sie nur bei `hdr = TRUE` laeuft
und HDR ohne Tags nicht erkannt wuerde.

**VAAPI und die Gruppe `render`.** `/dev/dri/renderD128` gehoert der Gruppe
`render`. `jsaeger` ist Mitglied, aber die Rechte einer bereits laufenden
Anmeldung aendern sich davon nicht rueckwirkend – in einer alten Sitzung
scheitert ffmpeg mit "No VA display found". Entweder neu anmelden oder
`sg render -c '…'`. `ableitung.vaapi_verfuegbar()` prueft das und sagt es im
Klartext, statt still auf den Prozessor auszuweichen.

---

# Aufräumen und der Grabstein (Phase 3a)

`ingest/aufraeumen.py` entfernt die Dateien zu Zeilen, deren `geloescht_am`
länger als dreißig Tage zurückliegt: Original, Vorschau, Ansicht und, falls
vorhanden, die Wiedergabefassung. Aufgerufen wird es aus
`tools/aufraeumen.sh` zusammen mit den Sitzungen und Anmeldeversuchen.

**Die Zeile in `bild` bleibt stehen – für immer.** Was verschwindet, sind die
Dateien; die Zeile behält ihren `sha256` und ihr `geloescht_am`. Danach stehen
`vorschau_erzeugt` und `wiedergabe_erzeugt` auf `FALSE`, damit die Oberfläche
keine Ableitung anbietet, die es nicht gibt, und ein zweiter Lauf nichts mehr
findet.

**Ohne diesen Grabstein wäre das Aussortieren umsonst.** `lauf.py` erkennt eine
Datei ausschließlich über den `sha256` des Inhalts. Findet er eine Zeile mit
gesetztem `geloescht_am`, wird die Datei **übersprungen und nicht neu
verknüpft** – sonst wäre alles, was jemand weggeräumt hat, beim nächsten
Kopieren aus OneDrive zurück, und niemand wüsste, warum.

Gezählt wird das getrennt (`davon schon geloescht`) und in `ingest_lauf.bemerkung`
vermerkt: sonst steckten diese Wiedergänger unsichtbar in der Zahl der
Dubletten, und gerade sie will man wiederfinden – sie sind der Beleg, dass das
Aussortieren gehalten hat.

Nachgeprüft an einer echten Datei: `geloescht_am` auf vor 31 Tagen gestellt,
Aufräumlauf → drei Dateien weg, Zeile steht, `sha256` unverändert. Dieselbe
Datei erneut nach `eingang/` gelegt und den Ingest laufen lassen →
`uebernommen 0, Dubletten 1, davon schon geloescht 1`, kein Original neu
angelegt, 922 Zeilen unverändert.
