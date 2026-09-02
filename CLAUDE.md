# kajoe_bilder – privates Fotoarchiv mit Auswahlfunktion

Rund 110 GB private Aufnahmen aus 2019–2026, heute in OneDrive. Das System liest sie
ein, ordnet sie nach Jahr und Monat, trennt Aufnahmen des eigenen iPhones von allem
anderen und stellt sie in einer Weboberfläche dar. Dort lassen sie sich in benannten
Listen sammeln und im Original herunterladen – Anlass ist ein Familienkalender, den
jemand außerhalb des Hauses zusammenstellt.

**Sprache: Deutsch.** Code-Kommentare, Spaltennamen, Oberflächentexte und
Commit-Nachrichten sind deutsch. Bezeichner ohne Umlaute (`geloescht_am`, nicht
`gelöscht_am`).

Ausführliches *Warum* in `docs/anforderungen.md`.

---

## Abgrenzung

Dieses Projekt läuft auf **`webspace`** (192.168.188.122). Der Server `hunter`
(192.168.188.123) und alles unter `~/hunting/` gehören **nicht zum Auftrag** – nicht
lesen, nicht ändern, nicht per SSH abrufen. Was von dort übernommen wird, steht in
diesem Dokument.

Auf `webspace` entstehen später weitere Projekte:

| | kajoe_bilder | frei für später |
|---|---|---|
| Code | `~/webspace/kajoe_bilder/` | `~/webspace/<projekt>/` |
| Daten | `/data/kajoe_bilder/` | `/data/<projekt>/` |
| Postgres | `127.0.0.1:5432` | 5433, 5434, … |
| Web | `127.0.0.1:3000` | 3001, 3002, … |

`~/webspace/` ist die Klammer für alles, was auf dieser Maschine entsteht.
Skripte lesen ihren Projektpfad **relativ zu sich selbst**, nie fest verdrahtet –
sonst bricht ein Verschieben des Ordners alles.

Ports werden hier eingetragen, bevor sie belegt werden.

### Die Platten

**`/data` ist der Einhängepunkt, nicht `/data/kajoe_bilder`.** Seit dem Umzug auf
eine eigene Datenplatte liegen die Projekte als gewöhnliche Unterverzeichnisse
darin.

| | |
|---|---|
| Gerät | `/dev/sda1`, 931,5 GB SSD |
| Dateisystem | ext4, Label `daten` |
| UUID | `13abc672-a8df-4ea7-b379-55ebbb8808ac` |
| eingehängt unter | `/data` (in `/etc/fstab`, per UUID) |
| Reserve | auf 1 % gesenkt – gemessen 1,02 %, also 9,3 GB statt 46 GB |
| nutzbar | 916 GB, davon 117 GB belegt (13 %), 790 GB frei |
| Inhalt | 55.542 Dateien |

Die **Systemplatte** ist unverändert: `nvme0n1`, 476,9 GB, davon 473,9 GB als
LVM in `ubuntu-vg`; `/` bekommt 100 GB, der Rest bleibt frei.

**Kein LVM auf der Datenplatte.** Ein Volume je Projekt wäre nur eine
Größenbeschränkung, die man später mühsam nachjustiert; auf einer eigenen
Datenplatte konkurriert nichts mit dem System. Der Preis ist bekannt und
angenommen: **ein Projekt kann die Platte für alle vollaufen lassen.** Bei
916 GB und Hobbyprojekten überschaubar – `tools/status.sh` und
`tools/nachneustart.sh` zeigen den Platz, letzteres warnt ab 90 %.

**Das alte Logical Volume `ubuntu-vg/kajoe_bilder` (250 GB) existiert noch** und
ist in der `fstab` auskommentiert. Es ist die Rückfalltür und wird erst
entfernt, wenn der neue Zustand ein paar Tage getragen hat.

> Deshalb prüft `tools/nachneustart.sh` nicht nur, **ob** `/data` eingehängt
> ist, sondern auch, **worauf** `/data/kajoe_bilder` liegt. Hängt die Platte
> nicht ein, existiert der Ordner trotzdem – leer, auf der 100-GB-Wurzel. Alles
> sähe normal aus, der Ingest legte munter Dateien an, und auffallen würde es
> erst, wenn `/` vollläuft oder jemand seine Bilder sucht. Und geprüft wird die
> `fstab` mit `findmnt --fstab`, nicht mit `grep`: ein `grep /data /etc/fstab`
> trifft auch die auskommentierte Zeile des alten Volume und meldet Erfolg, wo
> keiner ist.

### Zwei Warnungen, die erwartet sind

`tools/status.sh` meldet zwei Dinge als Auffälligkeit, die **derzeit richtig
sind**:

```
0.0.0.0:3000 – ACHTUNG: nicht auf 127.0.0.1 gebunden
COOKIE_SECURE  0 – Sitzungscookie OHNE Secure, nur fuers LAN gedacht
```

Beides gehört zusammen und beides ist Absicht, **bis der Cloudflare Tunnel
kommt** (etwa drei Monate). Das lokale Netz ist über `ufw` auf
`192.168.188.0/24` begrenzt, und über `http://webspace:3000` käme ein
`Secure`-Cookie nie an – die Anmeldung schlüge scheinbar grundlos fehl.

**Mit dem Tunnel gehört beides zurück:** `-H 127.0.0.1` in
`systemd/kajoe-web.service` und `COOKIE_SECURE=1` in der `.env`.

