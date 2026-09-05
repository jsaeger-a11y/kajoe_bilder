# Auftrag – Filter der Galerie als Klapplisten

Ziel: Die Filterzeile der Galerie wird aufgeräumt. Statt aller Werte nebeneinander gibt
es je Achse eine Klappliste – Jahr, Monat, Herkunft, Typ, Person, Ort.

Grundlage ist `CLAUDE.md`. Bei Widersprüchen gilt `CLAUDE.md`; bitte melden statt still
entscheiden.

---

## 1. Was durch das Zuklappen verlorengeht – und nicht verlorengehen darf

In `CLAUDE.md` steht seit Phase 2b: Die Vorgabe ist `iphone`, **und es muss sichtbar
sein, dass gefiltert wird.** Ein stiller Filter lässt jemanden glauben, mehr sei nicht
da.

Genau das setzt dieser Umbau aufs Spiel. Deshalb:

**Die geschlossene Klappliste zeigt den gewählten Wert, nicht nur den Namen der Achse.**
Nicht „Herkunft", sondern „Herkunft: iPhone". Nicht „Jahr", sondern „Jahr: 2022, 2023,
2025" – und bei mehr als drei „Jahr: 4 gewählt".

**Eine Achse ohne Einschränkung sieht anders aus als eine mit.** „Typ: alle" darf nicht
so aussehen wie „Typ: Video". Ein Kennzeichen an der Klappe genügt, aber es muss eines
geben.

**Und es gibt einen Weg zurück auf alles**, mit einem Griff – sowohl je Achse als auch
für sämtliche Filter zusammen. Wer sich verlaufen hat, soll nicht die Adresse von Hand
bereinigen müssen.

## 2. Die Achsen

**Jahr** – mehrere gleichzeitig, das bleibt so. Die Liste enthält nur freigeschaltete
Jahre, mit Trefferzahl je Jahr. Ein Kästchen je Jahr, wie bisher, nur in der Klappe.

**Monat** – wie bisher, wirkt über alle gewählten Jahre.

**Herkunft** – `iphone`, `ohne_exif`, `screenshot`, `fremd`, `apple_sonstig`, mit
Trefferzahl. Vorgabe bleibt `iphone`.

**Typ** – Bild, Video, alle.

**Person** – inzwischen 40 Namen. Nach Anzahl sortiert, größte zuerst; bei dieser Länge
gehört ein Eingabefeld zum Einschränken dazu. Nur mit dem Recht `gesichter` sichtbar.

**Ort** – „mit Ort", „ohne Ort", „alle".

> **Der Kartenausschnitt ist keine Klappliste.** Er kommt von der Karte und lässt sich
> dort nicht auswählen. Er gehört als eigener, sichtbarer Hinweis daneben, mit einem
> Weg, ihn zu entfernen, und einem zurück zur Karte – so wie er es heute schon tut.

## 3. Bedienung

**Der Filterzustand steht weiterhin in der Adresse.** Daran ändert sich nichts – eine
Ansicht muss sich wiederfinden lassen, und der Zurück-Knopf muss tun, was er soll.

**Ob eine Klappe offen ist, ist flüchtig** und gehört nicht in die Adresse. Anders als
beim Filterzustand geht dabei nichts verloren.

**Es ist immer nur eine Klappe offen.** Sechs gleichzeitig wären wieder die alte Zeile,
nur höher.

**Mobil zuerst.** Auf einem Telefon ist die aufgeklappte Liste der eigentliche Gewinn –
Tippziele groß genug, und die Klappe darf den Bildschirm füllen, wenn es hilft.

Die Trefferzahlen bleiben, wo sie heute sind: in der offenen Liste neben jedem Wert.

## 4. Wo sonst noch

Die Karte hat dieselben Filter. **Dieselben Bausteine verwenden**, keine zweite Fassung
– sonst laufen die beiden Ansichten auseinander, und dann zeigt die Karte etwas anderes
als die Galerie.

---

## Prüfkriterien

- Ohne Parameter: „Herkunft: iPhone" steht **lesbar an der geschlossenen Klappe**, und
  die Trefferzahl der Galerie ist unverändert
- Drei Jahre wählen: die Klappe nennt sie; vier Jahre: „4 gewählt"
- Eine Achse ohne Einschränkung ist von einer mit Einschränkung zu unterscheiden –
  **ohne die Klappe zu öffnen**
- „Alles zurücksetzen" führt auf die Vorgabe, nicht auf einen leeren Zustand
- Adresse mit Filtern in einem neuen Fenster: dieselbe Ansicht, dieselben Klappen
  beschriftet
- Alte Adressen mit Filtern funktionieren unverändert
- Zweite Klappe öffnen schließt die erste
- **Mit einem Konto auf einem einzelnen Jahr:** die Jahresliste zeigt nur dieses Jahr
- **Ohne Recht `gesichter`:** die Personenklappe erscheint nicht
- Kartenausschnitt gesetzt: steht sichtbar daneben, lässt sich entfernen, Weg zurück zur
  Karte funktioniert
- Karte und Galerie mit denselben Filtern: die Zahlen passen zusammen
- **Auf dem Telefon bedienen** und berichten, was dort nicht taugt

Nach jedem Schritt berichten, was tatsächlich geprüft wurde – nicht nur, dass der Befehl
ohne Fehler durchlief.
