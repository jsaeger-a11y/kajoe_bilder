# kajoe_bilder – Anforderungen und Orientierung

> Lebende Notiz: Was das System am Ende können soll und warum.
> Das *Wie* steht in `../CLAUDE.md`.

---

## Worum es geht

Rund 110 GB private Aufnahmen aus den Jahren 2019 bis 2026 liegen in OneDrive, nach
Monat in Ordnern. Darunter sind Fotos, Videos, Screenshots und Dubletten in unbekanntem
Verhältnis. Gesucht ist eine Oberfläche, in der sich die Aufnahmen nach Jahr und Monat
durchsehen, in benannten Listen sammeln und im Original herunterladen lassen.

Der konkrete Anlass: Aus der Auswahl entsteht ein Kalender für die Familie. Die Person,
die ihn baut, sitzt nicht im Haus – der Zugriff von außen ist deshalb kein Beiwerk,
sondern der eigentliche Zweck der Weboberfläche.

**OneDrive bleibt die Sicherung der Bilder.** Die Originale werden kopiert, nicht
verschoben. Was auf `webspace` liegt, ist eine Arbeitskopie; sie darf verlorengehen.
Was es nur einmal gibt, ist die Datenbank.

---

## Abgrenzung

Das System läuft auf **`webspace`** und hat mit dem Wildkameraprojekt auf `hunter`
nichts zu tun. Keine gemeinsame Datenbank, kein gemeinsamer Code, kein SSH zwischen den
Maschinen. Gemeinsam ist nur die Domain `ka-joe.com` beim selben Anbieter.

Auf `webspace` sollen später weitere Seiten entstehen. Deshalb von Anfang an je Projekt
getrennt: eigenes Verzeichnis, eigener Datenbankcontainer, eigener Port, eigener Tunnel.

---

## A. Infrastruktur – erledigt

- **Speicher:** eigene 1-TB-SSD (`/dev/sda1`, 931,5 GB, ext4, Label `daten`),
  eingehängt über UUID unter **`/data`** – nicht unter `/data/kajoe_bilder`.
  Reservierte Blöcke auf 1 % gesenkt (gemessen 1,02 %), 916 GB nutzbar. Die
  Projekte liegen als gewöhnliche Unterverzeichnisse darin; **kein LVM auf
  dieser Platte**, weil ein Volume je Projekt nur eine Größenbeschränkung wäre,
  die man später nachjustieren müsste. Der Preis: ein Projekt kann die Platte
  für alle vollaufen lassen – bei 916 GB überschaubar, und die Werkzeuge zeigen
  den Platz. Das alte 250-GB-Volume in `ubuntu-vg` existiert noch, in der
  `fstab` auskommentiert, als Rückfalltür. Die Systemplatte (476,9 GB NVMe)
  trägt weiterhin `/` mit 100 GB in `ubuntu-vg`.
- **Docker** 28 mit Compose 2.40, läuft ohne `sudo`
- **Node** 22.11.0 unter `~/.local/node/bin`
- **ffmpeg** 8.0.1 mit Quick Sync über die UHD 630: HEVC lesen (8 und 10 Bit),
  H.264 schreiben
- **Systemzeit** UTC, NTP aktiv

Offen: Postgres-Container, `pg_dump`-Timer, Git-Anbindung, Cloudflare Tunnel (Phase 5).

---

## B. Einlesen

### B1 – Was hereinkommt

Kopiert wird der OneDrive-Bestand nach `/data/kajoe_bilder/eingang/`. **Kopieren, nicht
verschieben** – in OneDrive bleibt alles.

Der Weg dorthin geht über einen lokal synchronisierten Windows-Rechner und WinSCP
(SFTP, Übertragungsmodus Binär, Zeitstempel beibehalten). Ohne vorherige
Synchronisierung sind es Platzhalter von wenigen Kilobyte, die Windows beim Kopieren
einzeln nachlädt – doppelt so viele Übertragungen und deutlich fehleranfälliger.

**Vor dem Einlesen wird abgezählt**, auf beiden Seiten. Ein Ingest über einen
unvollständigen Bestand merkt nichts davon.

### B2 – Vorher messen, nicht schätzen

Bevor irgendetwas gebaut wird, läuft `exiftool` einmal lesend über den Bestand und
beantwortet: Wie viele Dateien, wie verteilen sie sich auf Hersteller und Dateitypen,
wie hoch ist der Videoanteil, wie viele Aufnahmen haben GPS, welcher Videocodec liegt
vor. Fünf Minuten Arbeit, und alle Annahmen in diesem Dokument werden zu Zahlen.

