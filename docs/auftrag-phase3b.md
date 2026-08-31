# Auftrag Phase 3b – Herunterladen

Ziel: Bilder einzeln und als Paket herunterladen, aus der Galerie und aus einer
Auswahlliste. Damit ist der eigentliche Zweck des Projekts erfüllt – aus einer Liste
wird ein Kalender.

**Nicht Teil dieses Auftrags:** Karte, Anstoßen der Verarbeitung über die Oberfläche.

Grundlage ist `CLAUDE.md`. Bei Widersprüchen gilt `CLAUDE.md`; bitte melden statt still
entscheiden.

Bestand: 17.524 Zeilen, davon 1.301 Videos.

---

## 1. Einzeln herunterladen

Aus der Einzelansicht, in zwei Ausführungen:

- **JPEG in voller Auflösung** – die Vorgabe. Qualität 95, 4:4:4, sRGB, **nicht
  verkleinert**, mit vollständigem EXIF. Die Funktion dafür steht seit 1b bereit
- **Original** – die Datei, wie sie hereinkam

> **Wenn das Original bereits ein JPEG ist, wird es unverändert ausgeliefert**, auch
> unter „JPEG". Ein zweites Kodieren wäre eine weitere Generation ohne jeden Gewinn.
> Das betrifft rund ein Fünftel des Bestands.

**Videos** gehen immer als Original. Die Wiedergabefassung ist zum Ansehen im Browser
gedacht, nicht zum Behalten – sie ist teils größer als das Original und schlechter.

**Der Dateiname muss für einen Menschen brauchbar sein.** Der SHA-256 sagt niemandem
etwas. Besser aus Aufnahmedatum und Uhrzeit bilden, etwa
`2023-07-15_142305.jpg`. Umlaute und Sonderzeichen vermeiden.

## 2. Als Paket herunterladen

Aus einer Auswahlliste und aus der Sammelauswahl der Galerie.

**Im Datenstrom erzeugen, nicht im Speicher bauen und nicht erst auf der Platte
zusammenstellen.** Zweihundert Vollbilder sind gut ein Gigabyte; beides würde den
Dienst bei mehreren gleichzeitigen Anfragen umwerfen.

- **Obergrenze je Paket**, an einer Stelle im Code. Der Hinweis darauf steht **vor** dem
  Auslösen, nicht danach
- Wahl zwischen JPEG und Original, wie bei der Einzeldatei
- Dateinamen im Paket nach demselben Muster. **Doppelte Namen brauchen einen Zusatz** –
  zwei Aufnahmen in derselben Sekunde kommen bei Serienbildern vor, und ein Paket mit
  zwei gleichnamigen Einträgen packt mancher Entpacker stillschweigend übereinander
- **Vorher sagen, was kommt:** Anzahl und geschätzte Größe, bevor der Download startet

> **Zwei Fallen beim Paketformat:**
> Über 4 GB braucht es **ZIP64**, sonst ist das Ergebnis stillschweigend beschädigt.
> Und Dateinamen brauchen das UTF-8-Kennzeichen, sonst zeigt Windows Kraut statt
> Umlauten.

## 3. Zugriff

- Anmeldung bei **jeder** Anfrage prüfen, auch beim Paket
- Aus einer **fremden, freigegebenen** Liste darf heruntergeladen werden – sehen und
  herunterladen gehören zusammen, geändert wird sie dadurch nicht
- Aus einer fremden, **nicht** freigegebenen Liste nicht
- Vorgemerkt gelöschte Bilder erscheinen nicht im Paket

## 4. Was die Kalenderarbeit braucht

Der eigentliche Ablauf ist: durchsehen, sammeln, herunterladen. Deshalb:

- Der Download-Knopf gehört **sichtbar an die Auswahlliste**, nicht in ein Untermenü
- In der Liste sollte stehen, wie viele Bilder darin sind und wie groß das Paket würde
- Nach dem Herunterladen bleibt die Liste bestehen – sie ist kein Warenkorb, der sich
  leert

---

## Prüfkriterien

- Einzeldownload JPEG: volle Auflösung, `Orientation = 1`, Maße gedreht, 4:4:4, sRGB,
  `DateTimeOriginal` und GPS vorhanden – **mit `exiftool` an der heruntergeladenen
  Datei nachgesehen**, nicht am Erzeugten auf dem Server
- Einzeldownload eines JPEG-Originals: Datei ist **bytegleich** mit dem Original
  (`sha256sum` vergleichen)
- Ein Hochformat herunterladen und **ansehen**: steht es richtig herum
- Video herunterladen: Original, abspielbar
- Paket über 50 Bilder: lässt sich entpacken, enthält 50 Dateien, Namen lesbar und
  eindeutig
- Paket mit zwei Aufnahmen aus derselben Sekunde: beide sind enthalten
- Paket aus einer freigegebenen fremden Liste: geht. Aus einer nicht freigegebenen:
  abgewiesen, auch über die Route direkt
- Ein vorgemerkt gelöschtes Bild in einer Liste erscheint nicht im Paket
- **Speicherverbrauch des Dienstes während eines großen Pakets messen** – er darf nicht
  mit der Paketgröße wachsen. Das ist der Test, der zeigt, ob wirklich gestreamt wird
- Ein Paket mit Umlaut im Namen unter Windows entpacken

Nach jedem Schritt berichten, was tatsächlich geprüft wurde – nicht nur, dass der
Befehl ohne Fehler durchlief.
