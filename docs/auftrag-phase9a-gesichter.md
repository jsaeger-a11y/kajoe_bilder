# Auftrag Phase 9a – Gesichter finden und gruppieren

Ziel: In allen Aufnahmen Gesichter finden, sie in Häufchen zusammenfassen und
auszählen. **Ohne Oberfläche** – am Ende steht ein Bericht, aus dem hervorgeht, wie
brauchbar die Häufchen sind.

**Nicht Teil dieses Auftrags:** Benennen, Suchen nach Personen, alles Sichtbare. Das ist
9b und wird erst gebaut, wenn die Zahlen aus 9a überzeugen.

Grundlage ist `CLAUDE.md`. Bei Widersprüchen gilt `CLAUDE.md`; bitte melden statt still
entscheiden.

Bestand: 17.524 Zeilen, davon 16.232 sichtbar, 1.301 Videos (Videos bleiben in diesem
Auftrag außen vor).

---

## 1. Zweistufig, wie beim Wildkameraprojekt

Erst ein Detektor, der Gesichter im Bild findet, dann ein zweites Modell, das aus jedem
Gesicht einen Vektor macht. Zwei Vektoren nah beieinander heißt: wahrscheinlich dieselbe
Person.

**InsightFace `buffalo_l`** (RetinaFace + ArcFace) über `onnxruntime`, lokal, kein Bild
verlässt den Server.

> **Zur Lizenz:** Die vortrainierten Gewichte von InsightFace sind für Forschung und
> nicht-kommerzielle Nutzung freigegeben – anders als `apa-rtdetr-e` im
> Wildkameraprojekt, das unter Apache-2.0 steht. Für ein privates Familienarchiv im
> Haushalt ist das gedeckt. Der Vermerk gehört in `CLAUDE.md`, damit die Einschränkung
> nicht in Vergessenheit gerät.

Modellgewichte nicht ins Repository.

**Gerechnet wird auf der Ansichtsfassung** (~1600 px), nicht auf dem Original. Das
spart das Dekodieren von HEIC und ist für Gesichtserkennung mehr als ausreichend.
Falls sich zeigt, dass kleine Gesichter dadurch verlorengehen, bitte melden.

## 2. Migration 009

**`gesicht`** – ein Fund je Zeile: Bezug zum Bild, Kasten, Güte des Detektors, der
Vektor, dazu Merkmale für die Qualitätsbeurteilung (Größe im Bild, Schärfe, Kopfhaltung),
das verwendete Modell, Zeitpunkt.

Der Vektor als `real[]` oder `bytea`. **Kein pgvector.** Bei der zu erwartenden Menge
reicht die Rechnung von Hand; eine Datenbankerweiterung wäre dasselbe Übermaß wie
PostGIS für die Karte.

**`gruppe`** – ein Häufchen: Größe, ein repräsentativer Fund, Mittelvektor.

**`person`** – wird in 9b gefüllt, das Schema kann schon stehen.

> **Maschinenvorschlag und menschliche Zuordnung bleiben getrennte Spalten** –
> `gesicht.gruppe_id` gegen `gesicht.person_id`. Dieselbe Regel wie `art_ki` gegen
> `art_bestaetigt`: Niemals den einen Wert mit dem anderen überschreiben, sonst ist
> später nicht mehr nachvollziehbar, wie verlässlich die Zuordnungen sind.

## 3. Qualität vor der Gruppierung

**Schlechte Gesichter verderben die Häufchen.** Ein verwackeltes Profil im Hintergrund
liegt in der Mitte zwischen mehreren Personen und verbindet sie zu einem einzigen
Häufchen.

Deshalb zweistufig: Nur Funde ausreichender Güte, Größe und Frontalität bilden die
Häufchen. Die übrigen bleiben in der Datenbank und werden **danach** dem nächsten
Mittelvektor zugeordnet – mit strengerem Maßstab, und wenn keiner passt, gar nicht.

Die Schwellwerte stehen an **einer** Stelle.

## 4. Gruppieren