### B3 – Herkunft statt Objekterkennung

Der ursprüngliche Entwurf sah einen Detektor für Personen und Tiere vor, um Screenshots
und Belangloses auszusortieren. **Er ist gestrichen.** Er hätte jedes Landschaftsbild
weggeworfen – also gerade die Kalendermotive. Und ein deterministisches Merkmal ist
einem Modell überlegen, wenn es verfügbar ist: `Make = Apple` ist wahr oder falsch,
kostet Millisekunden und irrt sich nie.

Fünf Kategorien: `iphone`, `apple_sonstig`, `fremd`, `screenshot`, `ohne_exif`.
`screenshot` kam später dazu und löst Bildschirmfotos aus dem Sammelbecken
`ohne_exif` heraus – erkannt an der Kombination aus Bildschirmauflösung,
fehlendem `Make` und `typ = bild`, ohne KI.

**Nichts wird beim Einlesen verworfen.** Die Galerie zeigt standardmäßig `iphone`, der
Rest ist über einen Filter erreichbar und kann jederzeit für den Download freigegeben
werden. Unter `fremd` können Fotos liegen, die andere von der Familie gemacht und
geschickt haben. Ein Ingest, der wegwirft, trifft eine Entscheidung, die niemand
zurücknehmen kann – und man weiß hinterher nicht einmal, was gefehlt hat.

Damit entfielen der gesamte KI-Teil, die Modellgewichte und ein Erstdurchlauf über
Stunden – bis Phase 9a. Dort kommt ein Modell zurück, aber mit einer anderen
Aufgabe: nicht aussortieren, sondern **vorschlagen**. Siehe B7.

### B7 – Gesichter: Vorschlag der Maschine, Entscheidung des Menschen

Die Regel „keine KI" ist mit Phase 9a **eingegrenzt**, nicht aufgehoben. Was ein
Modell weiterhin nicht darf: entscheiden, was verworfen oder wie sortiert wird.
Was es darf: Gesichter finden und ähnliche zu Häufchen zusammenlegen, damit ein
Mensch sie mit einem Blick benennt statt tausend Bilder einzeln durchzusehen.

**Zwei Spalten, die nie ineinander überschrieben werden.** `gesicht.gruppe_id`
ist der Vorschlag des Modells; ein neuer Lauf darf ihn ändern. `gesicht.person_id`
ist die Zuordnung eines Menschen; ein Lauf schreibt dort **nie**. Wer das eine mit
dem anderen überschreibt, kann später nicht mehr sagen, wie verlässlich die
Zuordnungen sind – und genau das ist die Frage, sobald ein Häufchen zwei
Personen enthält.

**Lokal, ohne Netz.** InsightFace `buffalo_l` (RetinaFace und ArcFace) über
`onnxruntime` auf dem Prozessor. Kein Bild verlässt den Server; das ist bei
Gesichtern von Kindern keine Nebensache. Die Gewichte sind für Forschung und
nicht-kommerzielle Nutzung freigegeben; ein privates Familienarchiv ist damit
gedeckt, ein Verkauf des Systems wäre es nicht.

**Nicht jeder Fund taugt zum Gruppieren.** Winzige, unscharfe oder stark
gedrehte Gesichter liefern Vektoren, die zu allem ein bisschen ähnlich sind –
sie zögen über eine Kette zwei Personen zusammen. Sie werden gefunden und
gespeichert, aber nur den bestehenden Häufchen **streng** zugeordnet und bilden
nie selbst eines. Die Schwellen stehen an einer Stelle im Code und wurden am
Piloten eingestellt.

**Ein Häufchen braucht gegenseitige Stützen.** Zwei Funde, die sich ähnlich sind,
reichen nicht; ein Fund muss mehrere Nachbarn haben, um ein Häufchen zu tragen.
Das ist die Idee von DBSCAN, ausgeschrieben, damit die Schwellen sichtbar sind.
**Keine vollständige Abstandsmatrix, kein pgvector:** gerechnet wird in Blöcken,
der Speicher wächst linear mit der Fundzahl. Eine Datenbankerweiterung wäre
dasselbe Übermaß wie PostGIS für die Karte.

**Wiederholbar.** Ein Bild gilt als angesehen, sobald `bild.gesichter_am` steht –
auch wenn kein Gesicht darauf war. Ein zweiter Lauf nimmt nur neue Bilder, legt
neue Funde an bestehende Häufchen an und lässt die bestehende Zugehörigkeit in
Ruhe. Ein Neugruppieren aller Funde ist ein eigener, ausdrücklicher Schalter.