Die Warnungen bleiben stehen und sollen weiter auffallen. Dieser Absatz ist
das, was sie einordnet – ohne ihn passiert eines von zwei Dingen: jemand
„repariert" den Zustand, solange er richtig ist, oder er bleibt stehen, wenn er
falsch geworden ist.

---

## Stand

| Phase | Inhalt | Status |
|---|---|---|
| 0 | Platte, Docker, Node, ffmpeg, Repo | **fertig** |
| 1a/1b | Ingest: Katalogisierung, Herkunft, Ableitungen | **fertig** |
| 2a/2b | Anmeldung, Benutzerverwaltung, Galerie | **fertig** |
| 3a/3b | Auswahllisten, Herunterladen, Aufräumen | **fertig** |
| 4 | Verarbeitung aus der Oberfläche anstoßen | **fertig** |
| 5 | Karte (GPS) | **fertig** |
| 6 | Jahresfreischaltung je Benutzer | **fertig** |
| 7 | Aufräumen und Systempflege automatisieren | **fertig** (Neustart steht aus) |
| 8 | Mehrjahresfilter, von der Karte in die Galerie | **fertig** |
| 9 | Cloudflare Tunnel | offen |

Die Nummern folgen den Auftragsdateien in `docs/`. Gegenüber der ursprünglichen
Planung ist eine Phase dazugekommen – das Anstoßen der Verarbeitung aus der
Oberfläche –, deshalb sind Karte und Tunnel um eins nach hinten gerückt.

**Bitte einzeln bauen und testen, nicht alles auf einmal.**

Vorhanden: Docker 28 + Compose 2.40, Node 22.11.0 (`~/.local/node/bin`),
ffmpeg 8.0.1 mit Quick Sync (HEVC 8 und 10 Bit lesen, H.264 schreiben),
PostgreSQL 17 im Container auf `127.0.0.1:5432`, tägliche Sicherung als
Benutzertimer um 03:00 UTC (Linger gesetzt), Git mit privatem GitHub-Repository,
Systemzeit UTC.

**Vor Phase 1 steht die Bestandsmessung.** Erst wenn `exiftool` einmal lesend über
`eingang/` gelaufen ist und Anzahl, Herstellerverteilung, Videoanteil, Videocodec und
GPS-Quote als Zahlen vorliegen, wird der Ingest gebaut – sonst baut er gegen Annahmen
statt gegen die Daten.

---

## Was die Messung ergeben hat

Jahrgang 2026, 1.102 Dateien, 8,5 GB, ausgewertet mit `tools/bestand.py`
(nicht mit `awk`: exiftool setzt Felder mit Komma in Anführungszeichen, und ein
Trennen an jedem Komma verschiebt ab da alle Spalten der Zeile – das fällt nur auf,
wenn man hinsieht, die Zahlen sehen plausibel aus und sind falsch).

| | |
|---|---|
| iphone | 60,3 % |
| ohne_exif | 23,5 % |
| fremd (davon 177 von 178 Secacam) | 16,2 % |
| HEIC + HEIF | 54,0 % |
| Videodateien | 169 |
| mit GPS | 74,6 % |
| **ohne `DateTimeOriginal`** | **22,2 %** |
| mit Zeitversatz | 53,6 % |

**Videos sind 80 % des Volumens.** 6,8 GB gegen 1,7 GB bei den Bildern; ein Foto hat
im Schnitt 1,8 MB. Hochgerechnet auf 110 GB sind das rund **22 GB Fotos und 88 GB
Videos**, insgesamt etwa 14.000 Dateien. Zwei Folgen: Der Platz ist bei den Fotos kein
Engpass – vollauflösende JPEGs wären rund 50 GB und passten sogar vorab. Und der
eigentliche Brocken sind die Videos, weshalb die Wiedergabefassung weiterhin erst bei
Bedarf entsteht.

**Der Rückfallweg beim Datum ist der Normalfall, kein Randfall.** Jede fünfte Datei
hat kein `DateTimeOriginal`. Er muss entsprechend sorgfältig gebaut sein.

**`fremd` bestand 2026 zu 99 % aus Wildkamerabildern** – kein einziges echtes
Fremdfoto, keine Digitalkamera, kein Android. Ob das für die Jahrgänge ab 2019 auch
gilt, ist offen und wird bei der nächsten Messung geprüft.

---

## Aufbau

```
~/webspace/kajoe_bilder/
├── docker-compose.yml       PostgreSQL 17 auf 127.0.0.1:5432
├── .env                     Zugangsdaten – NIEMALS committen
├── db/migrations/           Schema, nummeriert
├── ingest/                  Phase 1: Einlesen, EXIF, Ableitungen
├── tools/                   sicherung.sh, migrieren.sh, bestand.py, status.sh
├── systemd/                 Kopien der Dienst- und Timer-Dateien
├── betrieb/                 Kopien der Dateien, die als root nach /etc gehören
├── sicherung/               pg_dump, 14 Tage – nicht im Repository
├── web/                     Phase 2+: Next.js
└── docs/                    Anforderungen, Betrieb
```

```
/data/                       Einhaengepunkt, /dev/sda1, 916 GB
└── kajoe_bilder/            gewoehnlicher Ordner, kein eigenes Volume
    ├── eingang/             wird hineinkopiert, vom Ingest geleert
    ├── quarantaene/         was der Ingest nicht lesen konnte
    ├── original/<jahr>/<monat>/<sha256>.<endung>
    └── abgeleitet/<jahr>/<monat>/<sha256>-{vorschau,ansicht}.jpg
                             und -wiedergabe.mp4 bei Videos
```

