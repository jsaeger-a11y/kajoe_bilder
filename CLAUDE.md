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
| Code | `~/kajoe_bilder/` | `~/<projekt>/` |
| Daten | `/data/kajoe_bilder/` | `/data/<projekt>/` |
| Postgres | `127.0.0.1:5432` | 5433, 5434, … |
| Web | `127.0.0.1:3000` | 3001, 3002, … |

`/data/kajoe_bilder` ist ein **eigener Einhängepunkt** auf einem eigenen Logical
Volume. Von 473 GB in `ubuntu-vg` sind 250 GB zugewiesen (243 GB nutzbar), der Rest
bleibt bewusst frei: Vergrößern geht im Betrieb, Verkleinern nicht.

Ports werden hier eingetragen, bevor sie belegt werden.

---

## Stand

| Phase | Inhalt | Status |
|---|---|---|
| 0 | Platte, Docker, Node, ffmpeg, Repo | **fertig** |
| 1 | Ingest: Katalogisierung, Herkunft, Ableitungen | offen |
| 2 | Anmeldung, Benutzerverwaltung, Galerie | offen |
| 3 | Auswahllisten, Herunterladen, Aufräumen | offen |
| 4 | Karte (GPS) | offen |
| 5 | Cloudflare Tunnel | offen |

**Bitte einzeln bauen und testen, nicht alles auf einmal.**

Vorhanden: Docker 28 + Compose 2.40, Node 22.11.0 (`~/.local/node/bin`),
ffmpeg 8.0.1 mit Quick Sync (HEVC 8 und 10 Bit lesen, H.264 schreiben),
Systemzeit UTC.

---

## Aufbau

```
~/kajoe_bilder/
├── docker-compose.yml       PostgreSQL auf 127.0.0.1:5432
├── .env                     Zugangsdaten – NIEMALS committen
├── db/migrations/           Schema, nummeriert
├── ingest/                  Phase 1: Einlesen, EXIF, Ableitungen
├── tools/                   Sicherung, Aufräumen, Status
├── systemd/                 Kopien der Dienst- und Timer-Dateien
├── web/                     Phase 2+: Next.js
└── docs/                    Anforderungen, Betrieb
```

```
/data/kajoe_bilder/
├── eingang/                 wird hineinkopiert, vom Ingest geleert
├── quarantaene/             was der Ingest nicht lesen konnte
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

### Vier Dinge, die bei der Umwandlung schiefgehen

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

### Videos

**Live Photos sind keine Videos.** Jedes Live Photo ist eine `.heic` plus eine
gleichnamige `.mov` von rund drei Sekunden. Ungeprüft landen daraus tausende
Scheinvideos in der Videokategorie. Erkennung: gleicher Ordner, gleicher Dateiname
ohne Endung, MOV kürzer als etwa fünf Sekunden → `live_photo = TRUE`, zählt nicht als
Video.

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
Fehlen ist häufig, bei ausgeschalteter Ortung schreibt das iPhone nichts.

**GPS auf privaten Fotos hinter einem öffentlich erreichbaren Tunnel heißt: die
Wohnadresse steht in den Daten.** Die Karte ist deshalb kein Selbstläufer, sondern
eine Entscheidung – im Zweifel nur für Verwalter.

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

**Benutzer werden abgeschaltet, nicht gelöscht** (`aktiv`), sonst verwaisen ihre
Listen.

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

### Sicherung

**Die Bilder sind ersetzbar, die Datenbank nicht.** Die Originale liegen weiter in
OneDrive. Einmalig ist, was hier entsteht: Benutzer, Auswahllisten, Kategorien.
Täglicher `pg_dump` ab Phase 0, nicht später.

---

## Arbeitsweise

- Schemaänderungen **nur** als neue nummerierte Datei in `db/migrations/`, bestehende
  Dateien nicht ändern
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
