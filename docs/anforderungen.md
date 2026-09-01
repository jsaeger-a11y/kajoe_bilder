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

- **Speicher:** 250 GB als eigenes Logical Volume, eingehängt unter
  `/data/kajoe_bilder` über UUID, ext4, reservierte Blöcke auf 1 % gesenkt.
  243 GB nutzbar. Rund 124 GB bleiben in der Volume Group unzugewiesen – Vergrößern
  geht im Betrieb, Verkleinern nicht.
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

Vier Kategorien: `iphone`, `apple_sonstig`, `fremd`, `ohne_exif`.

**Nichts wird beim Einlesen verworfen.** Die Galerie zeigt standardmäßig `iphone`, der
Rest ist über einen Filter erreichbar und kann jederzeit für den Download freigegeben
werden. Unter `fremd` können Fotos liegen, die andere von der Familie gemacht und
geschickt haben. Ein Ingest, der wegwirft, trifft eine Entscheidung, die niemand
zurücknehmen kann – und man weiß hinterher nicht einmal, was gefehlt hat.

Damit entfallen der gesamte KI-Teil, die Modellgewichte und ein Erstdurchlauf über
Stunden.

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
| 7 | Aufräumen und Systempflege automatisieren | fertig (bis auf root) |
| 8 | Cloudflare Tunnel | offen |

---

## Offene Punkte

- Umfang des Bestands: Anzahl, Herstellerverteilung, Videoanteil, GPS-Quote –
  wird gemessen, sobald 2025 und 2026 auf dem Server liegen
- Ob unter `fremd` genug Brauchbares liegt, um es dauerhaft mitzuführen
- Ob die alten Jahrgänge ab 2019 andere EXIF-Felder liefern als 2025/2026
- Zweites OneDrive-Konto: wann und in welchem Umfang