---

## Entscheidungen, die nicht verhandelbar sind

### Herkunft statt Objekterkennung

**Es gibt keine KI in diesem Projekt.** Der ursprüngliche Entwurf sah einen Detektor
für Personen und Tiere vor. Er ist gestrichen, aus zwei Gründen: Er hätte jedes
Landschaftsbild weggeworfen – also gerade die Kalendermotive –, und ein
deterministisches Merkmal ist einem Modell überlegen, wenn es verfügbar ist.
`Make = Apple` ist wahr oder falsch, kostet Millisekunden und irrt sich nie.

Fünf Werte in `bild.herkunft`:

| Wert | Kriterium |
|---|---|
| `iphone` | `Make = Apple` und ein iPhone-Modell |
| `apple_sonstig` | Apple, aber iPad, Mac oder Screenshot-Merkmale |
| `fremd` | anderes `Make` – Gerätename bleibt gespeichert |
| `ohne_exif` | kein `Make` (Messenger, Netzfund, Screenshot) |

**Nichts wird beim Einlesen verworfen.** Die Herkunft ist ein Filter in der Abfrage,
kein Ausschluss im Ingest. Die Galerie zeigt standardmäßig `iphone`, der Rest ist
erreichbar. Unter `fremd` können Fotos liegen, die andere von der Familie gemacht und
geschickt haben – genau die Bilder, die im Kalender landen könnten. Ein Ingest, der
wegwirft, trifft eine Entscheidung, die niemand zurücknehmen kann, und man weiß
hinterher nicht einmal, was gefehlt hat.

`fremd` und `ohne_exif` bleiben getrennt: Ersteres sind fast immer echte Aufnahmen,
Zweiteres fast immer nicht.

**Eine Ausnahme: Wildkamerabilder werden nicht eingelesen.** `Make` beginnt mit
`ZEISS` oder `VenTrade` (Secacam). Sie gehören zum Wildkameraprojekt auf `hunter`, das
sie bereits vorhält, und unterliegen dort eigenen Regeln zu Personenaufnahmen und
Kamerastandorten – hinter einem öffentlich erreichbaren Tunnel für die erweiterte
Familie wären sie eine stille Umgehung dieser Regeln. In der Messung von 2026 waren
das 177 von 1.102 Dateien, also 16 %; in den übrigen Jahrgängen ist dasselbe zu
erwarten.

**Übersprungene Dateien werden gezählt**, nicht stillschweigend übergangen. Wer am
Ende 11.800 von 14.000 Dateien in der Datenbank findet, muss sehen können, wo die
übrigen geblieben sind.

### Zeit: hier gilt die Ortszeit, nicht UTC

**Andere Regel als im Jagdprojekt, und das mit Absicht.** Dort steht die Kamera fest
im Revier, UTC ist eindeutig. Fotos reisen mit.

Maßgeblich ist `aufnahme_lokal` (`TIMESTAMP`, ohne Zeitzone) – das, was das Telefon
angezeigt hat. Jahr und Monat kommen daraus. Sonst passiert zweierlei: Ein Bild von
Silvester 00:30 Berliner Zeit ist 23:30 UTC am Vortag und läge im falschen Jahr; ein
Urlaubsbild aus Thailand von 10:00 Uhr läge als 03:00 UTC unter „nachts".

`aufnahme_utc` wird nur gefüllt, wenn `OffsetTimeOriginal` vorlag, und dient dem
Sortieren über Zeitzonen hinweg. Alle **Betriebs**zeitstempel (`eingelesen_am`,
`geloescht_am`, Anmeldungen) bleiben `TIMESTAMPTZ` in UTC.

Rangfolge der Zeitquelle: **EXIF `DateTimeOriginal` → Muster im Dateinamen
(`IMG_20230715_…`, `PXL_…`) → Ordnername → Dateizeit.** Die Dateizeit steht ganz
unten, weil sie nach einem OneDrive-Abgleich meist das Kopierdatum ist. Welche Quelle
gegriffen hat, steht in `zeitquelle` – ohne diese Spalte ist bei Bildern ohne EXIF
später nicht mehr zu klären, ob ein Datum etwas taugt.

Der Zeitstempel im OneDrive-Dateinamen ist UTC, nicht Ortszeit. Gemessen an 587 Dateien mit DateTimeOriginal und OffsetTimeOriginal: ausnahmslos gilt DateTimeOriginal = Dateiname + Zeitversatz. Wer den Namen als Ortszeit liest, legt ein Bild von Silvester 00:30 Berliner Zeit ins falsche Jahr — genau der Fehler, gegen den die Ortszeitregel gedacht ist. Für diese Dateien wird deshalb aufnahme_utc aus dem Namen gefüllt und aufnahme_lokal über Europe/Berlin gerechnet. zeitversatz bleibt dabei leer, weil ihn kein Gerät geschrieben hat — daran ist die Annahme später erkennbar. Für Android-Muster (IMG_, PXL_) gilt weiterhin Ortszeit; die Zone steht als einordnen.ZONE an einer Stelle.

### Das Original wird nach dem Einlesen nie wieder angefasst

Alles, was die Oberfläche zeigt oder ausliefert, ist eine Ableitung. Ein Ingest, der
Originale dreht, umbenennt oder überschreibt, ist ein Fehler, auch wenn das Ergebnis
besser aussieht.