**9a hat keine Oberfläche.** Ob die Häufchen taugen, sieht man auf Kontaktbögen
unter `/data/kajoe_bilder/probe/gruppen/`. Benennen und Suchen kommen in 9b –
erst, wenn die Bögen überzeugen.

### B8 – Personen: ansehen ist ein Recht, benennen ist es nicht

Phase 9b gibt den Häufchen Namen. Zwei Stufen, mit Absicht getrennt:
`gesichter` ist ein **Recht** wie `karte` (Vorgabe aus) und erlaubt, Personen zu
sehen und nach ihnen zu suchen. **Benennen darf nur ein Verwalter** – dafür gibt
es kein eigenes Recht, weil ein Recht sich einzeln verteilen ließe. Wer Namen
vergibt, legt fest, wer im Archiv namentlich auffindbar ist.

**Eine Stelle sagt, wer auf einem Bild ist:** `gesicht.person_id`. Es gibt keine
Spalte `gruppe.person_id`; wem ein Häufchen gehört, ergibt sich aus seinen Funden.
Das hält die Wahrheit an einem Ort und erlaubt zugleich, die Häufchen der Maschine
jederzeit neu zu bilden, ohne eine menschliche Zuordnung zu verlieren.

**Drei Wege aus einem offenen Häufchen:** einer bestehenden Person zuordnen (das
ist zugleich das Zusammenführen – zwei Häufchen, eine Person), eine neue Person
anlegen (freier Text, keine Prüfung auf „echte" Namen: das drittgrößte Häufchen
des Piloten ist der Hund), oder als unwichtig ablegen. **Ablegen ist eine
Entscheidung, kein Löschen:** das Häufchen bleibt vollständig, nimmt weiter neue
Gesichter auf und stellt keine Frage mehr.

**Ein einzelnes fremdes Gesicht lässt sich herausnehmen**, mit einem eigenen
Vermerk am Fund – nicht durch Zurücksetzen der Gruppenkennung. Sonst legte der
nächste Lauf dasselbe Gesicht wieder dazu, und dieselbe Korrektur wäre nach jedem
Lauf erneut fällig.

### B4 – Originale und Ableitungen

**Eine verlustfreie Umwandlung von HEIC gibt es nicht.** HEIC ist HEVC-basiert und
selbst verlustbehaftet; jedes JPEG daraus ist zweite Generation. Ein wirklich
verlustfreies Ziel wäre das Zehnfache an Platz und passt nicht auf die Platte.

- Original bleibt liegen und wird nie angefasst
- Vorschau (~300 px) und Ansicht (~1600 px) als JPEG
- Vollauflösendes JPEG **erst beim Herunterladen**, Qualität 95, nicht verkleinert

Für den Kalender ist JPEG ohnehin das richtige Format – kein Druckdienstleister nimmt
HEIC an.

### B5 – Aufnahmezeitpunkt

Rangfolge: EXIF `DateTimeOriginal` → Muster im Dateinamen → Ordnername → Dateizeit.
Die Dateizeit steht ganz unten, weil sie nach einem OneDrive-Abgleich meist das
Kopierdatum ist. Welche Quelle gegriffen hat, wird mitgeschrieben.

**Maßgeblich ist die Ortszeit der Aufnahme, nicht UTC.** Anders als bei einer fest
stehenden Wildkamera reisen Fotos mit. Ein Bild von Silvester 00:30 Berliner Zeit wäre
als 23:30 UTC im falschen Jahr, ein Urlaubsbild aus Thailand von 10:00 Uhr läge unter
„nachts".

### B6 – Dubletten und wiederkehrendes Einlesen

Es kommen weitere Bestände dazu, unter anderem aus einem zweiten OneDrive-Konto.
Deshalb wird ausschließlich über den SHA-256 des Inhalts verglichen, nie über den
Dateinamen: iPhones zählen `IMG_0001` bis `IMG_9999` und fangen wieder von vorn an.

Der Ingest räumt hinter sich auf, verschiebt Unlesbares nach `quarantaene/` und
protokolliert jeden Lauf. Woher ein Bild kam, wird mitgeschrieben.

---

## C. Videos

Videos werden nach Jahr und Monat einsortiert wie Bilder, aber als eigene Kategorie,
und sollen **im Browser abspielbar** sein.

**Live Photos sind keine Videos** – jede besteht aus einer HEIC plus einer
gleichnamigen MOV von rund drei Sekunden. Ungeprüft stünden tausende Scheinvideos in
der Videokategorie.

