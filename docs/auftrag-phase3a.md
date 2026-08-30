# Auftrag Phase 3a – Markieren, Auswahllisten, Löschen

Ziel: Bilder einzeln und in Masse markieren, in benannten Listen sammeln und
zweistufig löschen. Am Ende lässt sich der Bestand aussortieren, ohne dass ein
Versehen etwas kostet.

**Nicht Teil dieses Auftrags:** Herunterladen einzeln oder als Paket (das ist 3b),
Karte.

Grundlage ist `CLAUDE.md`, Abschnitte „Auswahllisten", „Löschen ist zweistufig" und
„Zugriff". Bei Widersprüchen gilt `CLAUDE.md`; bitte melden statt still entscheiden.

---

## 1. Migration 004 – Rechte je Benutzer

`benutzer.rechte` als Textliste. Ein Verwalter darf ohnehin alles; einem Betrachter
kann er einzelne Rechte geben. Die Kennungen stehen an **einer** Stelle im Code.

Zunächst nur `loeschen`. Als Liste und nicht als einzelnes Ja/Nein, weil bereits ein
zweiter Fall bekannt ist: ob die Karte allen sichtbar sein soll, ist in `CLAUDE.md`
offen.

**Die Prüfung steht in jeder Seite, jeder Server Action und jeder Route**, nicht nur im
Menü – dieselbe Regel wie bei der Rolle. Ein ausgeblendeter Knopf ist keine Prüfung.

## 2. Markieren

Einzeln in der Galerie und in der Einzelansicht. Dazu eine Sammelauswahl über die
**gerade gefilterte Menge**.

**Die Sammelauswahl gibt es nur mit gesetztem Filter.** Ohne Einschränkung träfe sie
den ganzen Bestand. Ist kein Filter gesetzt, erscheint nicht etwa ein Schalter, der
nichts tut, sondern der Satz, was noch fehlt.

**Markiert wird über die Adresse, nicht im Browser.** Die Kennungen der Bilder, die
gerade nicht auf dem Schirm stehen, kennt ohnehin nur der Server.

> **Falle, die man einmal baut und lange sucht:** Der naheliegende Weg, die sichtbaren
> Kacheln über ihr angehaktes Kästchen beizusteuern, trägt nicht. React setzt beim
> Aktualisieren nur das Attribut `defaultChecked`, die tatsächliche Ankreuzung des
> Feldes – und nur die wird abgeschickt – allein beim ersten Aufbau. Nach einem vollen
> Seitenaufbau stimmt es, nach einem Klick auf einen Verweis nicht mehr. Deshalb
> während einer Sammelauswahl an der Kachel einen **Verweis** statt eines Kästchens.

**Wieviel gemeint war, reist als eigenes Feld mit.** Kommt drüben weniger an, sagt es
die Anwendung, statt stillschweigend weniger zu verarbeiten – bei fünfhundert Kennungen
zählt das niemand nach.

**Obergrenze je Vorgang**, mit Hinweis **beim Markieren** und nicht erst beim
Abschicken: Wer zweihundert Bilder auswählt und danach abgewiesen wird, hat die Arbeit
umsonst gemacht.

## 3. Auswahllisten

Benannt, privat, mit Freigabeschalter. Tabellen `auswahl` und `auswahl_bild` stehen
bereits im Schema.

- Anlegen, umbenennen, löschen
- Bilder hinzufügen und entfernen, einzeln und aus der Sammelauswahl
- `freigegeben` heißt **sehen, nicht ändern**
- Gefiltert wird in der **Abfrage**, nicht in der Anzeige. Die Kennung kommt aus der
  Sitzung, nie aus der Adresse – auch ein Verwalter sieht fremde Listen nicht, außer
  sie sind freigegeben
- **Jede Aktion prüft den Besitzer noch einmal.** Dass die Seite davor nur eigene
  Listen zeigt, ist keine Prüfung
