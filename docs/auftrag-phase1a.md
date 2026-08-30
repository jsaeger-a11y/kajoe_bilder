# Auftrag Phase 1a – Einlesen und Katalogisieren

Ziel: Dateien aus `/data/kajoe_bilder/eingang/` auswerten, nach
`original/<jahr>/<monat>/<sha256>.<endung>` einsortieren und in der Tabelle `bild`
erfassen. Am Ende steht ein Bestand, der sich per SQL nachzählen lässt.

**Nicht Teil dieses Auftrags:** Vorschaubilder, JPEG-Ableitungen,
Video-Wiedergabefassungen (das ist 1b), Weboberfläche, Anmeldung.

Grundlage ist `CLAUDE.md`. Was dort unter „Entscheidungen, die nicht verhandelbar
sind" steht, gilt hier – besonders die Abschnitte zu Herkunft, Zeit, GPS und
wiederkehrendem Einlesen. Bei Widersprüchen zwischen diesem Auftrag und `CLAUDE.md`
gilt `CLAUDE.md`; bitte den Widerspruch melden statt still zu entscheiden.

Testbestand: 925 Dateien aus 2026, bereits in `eingang/`.

---

## 1. Grundgerüst

`ingest/` mit eigener `.venv` (nicht die des Projekts teilen, falls später eine
zweite dazukommt). Abhängigkeiten: `psycopg`, und für EXIF entweder `pyexiftool`
oder `exiftool` als Unterprozess im Stapelbetrieb.

**exiftool je Datei einzeln aufzurufen ist zu langsam** – der Programmstart kostet
mehr als das Auslesen. Entweder `exiftool -stay_open` oder ein Aufruf über viele
Dateien auf einmal.

## 2. Durchlauf

Rekursiv über `eingang/`. Je Datei in dieser Reihenfolge:

1. **Dateityp** aus dem Inhalt bestimmen, nicht aus der Endung. `.jpg` mit
   HEIC-Inhalt kommt vor.
2. **Wildkamera?** `Make` beginnt mit `ZEISS` oder `VenTrade` → überspringen,
   zählen, Datei aus `eingang/` entfernen. Kein Datenbankeintrag.
3. **SHA-256** über den Inhalt. Existiert er schon in `bild` → Dublette, zählen,
   Datei aus `eingang/` entfernen. **Niemals über den Dateinamen vergleichen.**
4. **Metadaten** auslesen: Make, Model, DateTimeOriginal, OffsetTimeOriginal,
   GPSLatitude/Longitude, Duration, Videocodec, Bildmaße, Orientation, Dateigröße.
5. **Herkunft** bestimmen (`iphone`, `apple_sonstig`, `fremd`, `ohne_exif`).
   Die Einteilung steht bereits in `tools/bestand.py` – dieselbe Logik verwenden,
   nicht neu erfinden.
6. **Zeit** nach Rangfolge: EXIF → Dateinamenmuster → Ordnername → Dateizeit.
   `zeitquelle` entsprechend setzen. `aufnahme_lokal` ist maßgeblich,
   `aufnahme_utc` nur bei vorhandenem Zeitversatz. `jahr` und `monat` aus
   `aufnahme_lokal`.
   **Das betrifft jede fünfte Datei** – 22 % haben kein `DateTimeOriginal`.
7. **GPS** in Dezimalgrad umrechnen, `S`/`W` negativ. Plausibilität prüfen
   (siehe `CLAUDE.md`), `gps_status` setzen.
8. **Ablegen und eintragen** – Reihenfolge siehe unten.

## 3. Ablegen und eintragen: die Reihenfolge ist wichtig

Naheliegend wäre: Datei verschieben, dann Datenbankzeile schreiben. Das ist falsch.
Bricht der Lauf zwischen beidem ab, liegt die Datei am Ziel und ist in keiner Tabelle
verzeichnet – der nächste Lauf findet sie in `eingang/` nicht mehr und merkt nichts.

Stattdessen:

1. **Hardlink** von `eingang/…` nach `original/<jahr>/<monat>/<sha256>.<endung>`.
   Beide liegen auf demselben Dateisystem, das kostet keinen Platz und keine Zeit.