**HEIC wird nicht „verlustfrei konvertiert" – das gibt es nicht.** HEIC ist
HEVC-basiert und selbst verlustbehaftet; jedes JPEG daraus ist zweite Generation. Ein
wirklich verlustfreies Ziel (PNG, TIFF) wäre das Zehnfache an Platz und passt nicht
auf die Platte. Also: HEIC bleibt Archiv, JPEG ist Anzeige und Download.

- Vorschau ~300 px, Ansicht ~1600 px, beide JPEG
- Vollauflösendes JPEG **erst beim Herunterladen**, Qualität 95
- Beim Download **nicht verkleinern**: 4032 × 3024 sind bei 300 dpi rund 34 × 25 cm,
  für ein Kalenderblatt reichlich

Kein Druckdienstleister nimmt HEIC an – die Umwandlung ist keine Notlösung, sondern
der Zweck.

### sechs Dinge, die bei der Umwandlung schiefgehen

**Farbprofil.** Das iPhone nimmt in **Display P3** auf. Wer naiv umwandelt, bekommt
flaue, verschobene Farben – rote Blumen und Sonnenuntergänge sichtbar daneben. Für den
Druck sauber nach **sRGB** umrechnen, nicht das Profil einfach fallenlassen.

**Ausrichtung.** EXIF `Orientation` anwenden, sonst liegen alle Hochformate quer.

**EXIF mitnehmen.** Aufnahmezeit und GPS gehören in die heruntergeladene Datei, nicht
nur in die Datenbank.

**Farbunterabtastung.** JPEG wirft standardmäßig Farbe weg (4:2:0). Bei Qualität 95
auf **4:4:4** stellen, sonst franst Rot an Kanten aus.

Der eine echte Verlust: iPhone-HEIC ist **10 Bit**, JPEG kann 8. Bei Himmelsverläufen
theoretisch Streifenbildung. Im Kalenderdruck kein Thema – und genau deshalb bleibt
das Original liegen.

-Orientation#=1 mit Gatter, nie ohne. Ohne das # deutet exiftool den Wert als Klartext, findet die „1" in der Beschreibung „Rotate 180" und schreibt eine 3. Das Bild kommt beim Empfänger auf dem Kopf an, und im Download-JPEG fällt das erst auf, wenn jemand es öffnet.

faststart wird an der Boxreihenfolge geprüft, nicht am Fundort von mdat. Mit Schalter ftyp moov free mdat, ohne ihn ftyp free mdat moov. Eine Suche nach mdat in den ersten Kilobytes misst etwas anderes und meldet immer dasselbe.
### Videos

**Live Photos kommen über OneDrive nicht an.** In der Messung von 2026 gab es keine
einzige MOV-Datei mit gleichnamigem Bildpartner – OneDrive überträgt das Standbild und
lässt den Bewegtteil weg. Eine Sonderbehandlung ist deshalb nicht nötig.

Der Ingest **zählt** trotzdem mit, zu wie vielen MOV-Dateien eine gleichnamige
Bilddatei gehört, und schreibt die Zahl in den Laufbericht. Kostet nichts, greift
nicht ein – aber falls die alten Jahrgänge anders aussehen als 2026, fällt es auf,
statt vermutet zu werden. Die Spalte `live_photo` bleibt dafür im Schema.

**HEVC spielt kein Chrome und kein Firefox.** Umpacken in einen MP4-Container hilft
nicht – der Codec ist das Problem, nicht der Container. Aufnahmen mit der iPhone-
Einstellung „Maximale Kompatibilität" sind bereits H.264 und brauchen nur ein
verlustfreies Umpacken; wie sich das verteilt, sagt die Bestandsmessung.

**Die Wiedergabefassung entsteht erst beim ersten Abspielen** (1080p, H.264) und wird
zwischengespeichert. Nicht vorab für alle: H.264 ist bei gleicher Qualität rund doppelt
so groß wie HEVC, und die meisten Videos sieht ohnehin nie jemand an. Wird der Platz
knapp, kann der Zwischenspeicher weg – die Dateien entstehen bei Bedarf neu.

**Hardwarebeschleunigung nutzen.** Die UHD 630 kann HEVC lesen (auch 10 Bit) und H.264
schreiben, geprüft mit `vainfo`. Über VAAPI statt Prozessor ist das fünf- bis zehnfache
Echtzeit statt langsamer als Echtzeit.

**`-movflags +faststart` ist Pflicht.** Ohne den Schalter liegen die Sprungmarken am
Dateiende und der Browser lädt erst alles herunter, bevor das erste Bild erscheint.
Hinter dem Tunnel ist das der Unterschied zwischen „läuft" und „läuft nicht".

**HDR braucht Tone Mapping.** Neuere iPhones nehmen in Dolby Vision auf. Ohne
Farbraumumsetzung sieht die H.264-Fassung ausgewaschen und grau aus – ein Effekt, den
man leicht für einen Kodierfehler hält.

**Videovorschau bei etwa 10 % der Laufzeit greifen**, nicht bei Sekunde null: der
Anfang ist oft schwarz oder verwackelt.

### GPS

EXIF liefert Grad/Minute/Sekunde plus Himmelsrichtung, nicht Dezimalgrad. Beim
Einlesen umrechnen – **`S` und `W` sind negativ**, wer das vergisst, spiegelt seine
Bilder auf die Nordhalbkugel. Daneben `gps_status` (`ok`, `fehlt`, `unplausibel`);
Fehlen ist häufig, bei ausgeschalteter Ortung schreibt das iPhone nichts. In der
Messung von 2026 hatten 74,6 % der Dateien eine Koordinate.

