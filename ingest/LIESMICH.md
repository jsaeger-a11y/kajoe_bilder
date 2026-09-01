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

---

# Herunterladen (Phase 3b)

`ingest/herunterladen.py` liefert Dateien auf die Standardausgabe – einzeln
oder als ZIP-Paket. Alles Erklärende geht nach stderr, damit der Strom sauber
bleibt.

```bash
tools/herunterladen.sh einzeln --id 42 --art jpeg > bild.jpg
echo "1 2 3" | tools/herunterladen.sh paket --art jpeg --ordner "Kalender" > paket.zip
echo "1 2 3" | tools/herunterladen.sh name --art jpeg   # nur die Zieldateinamen
```

**Die Berechtigung wird hier nicht geprüft.** Das tut die Weboberfläche, die
weiß, wer angemeldet ist und welche Liste wem gehört. Dieses Werkzeug bekommt
Kennungen und führt aus.

`name` gibt es nur zum Gegenprüfen: die Regel, wann das Original unverändert
durchgereicht wird, steht hier (`unveraendert`) und noch einmal in
`web/src/lib/herunterladen.ts`, weil Node den Dateinamen in die Kopfzeile
schreiben muss, bevor der Strom läuft.

**`import ableitung` steht absichtlich in der Funktion und nicht oben.** Es
zieht pillow-heif mit, und das kostet rund eine Drittelsekunde. Wer ein
Original oder ein Video holt, soll nicht dafür bezahlen – und das ist der
häufigere Fall. Gemessen: 0,2 s für ein Original gegen 1,5 s für ein
umgewandeltes HEIC.

---

# Verarbeitung anstoßen (Phase 4)

```bash
tools/verarbeiten.sh          # einlesen, dann ableiten – von Hand
tools/einlesen.sh             # nur einlesen
tools/ableiten.sh             # nur ableiten
echo 1 > /data/kajoe_bilder/.anstoss    # dasselbe über systemd
```

**Der Lauf gehört systemd, nicht der Weboberfläche.** Ein Kindprozess aus Node
heraus hinge am Webdienst: bei jedem Neustart stirbt er mit oder bleibt als
Waise zurück. Die Anwendung schreibt deshalb nur `/data/kajoe_bilder/.anstoss`;
`kajoe-verarbeiten.path` sieht die Datei und startet den Dienst, der sie als
Erstes entfernt.

Nachgemessen: während eines Laufs über 8.002 Dateien den Webdienst neu
gestartet – derselbe Ingest-Prozess lief unverändert weiter.

## Die Sperre ist ein flock, keine Datei

`tools/verarbeiten.sh` hält ein `flock` auf `.sperre`. Der Kern gibt es frei,
sobald der Prozess endet – **auch wenn er abstürzt**. Eine selbstgebaute
Sperrdatei, die niemand aufräumt, blockiert dagegen dauerhaft.

Nachgemessen: Sperre von Hand gehalten → Anstoß meldet „Es läuft bereits ein
Vorgang"; Halteprozess mit `kill -9` beendet → die Datei liegt noch da, ist
aber frei, und der nächste Anstoß läuft.

## Verwaiste Zeilen in `verarbeitung`

Eine Zeile mit `zustand = 'laeuft'`, deren Prozess es nicht mehr gibt, würde
jeden weiteren Anstoß blockieren – dieselbe Falle auf der Datenbankseite.
`verarbeitung.verwaiste_aufraeumen()` (Python) und `verwaisteAufraeumen()`
(Node) fragen mit `kill(pid, 0)` nach, ob es den Prozess noch gibt, und setzen
die Zeile sonst auf `abgebrochen`. Beide Wege sind geprüft.

## Fortschritt

Beide Schritte schreiben alle **100 Dateien** ihren Stand fort – in
`verarbeitung` (Stand) und in `verarbeitung_takt` (Verlauf). Aus einem
einzelnen Stand lässt sich keine Restzeit rechnen; erst zwei Messpunkte ergeben
ein Tempo, und das Tempo der letzten zwei Minuten ist etwas anderes als der
Durchschnitt seit dem Start.

`ingest_lauf` wird jetzt ebenfalls unterwegs fortgeschrieben. Bricht ein Lauf
ab, steht in der Zeile trotzdem, wie weit er kam.

---

# Der Aufräumlauf läuft von selbst (Phase 7)

`kajoe-aufraeumen.timer` stößt `tools/aufraeumen.sh --timer` täglich um
**03:20 UTC** an – nach der Sicherung um 03:00, damit der Dump von heute Nacht
noch den Stand *vor* dem Löschen enthält. `Persistent=true`: war der Rechner
um 03:20 aus, wird der Lauf nachgeholt. Dreißig Tage alte Vormerkungen werden
nicht jünger.

Der Lauf war bis dahin absichtlich von Hand. Beim Automatisieren kommen zwei
Sicherungen dazu, die nichts kosten.

## Der Probelauf ist die Vorgabe, und der Schalter steht in der `.env`

    AUFRAEUMEN_SCHARF=0   zählen und berichten, nichts entfernen (Vorgabe)
    AUFRAEUMEN_SCHARF=1   wirklich entfernen