iPhones nehmen in HEVC auf, das Chrome und Firefox nicht abspielen. Die
Wiedergabefassung in H.264/1080p entsteht **erst beim ersten Abspielen** und wird
zwischengespeichert – H.264 ist bei gleicher Qualität rund doppelt so groß wie HEVC,
und die meisten Videos sieht ohnehin nie jemand an. Über die Hardwarebeschleunigung
der UHD 630 ist das eine Sache von Sekunden.

---

## D. Weboberfläche

### D1 – Anmeldung

Benutzername und Passwort, keine offene Registrierung. Zwei Rollen: **Verwalter**
(legt Benutzer an, darf Stapel löschen) und **Betrachter** (sieht, sammelt, lädt
herunter).

**Dazu die Jahresfreischaltung je Konto** (Phase 6). Der frühere Satz an dieser Stelle –
feiner werde es nicht, es gebe keinen Jahrgang, den nicht jeder sehen dürfe – galt für
den Haushalt und nicht für Gäste. Für den Kalender bekommt jemand von außen Zugriff auf
genau den Jahrgang, aus dem der Kalender entsteht, und auf keinen anderen. `NULL` ist
die Vorgabe und heißt: alle Jahre, auch künftige. Ein Verwalter ist nie eingeschränkt.
Rolle, Rechte und Jahrgänge sind drei getrennte Achsen.

Auf der Anmeldeseite steht nicht, worum es geht. Hinter dem Tunnel ist sie öffentlich
erreichbar.

### D2 – Galerie

Miniaturansicht nach Jahr und Monat, Filter auf Herkunft und Typ, seitenweise.

### D3 – Auswahllisten

Benannte Listen je Benutzer, privat, mit Freigabeschalter für gemeinsames Ansehen. So
lässt sich die Arbeit unterbrechen und fortsetzen, und mehrere Kalenderjahrgänge
stehen nebeneinander. Markierungen werden sofort gespeichert, nicht erst auf Knopfdruck.

Herunterladen wahlweise als Original oder als JPEG in voller Auflösung, einzeln oder
als ZIP im Datenstrom mit Obergrenze je Paket.

### D4 – Karte

Aufnahmen mit GPS lassen sich auf einer Karte einsortieren. **Das ist eine bewusste
Entscheidung, keine Nebenwirkung:** GPS auf privaten Fotos hinter einem öffentlich
erreichbaren Tunnel heißt, dass die Wohnadresse in den Daten steht. Im Zweifel nur für
Verwalter.

Entschieden in Phase 5: die Karte hängt an einem eigenen Recht `karte`. Verwalter
haben es ohnehin, ein Betrachter bekommt es einzeln oder gar nicht. Damit bleibt
„im Zweifel nein" die Vorgabe, ohne dass eine andere Entscheidung eine
Codeänderung braucht.

### D5 – Aufräumen

Kategorien, die sich als uninteressant erweisen, lassen sich stapelweise löschen –
zweistufig, mit 30 Tagen Frist. Bilder in einer Auswahlliste bleiben verschont.

---

## Phasen

| Phase | Inhalt | Status |
|---|---|---|
| 0 | Platte, Docker, Node, ffmpeg, Repo | fertig |
| 1a/1b | Ingest: Katalogisierung, Herkunft, Ableitungen | fertig |
| 2a/2b | Anmeldung, Benutzerverwaltung, Galerie | fertig |
| 3a/3b | Auswahllisten, Herunterladen, Aufräumen | fertig |
| 4 | Verarbeitung aus der Oberfläche anstoßen | fertig |
| 5 | Karte | fertig |
| 6 | Jahresfreischaltung je Benutzer | fertig |
| 7 | Aufräumen und Systempflege automatisieren | fertig (Neustart steht aus) |
| 8 | Mehrjahresfilter, von der Karte in die Galerie | fertig |
| – | Nachträge: Plattenumzug, Bildschirmfotos als Herkunft | fertig |
| 9a | Gesichter finden und gruppieren, ohne Oberfläche | fertig |
| 9b | Benennen und Suchen nach Personen | fertig |
| 10 | Cloudflare Tunnel | offen |

---

## Offene Punkte

- Umfang des Bestands: Anzahl, Herstellerverteilung, Videoanteil, GPS-Quote –
  wird gemessen, sobald 2025 und 2026 auf dem Server liegen
- Ob unter `fremd` genug Brauchbares liegt, um es dauerhaft mitzuführen
- Ob die alten Jahrgänge ab 2019 andere EXIF-Felder liefern als 2025/2026
- Zweites OneDrive-Konto: wann und in welchem Umfang