Kosinusähnlichkeit über die Vektoren. **Nicht die vollständige Abstandsmatrix
aufbauen** – bei 50.000 Funden wären das 2,5 Milliarden Werte. In Blöcken rechnen, und
nur Paare oberhalb der Schwelle behalten.

> **Lieber zu viele Häufchen als zu wenige.** Zerfällt eine Person in drei Häufchen,
> führt der Mensch sie in 9b mit drei Klicks zusammen. Verschmelzen zwei Personen zu
> einem Häufchen, benennt er sie falsch – und merkt es erst, wenn er die Bilder
> durchsieht. Die Schwelle gehört deshalb **streng** gewählt, und ein Häufchen braucht
> mehrere sich gegenseitig stützende Funde, nicht eine einzelne Verbindung. Eine
> Kette aus Einzelverbindungen zieht sonst über eine schlechte Aufnahme zwei Personen
> zusammen.

**Kinder zerfallen über die Jahre**, das ist unvermeidlich und auch bei Apple so – ein
Dreijähriger und derselbe mit zehn liegen nicht beieinander. Das Zusammenführen mehrerer
Häufchen zu einer Person muss 9b können; hier ist es nur zu erwarten.

## 5. Wiederholbar, ohne Arbeit zu zerstören

Kommen neue Bilder dazu, läuft der Vorgang erneut. Dann gilt:

- **Was ein Mensch zugeordnet hat, wird nie durch einen neuen Lauf verändert** –
  dieselbe Regel wie beim Nachlauf im Wildkameraprojekt
- Neue Funde werden zuerst gegen die vorhandenen Häufchen geprüft und nur, wenn keines
  passt, untereinander gruppiert
- **Kein vollständiges Neugruppieren** des Bestands, außer ausdrücklich verlangt
- Wiederaufsetzbar, Fortschritt am Datensatz
- Temperatur mitmessen wie beim Ableitungslauf

Aufruf über `tools/gesichter.sh`, von Hand. Kein Timer, kein Knopf – das kommt später.

## 6. Bericht

Am Ende, als Zahlen:

- Bilder verarbeitet, Gesichter gefunden, davon für die Gruppierung tauglich
- Häufchen gesamt, und ihre Größenverteilung
- Wie viele Funde in einem Häufchen landen und wie viele allein bleiben
- Die zwanzig größten Häufchen mit Größe und Zeitspanne der Aufnahmen
- Laufzeit je Bild, hochgerechnet auf den Bestand

**Zusätzlich Bildbelege**: Für die zwanzig größten Häufchen je ein Blatt mit
Beispielausschnitten nach `/data/kajoe_bilder/probe/gruppen/`. Ob eine Gruppierung
taugt, kann niemand an einer Zahl ablesen – nur am Ansehen.

---

## Prüfkriterien

- Lauf über einen Teilbestand (etwa 2.000 Bilder) vor dem vollen Durchgang, mit
  Bericht und Bildbelegen
- **Die Bildbelege durchsehen und beurteilen:** Sind in den zwanzig größten Häufchen
  jeweils erkennbar dieselbe Person? Wo nicht, mit welcher Art von Aufnahme?
- Zweiter Lauf über dieselben Bilder: keine doppelten Funde, keine neuen Häufchen
- Neue Bilder hinzufügen (Attrappen aus dem Bestand): Funde werden vorhandenen Häufchen
  zugeordnet, bestehende Häufchen bleiben unverändert
- Eine `person_id` von Hand setzen, Lauf wiederholen → sie steht unverändert da
- Speicherverbrauch beim Gruppieren messen – er darf nicht mit dem Quadrat der
  Fundzahl wachsen
- Laufzeit je Bild und Prozessortemperatur berichten

**Erst nach dieser Beurteilung wird der volle Bestand gerechnet.** Fünf bis zehn
Stunden für Häufchen, die nicht taugen, wären vertane Zeit – und die Schwellwerte lassen
sich an 2.000 Bildern genauso gut einstellen wie an 16.000.

Nach jedem Schritt berichten, was tatsächlich geprüft wurde – nicht nur, dass der Befehl
ohne Fehler durchlief.