**Nicht in der Unit und nicht im Skript.** In der Unit wäre die Umstellung ein
Eingriff in eine Dienstdatei samt `daemon-reload` – ein Schritt, den jemand
vergisst, und dann läuft der Lauf weiter im Probelauf, ohne dass es auffällt.
Fehlt die Zeile ganz, wird nur gezählt: die vorsichtige Richtung ist die
Vorgabe.

Ein Aufruf **von Hand** behält seine bisherige Bedeutung: `tools/aufraeumen.sh`
löscht, `--probe` zählt nur. Nur `--timer` liest die `.env`.

Der Modus steht am Anfang und am Ende des Berichts, in Großbuchstaben. Wer
überfliegt, soll nicht raten müssen, ob gerade wirklich gelöscht wurde.

## Die Obergrenze: 2.500 Dateien, dann Abbruch

Findet ein Lauf auf einmal mehr, ist das kein normaler Betrieb, sondern ein
Versehen – ein Sammelvorgang, der danebenging. Dann bricht er ab und meldet,
statt zu arbeiten. Dateien kommen nicht zurück.

Hergeleitet: die Oberfläche lässt höchstens `HOECHSTENS_JE_VORGANG = 500`
Aufnahmen je Sammelvorgang vormerken, je Aufnahme bis zu vier Dateien – also
bis zu 2.000 aus einem einzigen Vorgang. 2.500 lässt so einen Vorgang samt
Rest eines Vortages durch. Der ganze Bestand wären rund 50.000. Die Zahl steht
als `HOECHSTENS_DATEIEN` in `ingest/aufraeumen.py`, an einer Stelle.

**Erst zählen, dann löschen.** Der Lauf sammelt in einem ersten Durchgang
alles ein, prüft die Grenze und fängt erst danach an zu entfernen. Ein Abbruch
lässt deshalb garantiert keine halb aufgeräumte Menge zurück – nachgemessen:
700 Attrappen mit 2.800 Dateien, Abbruch, **alle 2.800 noch da**.

Ist die Menge wirklich richtig, hilft ein einmaliger Lauf von Hand:

    tools/aufraeumen.sh --hoechstens 3000

## Jeder Lauf wird protokolliert

Solange der Lauf von Hand lief, sah den Bericht, wer ihn anstieß. Ein Timer
stößt ihn nachts an, und dann sieht ihn niemand – ein Vorgang, der unbeobachtet
löscht, ist derselbe Fall wie eine ungetestete Sicherung.

Deshalb `aufraeumlauf` (Migration 007), eine Zeile je Lauf, und
`tools/status.sh` zeigt die letzten fünf:

```
  begonnen         Modus   durch  Ausgang  Sitz. Versu. Zeilen Datei.     Platz
  2026-09-01 13:02 scharf  timer  grenze       0      0    700   2800      0 MB
                   ABBRUCH: 2800 Datei(en) in 700 Zeile(n) faellig, erlaubt sind 2500.
  2026-09-01 13:02 scharf  timer  fertig       0      0      3     12      0 MB
  2026-09-01 13:01 probe   timer  fertig       0      0      3     12      0 MB
```

Die Zahlen heißen `_faellig` und nicht `_entfernt`: sie sagen, was der Lauf
**gefunden** hat. Ob es wegkam, sagt `modus`. Ein Probelauf, der
„12 entfernt" protokollierte, wäre eine Lüge in der Datenbank.

`ausgang` ist `fertig`, `grenze` oder `fehler` – und nie leer, wenn der Prozess
lebte: ein `trap … EXIT` schreibt auch bei einem Abbruch etwas hinein.
Nachgemessen mit einem erzwungenen Fehler: die Zeile steht auf `fehler` mit
„Abbruch mit Rueckgabewert 2". `status.sh` warnt bei Zeilen ohne Ausgang
(abgestürzt) und bei Abbrüchen an der Grenze in den letzten sieben Tagen.

## Was geprüft wurde

| | |
|---|---|
| Timer steht in `list-timers` | nächster Lauf 03:20:46 UTC, nach der Sicherung um 03:04 |
| Probelauf mit 3 Attrappen | meldet 12 Dateien, **entfernt nichts**, alle 12 danach noch da |
| Umstellung auf scharf | eine Zeile in der `.env`; derselbe Fall wird entfernt |
| Zeilen bleiben, `sha256` erhalten | 3 Zeilen vorher, 3 nachher, `sha256` gleich, Merkmale auf `FALSE` |
| Obergrenze mit 700 Attrappen | Abbruch bei 2.800 > 2.500, **keine Datei entfernt**, Dienst auf `failed` |
| `--hoechstens 3000` von Hand | läuft durch, 2.800 entfernt |
| `Persistent=true` | Stempeldatei auf vor 3 Tagen gesetzt, Timer gestartet → Lauf holt sofort nach |
| `status.sh` | zeigt Modus, Auslöser, Ausgang und Zahlen |