**Koordinaten werden auf Plausibilität geprüft, nicht blind übernommen.** Manche
Geräte schreiben Platzhalter statt echter Werte – Secacam-Kameras mit ARGUS-Firmware
etwa 1,0225/1,0225, den Golf von Guinea. Ohne Prüfung stünden Familienbilder vor
Westafrika auf der Karte. Verworfen wird nach `unplausibel`: exakt 0/0 oder in dessen
unmittelbarer Nähe, außerhalb des gültigen Bereichs, oder mehrfach identische
Koordinaten auf die letzte Nachkommastelle.

**GPS auf privaten Fotos hinter einem öffentlich erreichbaren Tunnel heißt: die
Wohnadresse steht in den Daten.** Die Karte ist deshalb kein Selbstläufer, sondern
eine Entscheidung – im Zweifel nur für Verwalter.

Seit Phase 5 ist genau das umgesetzt: `/karte` hängt am Recht `karte`. Ein
Verwalter darf ohnehin alles, ein Betrachter sieht die Karte erst, wenn jemand
ihm dieses Recht ausdrücklich gibt. Die Zahlen geben der Vorsicht recht:
**5.247 der 15.083 verorteten Aufnahmen liegen in einem Umkreis von fünfzig
Metern um denselben Punkt.** Eine Stufe hineingezoomt sind Straßenname und
Hausnummer zu lesen. Es gibt kein Rückwärtssuchen nach Ortsnamen – das hieße,
private Koordinaten einzeln an einen fremden Dienst zu schicken. **Kein
PostGIS**: eine Gitterrechnung über gerundeten Koordinaten genügt.

### Einlesen ist ein wiederkehrender Vorgang

Es kommen weitere Bestände dazu, unter anderem aus einem zweiten OneDrive-Konto.
Daraus folgt:

**Dubletten werden ausschließlich über `sha256` erkannt, nie über den Dateinamen.**
iPhones zählen `IMG_0001` bis `IMG_9999` und fangen wieder von vorn an – zwei Telefone
in einem Haushalt haben mit Sicherheit dieselben Namen. Dasselbe Motiv aus zwei
Kameras ist keine Dublette und soll auch keine sein.

**Der Ingest räumt hinter sich auf.** Was übernommen wurde, verschwindet aus
`eingang` – sonst arbeitet der nächste Lauf denselben Berg noch einmal durch.

**Was nicht durchläuft, bleibt sichtbar.** Nach `quarantaene/` verschieben und in der
gleichnamigen Tabelle vermerken. Still übergehen wäre das Schlimmste: Man zählt
hinterher 4.812 statt 4.830 und weiß nicht, welche achtzehn fehlen.

**Jeder Lauf wird protokolliert** (`ingest_lauf`): gefunden, übernommen, Dubletten,
Quarantäne. Ohne das weiß niemand, ob ein Lauf sauber durchkam oder in der Mitte abbrach.

**Woher ein Bild kam, wird mitgeschrieben** (`quelle`). Bei „warum ist das doppelt"
tappt man sonst im Dunkeln.

### Auswahllisten

**Benannte Listen, privat, mit Freigabeschalter.** So lässt sich die Arbeit
unterbrechen und fortsetzen, und „Kalender 2027" steht neben „Kalender 2028".

Markierungen landen **sofort** in der Datenbank, nicht erst bei einem
Speichern-Knopf – einer, den jemand vergisst, wäre eine verlorene Sitzung.

`freigegeben` heißt **sehen, nicht ändern**. Gefiltert wird in der **Abfrage**, nicht
in der Anzeige, und **jede** Aktion prüft den Besitzer noch einmal: dass die Seite
davor nur eigene Listen zeigt, ist keine Prüfung.

### Löschen ist zweistufig

Vormerken setzt `geloescht_am` und blendet aus; die Datei verschwindet erst nach
30 Tagen im Aufräumlauf. Ein Stapellauf über hunderte Bilder, der sofort Dateien
entfernt, ist nicht umkehrbar und wird es auch nicht durch eine Rückfrage.

Bilder in einer Auswahlliste nimmt das stapelweise Aufräumen **nicht** mit.

### Zugriff

**Zwei Rollen.** `verwalter` legt Benutzer an und darf Stapel löschen, `betrachter`
sieht, sammelt und lädt herunter. Die Prüfung steht in **jeder** Seite, **jeder**
Server Action und **jeder** Route – ein ausgeblendeter Knopf ist keine Prüfung, ein
altes Lesezeichen käme sonst durch.

Eine Sicherheitsregel, die man einsetzen kann, kann man auch vergessen. Bedingungen, die den Zugriff einschränken, werden nicht als Konstante exportiert, sondern nur über eine Funktion herausgegeben, die die Sicht des Benutzers verlangt. Dann meldet der Übersetzer jede Stelle, statt dass jemand sie suchen muss – und eine neue Abfrage kann sie nicht auslassen.

**Benutzer werden abgeschaltet, nicht gelöscht** (`aktiv`), sonst verwaisen ihre
Listen.

**Dazu die Jahresfreischaltung** (`benutzer.jahre`, Migration 006) – eine dritte,
von Rolle und Rechten unabhängige Achse. Anlass: für den Kalender bekommt jemand von
außen Zugriff auf genau den Jahrgang, aus dem der Kalender entsteht. `NULL` ist die
Vorgabe und heißt **alle Jahre, auch künftige**; eine Liste heißt genau diese Jahre,
eine leere Liste keines. Ein **Verwalter ist nie eingeschränkt**, unabhängig vom Feld.

