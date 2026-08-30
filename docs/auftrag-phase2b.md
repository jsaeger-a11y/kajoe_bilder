# Auftrag Phase 2b – Galerie

Ziel: Die 922 Aufnahmen nach Jahr und Monat durchsehen können, mit Filtern und
Einzelansicht. Am Ende ist das Archiv zum ersten Mal benutzbar.

**Nicht Teil dieses Auftrags:** Auswahllisten, Download, Karte, Aufräumen. Das ist
Phase 3.

Grundlage ist `CLAUDE.md`. Bei Widersprüchen gilt `CLAUDE.md`; bitte melden statt still
entscheiden.

Bestand: 922 Zeilen, davon 167 Videos, 1.844 Ableitungen.

---

## 0. Nachträge aus 2a

Falls noch offen:

- `tools/status.sh` um Dienstzustand, Port und den Wert von `COOKIE_SECURE` ergänzen
- **Warnung bei der gefährlichen Kombination:** Kommt eine Anfrage mit
  `X-Forwarded-Proto: https` herein und `COOKIE_SECURE` steht auf 0, dann läuft die
  Anwendung hinter einem Tunnel ohne Secure-Cookie. Der Kasten beim Start feuert auch
  im LAN, wo es richtig ist – diese Warnung erkennt den Fall selbst. Einmal je
  Anwendungsstart genügt, nicht bei jeder Anfrage

## 1. Bilder ausliefern

Eine Route, die Vorschau und Ansicht liefert. **Nicht aus `public/`** – die Dateien
liegen unter `/data/kajoe_bilder/abgeleitet/` und dürfen nur an Angemeldete gehen.

- Anmeldung prüfen, **bei jeder Anfrage**
- Nur `vorschau` und `ansicht` ausliefern, **niemals das Original** und niemals einen
  frei wählbaren Pfad. Die Kennung kommt aus der Datenbank, nicht aus der Adresse
- `Cache-Control: private` mit brauchbarer Lebensdauer – die Dateien ändern sich nie,
  ihr Name ist der Hash
- Ein Pfad, der nicht zu einer Zeile in `bild` gehört, wird nicht ausgeliefert

## 2. Galerie

Gitter aus Vorschaubildern, gruppiert nach Jahr und Monat, neueste zuerst.

**Seitenweise, immer.** Bei 922 Zeilen fällt es nicht auf, bei 14.000 schon. Die
Seitengröße steht an einer Stelle.

Zu jedem Bild sichtbar: Datum, und bei Videos die Laufzeit sowie ein Hinweis, dass es
ein Video ist – ein Standbild sieht wie ein Foto aus.

## 3. Filter

- **Jahr und Monat** – der Hauptweg
- **Herkunft** (`iphone`, `ohne_exif`, `fremd`, `apple_sonstig`).
  **Vorgabe ist `iphone`**, und es muss sichtbar sein, dass gefiltert wird. Ein stiller
  Filter lässt jemanden glauben, mehr sei nicht da
- **Typ** (Bild / Video / alle)
- **Mit oder ohne Ort**

**Der Filterzustand steht in der Adresse**, nicht nur im Browser. Sonst lässt sich eine
Ansicht nicht wiederfinden, und der Zurück-Knopf tut nicht, was er soll.

Zu jedem Filter die **Trefferzahl** anzeigen. Wer 665 von 922 sieht, versteht die
Vorgabe; wer nur 665 sieht, hält sie für alles.

## 4. Einzelansicht

Die Ansichtsfassung, dazu Datum, Uhrzeit, Gerät, Herkunft, Maße, Dateigröße.

**Beim Datum dazuschreiben, woher es kommt.** Bei `zeitquelle != 'exif'` ist es eine
Herleitung und keine Messung – jede fünfte Datei ist betroffen. Wer im Kalender einen
Monat falsch erwischt, soll die Möglichkeit gehabt haben, es zu sehen.

Blättern zum vorigen und nächsten Bild **innerhalb der gefilterten Menge**, nicht über
den ganzen Bestand. Sonst springt man aus der Auswahl heraus, in der man gerade sucht.

Videos: abspielbar. Die Wiedergabefassung wird **beim ersten Aufruf erzeugt**
(`ableitung.wiedergabe()` aus 1b), danach ausgeliefert. Solange sie entsteht, muss die
Seite sagen, dass gerechnet wird – bei drei Minuten Video sind das rund achtzehn
Sekunden, und eine Seite, die stillsteht, sieht kaputt aus.

`wiedergabe_erzeugt` entsprechend setzen.

## 5. Übersicht

Was da ist: Anzahl je Jahr, je Herkunft, je Typ, Plattenbelegung. Zwei Sätze und eine
Tabelle genügen.

---

## Vorgaben

- **Mobil bedienbar.** Die Person, die den Kalender baut, sitzt nicht am
  Schreibtischrechner
- **Anmeldung in jeder Seite und jeder Route prüfen**, mit der Funktion aus 2a
- **`BIGINT` kommt als Zeichenkette** aus dem Treiber. In der Abfrage `id::int AS id`
  oder mit `Number()` umwandeln – sonst vergleicht man `"1908"` mit `1908` und bekommt
  immer `false`
- Keine absoluten URLs mit Hostnamen
- Vorschaubilder tragen kein EXIF – das ist in 1b so gebaut und bleibt so

---

## Prüfkriterien

- Summe über alle Monate ergibt **922**
- Filter `herkunft = alle` ergibt 922, Vorgabe `iphone` ergibt 665
- Filter `typ = video` ergibt 167
- **Abmelden, dann eine Bild-Adresse direkt aufrufen** → abgewiesen. Ebenso mit einem
  ausgedachten Pfad und mit einem Pfad, der auf das Original zeigt
- Blättern in einer gefilterten Ansicht bleibt in der Auswahl
- Ein Video abspielen: Wiedergabefassung entsteht, wird gezeigt, beim zweiten Aufruf
  sofort geliefert; `wiedergabe_erzeugt` steht danach auf `TRUE`
- Adresse mit Filtern in einem neuen Fenster öffnen → dieselbe Ansicht
- **Auf dem Telefon ansehen** und berichten, was dort nicht taugt

Nach jedem Schritt berichten, was tatsächlich geprüft wurde – nicht nur, dass der
Befehl ohne Fehler durchlief.
