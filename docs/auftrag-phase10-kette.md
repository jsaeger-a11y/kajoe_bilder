# Auftrag Phase 10 – Die Verarbeitungskette schließen

Ziel: Ein Knopf, ein Durchlauf. Nach dem Kopieren neuer Dateien nach `eingang/` laufen
Einlesen, Ableiten **und Gesichtserkennung** nacheinander durch, unabhängig vom Browser.

Grundlage ist `CLAUDE.md`. Bei Widersprüchen gilt `CLAUDE.md`; bitte melden statt still
entscheiden.

Das meiste steht bereits: Knopf, Auslösedatei, `systemd.path`, Sperre, Bootkennung,
Fortschrittsanzeige, Erkennung verwaister Läufe. Es kommt ein dritter Schritt hinzu.

---

## 1. Der dritte Schritt

Nach `einlesen` und `ableiten` folgt `gesichter`. Schlägt ein Schritt fehl, laufen die
folgenden nicht an – wie bisher.

Der Schritt fasst nur an, was noch keine Funde hat. Bei ein paar hundert neuen Bildern
sind das Sekunden; bei einem großen Schwung Stunden. Beides muss die Anzeige aushalten,
und sie tut es – sie liest aus der Datenbank.

**Der Fortschritt wird auch hier während der Arbeit fortgeschrieben**, nicht erst am
Ende. Sonst steht die Anzeige bei einem langen Lauf stundenlang still.

## 2. Was der Schritt nicht tut

**Er ordnet nichts zu.** Neue Funde landen im Gruppierungsschritt, und wo sie an ein
benanntes Häufchen passen, erscheinen sie dort als „N neu" mit dem Übernehmen-Knopf aus
9b. Das ist die bewusste Grenze: Die Maschine legt vor, der Mensch entscheidet.

Ein Fund, der still der falschen Person zugeschlagen wird, ist nicht wiederzufinden –
niemand hat die Zuordnung je gesehen. Dasselbe Muster wie beim „confidently wrong"
im Wildkameraprojekt: gefährlich ist nicht die unsichere Erkennung, sondern die sichere
und falsche.

**Und er gruppiert nicht neu.** `--neu-gruppieren` bleibt ein Aufruf von Hand.

## 3. Nach dem Lauf

Der Bericht nennt zusätzlich: Bilder auf Gesichter untersucht, Funde, davon tauglich,
neuen Häufchen zugeordnet, an bestehende angehängt.

**Und, wenn es welche gibt, deutlich sichtbar:** wie viele Funde bei benannten Personen
zur Übernahme bereitliegen, mit Weg dorthin. Sonst bemerkt sie niemand – der Knopf ist
gedrückt, der Lauf ist durch, und die sieben neuen Gesichter an „Oma" warten still.

## 4. Laufzeit ehrlich benennen

Vor dem Anstoßen steht bereits Anzahl und Größe der Dateien in `eingang/`. Dazu gehört
jetzt eine **grobe Schätzung der Gesamtdauer**, aus den gemessenen Werten: rund 15 ms je
Datei fürs Einlesen, 240 ms je Bild fürs Ableiten, 314 ms je Bild für die Gesichter.

Nicht als Versprechen, sondern damit niemand einen Knopf drückt, der zwei Minuten dauern
soll und drei Stunden läuft. Die Werte stehen an **einer** Stelle und sind als grobe
Schätzung gekennzeichnet.

## 5. Von Hand muss es weiter gehen

`tools/einlesen.sh`, `tools/ableiten.sh` und `tools/gesichter.sh` bleiben einzeln
aufrufbar. Wenn die Weboberfläche nicht läuft, darf die Verarbeitung nicht davon
abhängen.

---

## Prüfkriterien

- **Kleiner Durchlauf:** 20 neue Dateien hineinlegen, Knopf drücken → alle drei Schritte
  laufen, der Bericht nennt für jeden Zahlen, `eingang/` ist leer
- **Browser schließen, nach zwei Minuten neu öffnen** → der Lauf läuft weiter, die
  Anzeige stimmt
- **Webdienst während des Gesichtsschritts neu starten** → der Lauf läuft weiter
- Zweiter Anstoß während eines Laufs: abgewiesen, mit Begründung
- Ein Bild, das schon Funde hat, wird nicht erneut untersucht
- **Ein neuer Fund an einem benannten Häufchen:** erscheint als „N neu", wird **nicht**
  automatisch zugeordnet, und der Bericht weist darauf hin
- Die Dauerschätzung vor dem Anstoßen gegen die tatsächliche Laufzeit halten und die
  Abweichung berichten
- `tools/gesichter.sh` von Hand: funktioniert unverändert
- Fehler im zweiten Schritt (herbeigeführt) → dritter Schritt läuft nicht an, der
  Bericht sagt warum

Nach jedem Schritt berichten, was tatsächlich geprüft wurde – nicht nur, dass der Befehl
ohne Fehler durchlief.