**Der Unterschied zwischen `NULL` und einer Liste aller heutigen Jahre ist der ganze
Punkt.** Bei `NULL` erscheint 2027 von selbst, sobald die ersten Bilder daraus
eingelesen sind. Müsste jemand eine Liste nachführen, stünde im Januar der ganze
Haushalt ohne den neuen Jahrgang da – und es fiele erst auf, wenn jemand sein Bild
sucht. Bestehende Konten haben deshalb `NULL` bekommen, nicht die heutigen Jahre.

Durchgesetzt wird das in `web/src/lib/sichtbar.ts`, an **einer** Stelle, zusammen mit
`geloescht_am IS NULL`. Der wichtigste Ort ist nicht die Galerie, sondern
`/datei/…`: dort gehen die Bilder über die Leitung, und eine geratene Kennung darf
kein Vorschaubild aus einem gesperrten Jahrgang liefern.

**Freischaltung und Filter sehen sich ähnlich und sind es nicht.** Die
Freischaltung sagt, was jemand **darf**, der Filter, was er gerade **sehen
will**. Seit Phase 8 nimmt der Jahresfilter eine Aufzählung
(`jahr=2022,2023,2025`); beide Bedingungen stehen mit UND nebeneinander, es
entsteht also immer der Durchschnitt. Ein Jahr in der Adresse, das nicht
freigeschaltet ist, liefert nichts – keine Fehlerseite, kein Sonderfall. Bei
einem einzelnen Jahr fiele eine fehlende Prüfung sofort auf, bei einer
Aufzählung mit einem unberechtigten Eintrag darin nicht.

**In einer Auswahlliste bleiben gesperrte Bilder stehen** und kommen nach der
Freischaltung wieder. Die Liste sagt aber, wie viele fehlen – „55 Bilder, davon 12
derzeit nicht verfügbar". Still weglassen wäre das Schlimmste: man lädt ein Paket
herunter und baut einen Kalender mit Lücken, ohne zu wissen, dass welche fehlen.

**Auf der Anmeldeseite steht nicht, worum es geht.** Hinter dem Tunnel ist sie
öffentlich erreichbar – keine Namen, keine Familie, keine Fotos, weder im Text noch im
Titel noch in den Metaangaben, auch nicht im Wurzel-Layout, dessen Titel dort
durchschlägt. Die Seiten dahinter dürfen heißen, wie sie wollen.

**Anmeldeversuche werden festgehalten, Passwörter nie** – auch nicht gekürzt und nicht
gehasht. Jeder Ausgang wird vermerkt, der erfolgreiche mit: sonst bliebe die eine Frage
offen, ob am Ende doch jemand durchkam. Hinter dem Tunnel kommt die Adresse aus
`CF-Connecting-IP`, ersatzweise aus dem **ersten** Eintrag von `X-Forwarded-For`. Nach
90 Tagen fällt alles weg; IP-Adressen sind personenbezogene Daten.

**Sammelpakete im Datenstrom erzeugen, nicht im Speicher bauen**, mit Obergrenze je
Paket. Zweihundert Vollbilder sind gut ein Gigabyte.

### Automatisch löschen nur mit zwei Sicherungen

Der Aufräumlauf ist der **einzige Vorgang im System, der Dateien wirklich
entfernt**. Seit Phase 7 stößt ihn ein Timer täglich um 03:20 UTC an – nach
der Sicherung um 03:00, damit der Dump von heute Nacht noch den Stand vor dem
Löschen enthält.

Dazu gehören zwei Dinge, die nichts kosten:

**Der Probelauf ist die Vorgabe.** `AUFRAEUMEN_SCHARF` steht in der `.env`,
nicht in der Unit und nicht im Skript: die Umstellung auf scharf soll eine
Zeile sein und kein `daemon-reload`, den jemand vergisst. Fehlt die Zeile,
wird nur gezählt.

**Eine Obergrenze je Lauf** (2.500 Dateien, `HOECHSTENS_DATEIEN` in
`ingest/aufraeumen.py`). Darüber bricht der Lauf ab und meldet, statt zu
arbeiten – gezählt wird vollständig, bevor die erste Datei fällt. Mehr als
2.500 auf einmal ist kein Betrieb, sondern ein Versehen, und Dateien kommen
nicht zurück.

**Und jeder Lauf wird protokolliert** (`aufraeumlauf`, in `tools/status.sh`).
Ein Vorgang, der unbeobachtet löscht, ist derselbe Fall wie eine ungetestete
Sicherung.

### Ein Neustart macht jede Prozessnummer wertlos

`unattended-upgrades` startet den Rechner um 03:45 UTC neu, wenn ein
Sicherheitsstand es verlangt – und kann dabei einen laufenden Ingest treffen.

Wer sich merkt, welcher Prozess einen Lauf führt, darf **nicht** allein die
Prozessnummer prüfen. Nach einem Neustart beginnt deren Vergabe wieder bei 1;
eine Zeile mit `pid = 1473239` trifft dann irgendwann auf einen völlig anderen,
lebenden Prozess und gilt für immer als „läuft noch". Der Rechnername ist
derselbe, also greift auch der zweite Riegel nicht. Die Folge wäre still und
vollständig: jeder weitere Anstoß wird abgewiesen, in der Oberfläche steht ein
Vorgang, den es nicht gibt, und die Verarbeitung ist tot.

