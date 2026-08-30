# Auftrag Phase 1b – Ableitungen

Ziel: Zu jeder Zeile in `bild` ein Vorschau- und ein Ansichtsbild erzeugen, dazu die
Werkzeuge für den späteren Download und die Video-Wiedergabe. Am Ende hat jede Datei
ihre Ableitungen und `vorschau_erzeugt` steht auf `TRUE`.

**Nicht Teil dieses Auftrags:** Weboberfläche, Anmeldung, Galerie. Die
Video-Wiedergabefassungen werden **nicht** im Stapel erzeugt (siehe Punkt 5).

Grundlage ist `CLAUDE.md`, Abschnitte „Das Original wird nach dem Einlesen nie wieder
angefasst", „Vier Dinge, die bei der Umwandlung schiefgehen" und „Videos".
Bei Widersprüchen gilt `CLAUDE.md`; bitte melden statt still entscheiden.

Bestand: 922 Zeilen, davon 167 Videos.

---

## 1. Werkzeug wählen und messen

HEIC dekodieren können mehrere Wege: `libvips` (über `pyvips`), ImageMagick mit
HEIF-Unterstützung, oder `pillow-heif`. **Vor der Entscheidung an 50 Dateien messen** –
Zeit je Bild und Spitzenspeicher. `libvips` ist erfahrungsgemäß deutlich schneller und
sparsamer, aber gemessen ist besser als erwartet.

Das Ergebnis der Messung gehört in den Bericht und in `ingest/LIESMICH.md`.

## 2. Zwei Ableitungen je Bild

```
abgeleitet/<jahr>/<monat>/<sha256>-vorschau.jpg    längste Kante ~300 px
abgeleitet/<jahr>/<monat>/<sha256>-ansicht.jpg     längste Kante ~1600 px
```

Seitenverhältnis erhalten, nicht beschneiden.

**Vorschaubilder bekommen keine Metadaten.** Kein EXIF, kein GPS, kein Gerätename.
Sie werden in der Galerie massenhaft ausgeliefert; die Koordinate der eigenen Wohnung
hat dort nichts verloren. Das spart nebenbei Platz.

## 3. Die vier Fallstricke

**Farbprofil.** Das iPhone nimmt in Display P3 auf. Sauber nach **sRGB umrechnen**,
nicht das Profil einfach fallenlassen – sonst werden rote Blumen und Sonnenuntergänge
sichtbar flau. Prüfen lässt sich das nur mit dem Auge: ein kräftig rotes Motiv als
Vorschau und im Original nebeneinander.

**Ausrichtung.** `Orientation` anwenden. **Und danach das Feld auf 1 setzen oder
entfernen** – wer das Bild dreht und den Wert stehenlässt, bekommt eine zweite Drehung
im Betrachter. Das ist der häufigste Fehler an dieser Stelle und fällt nur bei
Hochformaten auf.

**Farbunterabtastung.** Für die **Ansicht** und den späteren Download **4:4:4**, sonst
franst Rot an Kanten aus. Für die Vorschau reicht 4:2:0 – bei 300 px sieht es niemand.

**Qualität.** Vorschau ~80, Ansicht ~88, Download 95. Nicht höher: über 95 wächst die
Datei stark, ohne dass etwas sichtbar besser wird.

## 4. Download-Werkzeug

Eine Funktion, die aus dem Original ein vollauflösendes JPEG erzeugt: Qualität 95,
4:4:4, sRGB, **nicht verkleinert**, und mit **vollständigem EXIF** – Aufnahmezeit und
GPS gehören in die Datei, die jemand herunterlädt.

In 1b wird sie gebaut und an fünf Dateien geprüft, aber **nicht im Stapel ausgeführt**.
Aufgerufen wird sie später aus der Weboberfläche.

## 5. Videos

**Vorschaubild:** Einzelbild bei etwa 10 % der Laufzeit, nicht bei Sekunde null – der
Anfang ist oft schwarz oder verwackelt. Dann wie ein Bild behandeln (Vorschau und
Ansicht).

**Wiedergabefassung:** Werkzeug bauen und prüfen, aber **nicht im Stapel laufen
lassen**. H.264, 1080p, über VAAPI (`/dev/dri/renderD128`), mit
**`-movflags +faststart`** – ohne den Schalter lädt der Browser erst die ganze Datei,
bevor das erste Bild erscheint.

**HDR braucht Tone Mapping.** Aufnahmen in Dolby Vision sehen ohne Farbraumumsetzung
ausgewaschen und grau aus. An einer HDR-Aufnahme prüfen und das Ergebnis ansehen, nicht
nur den Rückgabewert.

**Messen und berichten:** Dauer der Umwandlung je Minute Video, mit und ohne VAAPI, an
derselben Datei. Daraus ergibt sich, ob die Erzeugung bei Bedarf tragfähig ist oder ob
doch vorab gerechnet werden muss.

## 6. Lauf

`ingest/ableiten.py`, von Hand aufrufbar, mit Fortschritt.

- **Wiederaufsetzbar** über `bild.vorschau_erzeugt`, nicht über eine
  Fortschrittstabelle
- **Mehrfach ausführbar** ohne Schaden
- Fehler je Datei protokollieren und **weitermachen**, nicht abbrechen – eine kaputte
  Datei darf 921 andere nicht aufhalten
- Am Ende zählen: erzeugt, übersprungen, fehlgeschlagen

---

## Prüfkriterien

```sql
SELECT count(*) FROM bild WHERE vorschau_erzeugt;
SELECT count(*) FROM bild WHERE NOT vorschau_erzeugt;
```

- Anzahl Dateien in `abgeleitet/` ist **genau doppelt** so groß wie die Zahl der
  Zeilen mit `vorschau_erzeugt` – je Bild eine Vorschau und eine Ansicht
- Zweiter Lauf: 0 erzeugt, alles übersprungen
- Platzbedarf von `abgeleitet/` messen und gegen die Hochrechnung halten
  (~350 kB je Bild erwartet)

**Mit dem Auge zu prüfen und zu berichten** – dafür je eine Datei nach
`/data/kajoe_bilder/probe/` legen:

- ein Hochformat: steht es richtig herum, ohne doppelte Drehung
- ein kräftig farbiges Motiv: Vorschau gegen Original, keine flauen Farben
- ein Video: sitzt das Vorschaubild im Motiv und nicht auf Schwarz
- eine HDR-Aufnahme: sieht die H.264-Fassung nach etwas aus

Nach jedem Schritt berichten, was tatsächlich geprüft wurde – nicht nur, dass der
Befehl ohne Fehler durchlief.