2. Datenbankzeile schreiben und **committen**.
3. Erst danach die Datei aus `eingang/` entfernen.

Bricht es dazwischen ab, bleibt die Datei in `eingang/` und der nächste Lauf macht
weiter. Ein Hardlink, der schon existiert, ist unschädlich: gleicher Hash heißt
gleicher Inhalt.

## 4. Quarantäne

Was sich nicht auswerten lässt – kaputte Metadaten, unbekanntes Format, abgebrochene
Übertragung – wandert nach `quarantaene/` und bekommt eine Zeile in der gleichnamigen
Tabelle, mit Grund. **Nicht überspringen und nicht stillschweigend zählen.**

## 5. Laufbericht

Jeder Lauf schreibt eine Zeile in `ingest_lauf`: gefunden, übernommen, Dubletten,
Quarantäne, dazu übersprungene Wildkamerabilder.

Zusätzlich mitzählen: **MOV-Dateien, zu denen eine gleichnamige Bilddatei existiert.**
In 2026 waren das null, also gibt es dort keine Live Photos. Falls die alten Jahrgänge
anders aussehen, soll das auffallen statt vermutet zu werden.

## 6. Anstoßen

`ingest/lauf.py` (oder `tools/einlesen.sh`) von Hand aufrufbar, mit Fortschrittsanzeige.
**Noch kein systemd-Timer** – der kommt, wenn der Lauf über mehrere Jahrgänge erprobt ist.

---

## Vorgaben

- **`autocommit=True`** bei allen schreibenden Verbindungen. Ohne ihn öffnet schon die
  erste `SELECT`-Abfrage eine Transaktion; ein späteres `with db.transaction()` legt
  dann nur einen Savepoint an, committet wird nie, und beim Prozessende ist alles
  zurückgerollt – ohne eine einzige Fehlermeldung.
- **Geschriebene Zeilen mitzählen** und nach dem ersten Schreibvorgang über eine
  **zweite Verbindung** nachprüfen: die eigene Sitzung sieht auch das, was nur in ihrer
  offenen Transaktion steht.
- **Mehrfach ausführbar**, ohne Schaden anzurichten. Ein zweiter Lauf über denselben
  Bestand darf nichts doppelt anlegen und nichts kaputtmachen.
- **Nicht alles in den Speicher laden.** Datei für Datei, Fortschritt alle 100 Stück.
- **Das Original wird nie verändert** – nicht gedreht, nicht umbenannt, nicht neu
  komprimiert.

---

## Prüfkriterien

Nach dem Lauf müssen diese Fragen mit Zahlen beantwortbar sein:

```sql
SELECT count(*) FROM bild;
SELECT herkunft, count(*) FROM bild GROUP BY herkunft ORDER BY 2 DESC;
SELECT zeitquelle, count(*) FROM bild GROUP BY zeitquelle ORDER BY 2 DESC;
SELECT gps_status, count(*) FROM bild GROUP BY gps_status;
SELECT jahr, monat, count(*) FROM bild GROUP BY 1,2 ORDER BY 1,2;
SELECT * FROM ingest_lauf ORDER BY id DESC LIMIT 1;
```

Erwartet:
- `count(*)` plus Dubletten plus Quarantäne **ergibt genau 925**
- keine Zeile mit `herkunft = 'fremd'` und Secacam als Gerät
- `jahr` durchgehend 2026, `monat` zwischen 1 und 8
- jede Datei in `original/` hat genau eine Zeile in `bild` und umgekehrt

Zusätzlich zu prüfen und zu berichten:
- `eingang/` ist leer (bis auf Quarantänefälle)
- ein **zweiter Lauf** meldet 0 übernommen, 0 Dubletten – er findet nichts mehr vor
- **Gegenprobe an drei Dateien von Hand:** Aufnahmezeit, Ort und Herkunft in der
  Datenbank gegen das halten, was `exiftool` an der Originaldatei sagt

Nach jedem Schritt berichten, was tatsächlich geprüft wurde – nicht nur, dass der
Befehl ohne Fehler durchlief.