Deshalb steht in `verarbeitung.boot_kennung` die Kennung des Systemstarts
(`/proc/sys/kernel/random/boot_id`, Migration 008). Weicht sie ab, ist der
Prozess mit Sicherheit weg, und die Nummer wird gar nicht erst befragt.

### Sicherung

**Die Bilder sind ersetzbar, die Datenbank nicht.** Die Originale liegen weiter in
OneDrive. Einmalig ist, was hier entsteht: Benutzer, Auswahllisten, Kategorien.
Täglicher `pg_dump` ab Phase 0, nicht später.

---

## Arbeitsweise

- Schemaänderungen **nur** als neue nummerierte Datei in `db/migrations/`, bestehende
  Dateien nicht ändern. Eingespielt wird über `tools/migrieren.sh`, nie von Hand mit
  `psql < datei.sql`: das Skript sieht in `migrationsstand` nach, was schon gelaufen
  ist, spielt nur Offenes ein und trägt es danach ein. Die Prüfsumme fällt auf, wenn
  jemand eine bereits eingespielte Datei nachträglich ändert – ohne sie laufen Datei
  und Datenbank still auseinander, und beim nächsten frischen Aufsetzen entsteht etwas
  anderes als das, was im Betrieb läuft
- Alles, was mehrfach laufen kann, muss mehrfach laufen können, ohne Schaden anzurichten
- Vor Commits `git status` prüfen. **Nie `git add -A`**, immer `git add <datei>`.
  `.env`, `/data/kajoe_bilder` und `node_modules/` gehören nie ins Repository
- Keine IP-Adressen in Konfigurationen, nur Hostnamen
- Abfragen und Ansichten immer seitenweise, nie alles auf einmal laden
- **psycopg-Verbindungen, die schreiben, brauchen `autocommit=True`.** Ohne ihn öffnet
  schon die erste `SELECT`-Abfrage eine Transaktion und hält sie offen; ein späteres
  `with db.transaction()` legt dann nur einen Savepoint darin an. Committet wird nie,
  und beim Prozessende ist alles zurückgerollt – **ohne eine einzige Fehlermeldung**.
  Wer schreibt, zählt die geschriebenen Zeilen mit und prüft nach dem ersten
  Schreibvorgang über eine **zweite Verbindung** nach: die eigene Sitzung sieht auch
  das, was nur in ihrer offenen Transaktion steht
- **`BIGINT` liefert der Postgres-Treiber als Zeichenkette**, ganz gleich, was der
  TypeScript-Typ behauptet. Wer das mit einer echten Zahl vergleicht (`Set.has`, `===`),
  vergleicht `"1908"` mit `1908` und bekommt immer `false`. In der Abfrage
  `id::int AS id` schreiben oder mit `Number()` umwandeln
- **systemd kennt `~/.bashrc` nicht.** Dienste, die `node` oder `ffmpeg` aufrufen,
  brauchen den vollen Pfad oder `Environment=PATH=…`
- Was nur im Browser passiert, wird auch im Browser geprüft, nicht am ausgelieferten
  Markup. Bei React sagt `defaultChecked` im Quelltext nichts darüber, was das Formular
  tatsächlich abschickt

- **`BIGINT` liefert der Postgres-Treiber als Zeichenkette**, ganz gleich, was der
  TypeScript-Typ behauptet. […]
- **Die Bindung auf `0.0.0.0` und `COOKIE_SECURE=0` sind bis zum Cloudflare Tunnel
  Absicht** – ausführlich unter „Zwei Warnungen, die erwartet sind". `tools/status.sh`
  meldet beides weiterhin, und das soll es auch
- **Ein Dienst, der im Normalbetrieb `failed` meldet, macht die Zustandsanzeige
  wertlos.** Next fängt SIGTERM ab und endet mit 143; für systemd ist das ein
  Rückgabewert und kein Signaltod, also stand `kajoe-web` nach jedem normalen
  Stopp auf `failed`. Wer dreimal ein rotes `failed` bei laufendem System sieht,
  sieht beim vierten Mal nicht mehr hin. `SuccessExitStatus=143` in die Unit –
  genau die Abfrage `--state=failed` sucht in `tools/nachneustart.sh` nach
  Schäden
- **Kein zweiter Ort für dasselbe Geheimnis.** `DATABASE_URL` stand als eigener Eintrag
  in der `.env` und enthielt das Passwort ein zweites Mal. Am 31.08.2026 hing die
  Anwendung stundenlang an einem Passwort, das nur an einer Stelle stimmte, und
  niemandem fiel es auf. Wer eine Verbindungszeichenkette braucht, setzt sie aus den
  Einzelwerten zusammen: `datenbank.datenbank_url()` in Python,
  `datenbankUrl()` in `web/src/lib/umgebung.ts`
- **`except Exception` schluckt `BrokenPipeError`.** Ein Paket, dessen Abnehmer weggeht,
  wird sonst zu Ende gerechnet, läuft in die volle Rohrleitung und bleibt dort für immer
  stehen. Abbrüche gehören durchgereicht, nicht behandelt – erst danach kommt der
  Auffangzweig für kaputte Einzeldateien
- **Eine Seite, die ohne Datenbank rendert, verdeckt einen Totalausfall.** `/anmelden`
  liest nur ein Cookie und antwortet mit 200, während alles dahinter tot ist. Deshalb
  steht in `tools/status.sh` eine **echte Abfrage mit den Zugangsdaten der Anwendung**,
  über `127.0.0.1:5432` und nicht über `docker exec` – im Container gilt für den
  Unix-Socket `trust`, dort wird das Passwort gar nicht geprüft