- **Kein Knopf heißt wie etwas, das er nicht tut:** „Umbenennen" öffnet das Feld,
  umbenannt wird mit „Neuen Namen speichern"; „Löschen" öffnet die Rückfrage – mit dem
  Namen darin und dem Hinweis, dass die Bilder selbst bleiben
- Markierungen werden **sofort** gespeichert, nicht erst auf Knopfdruck. Einer, den
  jemand vergisst, wäre eine verlorene Sitzung

Grenzen (im Code, nicht als Datenbankregel): 500 Bilder je Liste, 50 Listen je Benutzer.

## 4. Löschen – zweistufig

Nur mit Rolle `verwalter` oder Recht `loeschen`.

**Vormerken** setzt `geloescht_am`. Das Bild verschwindet aus der Galerie, die Datei
bleibt. **Nach 30 Tagen** entfernt der Aufräumlauf Original und Ableitungen.

- Eine eigene Ansicht „vorgemerkt", mit Restzeit je Bild
- **Zurückholen** solange die Frist läuft
- **Bilder in einer Auswahlliste nimmt die Sammellöschung nicht mit.** Was jemand
  ausdrücklich gesammelt hat, darf kein Stapellauf stillschweigend mitnehmen. Beim
  Einzellöschen genügt ein Hinweis, in wie vielen Listen das Bild steht
- Jede Abfrage der Galerie und der Listen filtert `geloescht_am IS NULL` – **an einer
  Stelle**, nicht in jeder Abfrage neu formuliert

> **Wichtig: die Zeile in `bild` bleibt stehen, auch nach dem Aufräumen.** Was
> verschwindet, sind die Dateien; die Zeile wird als gelöscht gekennzeichnet und behält
> ihren `sha256`. Ohne diesen Grabstein liest der nächste Ingest dieselbe Datei aus
> OneDrive wieder ein – und alles, was du gerade aussortiert hast, ist beim nächsten
> Kopieren zurück. Der Ingest muss diese Zeilen deshalb als Dublette behandeln und die
> Datei überspringen, ohne sie neu anzulegen.

## 5. Aufräumlauf

`tools/aufraeumen.sh` oder in Python: Dateien zu Zeilen mit `geloescht_am` älter als
30 Tage entfernen, Original und beide Ableitungen, Ergebnis zählen. Wiederholt
ausführbar. **Noch kein Timer** – von Hand, bis er über einen echten Durchgang
gelaufen ist.

---

## Prüfkriterien

- Betrachter **ohne** Recht `loeschen`: Knopf nicht sichtbar, **und** Server Action
  sowie Route direkt angesprochen → abgewiesen
- Verwalter gibt das Recht, Betrachter kann löschen; Recht entzogen → wieder abgewiesen
- Sammelauswahl über einen Filter mit mehr als 50 Treffern: **ankommende Zahl gleich
  gemeinter Zahl.** Vorher einmal auf einer zweiten Seite blättern, dann abschicken –
  das ist der Fall, der die `defaultChecked`-Falle auslöst
- Ohne Filter erscheint kein Sammelschalter, sondern der Hinweis
- Vorgemerktes Bild: verschwindet aus der Galerie, Datei liegt noch, Zurückholen bringt
  es wieder
- Aufräumlauf mit einer Attrappe (`geloescht_am` auf vor 31 Tagen gesetzt): Datei und
  Ableitungen weg, **Zeile steht noch**, `sha256` erhalten
- **Danach dieselbe Datei erneut nach `eingang/` legen und den Ingest laufen lassen →
  sie wird als bereits gelöscht erkannt und nicht neu angelegt.** Das ist der wichtigste
  Test des ganzen Auftrags
- Zwei Konten: Liste von A ist für B unsichtbar; nach Freigabe sichtbar, aber nicht
  änderbar – auch nicht über die Server Action direkt
- Bild in einer Liste überlebt eine Sammellöschung

Nach jedem Schritt berichten, was tatsächlich geprüft wurde – nicht nur, dass der
Befehl ohne Fehler durchlief.