- **`set -o pipefail` und `grep -q` vertragen sich nicht.** `grep -q` steigt beim
  ersten Treffer aus, der Erzeuger bekommt SIGPIPE und endet mit 141, und `pipefail`
  macht daraus einen Fehlschlag der ganzen Leitung – **obwohl der Treffer da war**.
  Bei kurzen Ausgaben gewinnt der Erzeuger das Rennen und es fällt nie auf; ab einer
  gewissen Größe kippt es. Genau so schlug am 31.08.2026 jede Sicherung fehl, sobald
  der Dump 1,5 MB überschritt – die Prüfung „enthält die Tabelle `bild`" meldete Nein,
  während die Tabelle drin war. Stattdessen einmal in eine Variable lesen und mit
  `grep … <<< "$VAR"` prüfen
- **Eine Bedingung, die überall gelten muss, wird nicht als Konstante exportiert.**
  Solange `NICHT_GELOESCHT` als Zeichenkette frei herumlag, konnte jede neue Abfrage
  sie einsetzen und die Jahresfreischaltung daneben vergessen – und das fällt genau
  dort nicht auf, wo man nicht hinsieht. Der Export ist deshalb weg; es gibt nur noch
  `sichtbar(sicht)`, und das verlangt ein Argument, das nur hat, wer weiß, für wen die
  Abfrage läuft. Beim Umbau hat der Übersetzer die zwanzig Stellen selbst aufgezählt,
  statt dass jemand sie suchen musste
- **Ein Gitter aus gleichen Gradzahlen ist auf dem Bildschirm kein Quadrat.**
  Bei 54 Grad Nord deckt ein Breitengrad rund anderthalbmal so viele Bildpunkte
  ab wie ein Längengrad. Wer Kartenpunkte über `floor(lat/zelle)` und
  `floor(lon/zelle)` zusammenfasst, bekommt hochkante Zellen: senkrecht fallen
  die Gruppen stärker zusammen als waagerecht, und niemand sieht, warum.
  Gruppiert wird deshalb in Mercator-Koordinaten – denen, in denen die Karte
  gezeichnet wird
- **Eine CSS-Regel mit derselben Spezifität wie die der Bibliothek verliert.**
  Was zuletzt im gebauten Stylesheet steht, gewinnt, und das ist bei einem
  Import aus `node_modules` nicht die eigene Datei. `.leaflet-touch
  .leaflet-bar a { width: 42px }` blieb wirkungslos, die Zoomknöpfe waren
  weiterhin 30 Punkte groß und auf dem Telefon nicht zu treffen. Ein
  zusätzlicher Vorfahre reicht – aber man muss es nachmessen, im Quelltext
  sieht die Regel richtig aus
- **Zwei Rechenwege für dieselbe Menge laufen auseinander, auch wenn beide
  richtig sind.** Der Sprung von einer Kartengruppe in die Galerie könnte den
  Ausschnitt als Rechteck in Grad weitergeben – das Gitter der Karte liegt aber
  in Mercator-Koordinaten, und heraus kämen 43 Punkte gegen 44 Bilder. Das
  sieht aus wie ein Fehler und ist keiner, was das Suchen nicht kürzer macht.
  Die Zellrechnung steht deshalb in `web/src/lib/zelle.ts`, und die Kennung der
  Zelle berechnet die **Datenbank beim Gruppieren** und reicht sie durch – der
  Browser rechnet gar nichts
- **Eine systemd-Anweisung im falschen Abschnitt wird stillschweigend
  verworfen.** `StartLimitIntervalSec` gehört in `[Unit]`, nicht in
  `[Service]`; die einzige Spur ist eine Zeile „Unknown key … ignoring" im
  Journal, die niemand liest. Die Unit lädt, der Dienst startet, alles sieht
  richtig aus – nur die Wirkung fehlt. Gegengeprüft wird mit
  `systemctl --user show <einheit> -p <Anweisung>`, nicht am Dateiinhalt
- **Eine apt-Konfigurationsgruppe ergänzt die Liste, sie ersetzt sie nicht.**
  Wer `Unattended-Upgrade::Allowed-Origins { … };` in eine eigene Datei
  schreibt, hängt seine Einträge an die vorhandenen an – die Vorgabe bleibt
  drin. Erst `#clear <Name>;` davor räumt sie weg. Nachsehen lässt es sich
  ohne root und ohne Aufspielen: `apt-config dump -c <datei>`
- **`const enum` aus einer Bibliothek nie im Code verwenden.** TypeScript löscht die
  Aufzählung beim Übersetzen; zur Laufzeit ist das Objekt leer, und was ankommt, ist
  `undefined`. Mit `isolatedModules` – das Next voraussetzt – bricht `tsc` immerhin ab,
  sonst liefe es still ins Leere. Stattdessen den Zahlenwert schreiben, mit der
  Begründung daneben (so in `web/src/lib/passwort.ts` bei argon2id).

Ein Prüfwerkzeug hat genau eine richtige Aufrufart. tools/nachneustart.sh prüfte unter sudo die Benutzerangaben von root und meldete acht Fehler, die keine waren – während es ohne sudo einen Wert schuldig blieb und ausgerechnet den falschen Aufruf empfahl. Wer dreimal „8 Fehler" bei lauter Häkchen liest, sieht beim vierten Mal nicht mehr hin, und dann fällt der echte neunte durch. Werkzeuge, die erhöhte Rechte für einen Einzelwert brauchen, holen sich diesen selbst, statt insgesamt als root zu laufen.