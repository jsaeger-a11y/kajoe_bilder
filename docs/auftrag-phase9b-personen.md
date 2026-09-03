# Auftrag Phase 9b – Personen benennen und finden

Ziel: Die Häufchen aus 9a bekommen Namen, und danach lassen sich alle Aufnahmen einer
Person finden. Offene Häufchen warten sichtbar auf eine Entscheidung.

Grundlage ist `CLAUDE.md`. Bei Widersprüchen gilt `CLAUDE.md`; bitte melden statt still
entscheiden.

---

## 1. Zugriff

**Ansehen** braucht das Recht `gesichter`, nach dem Muster von `karte`. Vorgabe: aus.
Damit lässt sich jemandem ein Jahrgang freigeben, ohne ihm die Personensuche zu geben.

**Benennen darf nur die Rolle `verwalter`** – kein eigenes Recht, keine Ausnahme. Wer
Gesichter benennt, legt fest, wer im Archiv namentlich auffindbar ist; das berührt
Rechte Dritter, und darüber entscheidet nicht jeder für sich. Dieselbe Überlegung wie
bei den Personenalarmen im Wildkameraprojekt.

Prüfung in **jeder** Seite, **jeder** Server Action und **jeder** Route.

## 2. Zwei Ansichten

**Personen** – die benannten. Je Person Name, Anzahl Aufnahmen, Zeitraum, ein
Beispielgesicht. Von dort in die Galerie, gefiltert auf diese Person.

**Offene Häufchen** – was noch keiner Entscheidung zugeführt wurde, **nach Größe
sortiert, größte zuerst**. Die lohnen sich am meisten, und die kleinen sind meist
Passanten.

Beide seitenweise. Bei rund 30.341 Funden werden es hunderte Häufchen.

## 3. Drei Wege aus einem offenen Häufchen

- **Einer bestehenden Person zuordnen** – der häufigste Fall. Kinder zerfallen über die
  Jahre in mehrere Häufchen, und Erwachsene mit Bart und ohne ebenso
- **Neue Person anlegen** – Name als freier Text. **Keine Prüfung auf „echte" Namen**:
  Im Pilotlauf ist das drittgrößte Häufchen mit 324 Funden der Hund. Der bekommt einen
  Namen wie alle anderen
- **Als unwichtig ablegen** – Passanten, Hintergrundleute, Gäste, die einmal vorkamen

> **„Unwichtig" ist eine Entscheidung, kein Löschen.** Das Häufchen bleibt bestehen und
> verschwindet nur aus der Liste. Passt später ein neues Gesicht dazu, taucht es **nicht
> wieder als offene Frage auf** – sonst legt man dieselbe Nachbarin jedes Jahr aufs Neue
> weg. Rückholbar muss es sein: eine eigene Ansicht für das Abgelegte.

Entscheidungen werden **sofort** gespeichert, nicht auf Knopfdruck. Einer, den jemand
vergisst, wäre eine verlorene Sitzung.

## 4. Nachbessern

**Häufchen zusammenführen.** Zwei, die dieselbe Person zeigen, werden zu einer Person.
Das ist bei Kindern der Normalfall, nicht die Ausnahme.

**Ein einzelnes Gesicht herausnehmen.** Ist ein fremdes Gesicht in einem Häufchen
gelandet, muss es sich lösen lassen – und der nächste Lauf darf es nicht wieder
zuordnen. Dafür ein eigener Vermerk am Fund, nicht bloß ein Zurücksetzen.

**Eine Person umbenennen und auflösen.** Beim Auflösen bleiben die Funde, die Zuordnung
fällt weg – die Bilder verschwinden nicht.

**Kein Knopf heißt wie etwas, das er nicht tut.** „Umbenennen" öffnet das Feld,
umbenannt wird mit „Neuen Namen speichern". Bei „Auflösen" steht in der Rückfrage, dass
die Bilder bleiben.

## 5. Suchen

Ein Filter `person` in der Galerie, wie Jahr und Herkunft. **Über dieselbe
Bedingungsfunktion** wie alles andere – damit gelten Jahresfreischaltung,
`geloescht_am` und die übrigen Filter automatisch mit.

Ein Bild zeigt mehrere Personen; der Filter meint „auf diesem Bild kommt X vor". Später
wäre „X und Y zusammen" eine sinnvolle Erweiterung – jetzt nicht bauen, aber die Abfrage
nicht so schreiben, dass es unmöglich wird.

In der Einzelansicht: welche Personen erkannt wurden, mit Weg zur jeweiligen Person.

## 6. Gesichter zeigen

Ausschnitte aus der Ansichtsfassung, anhand des gespeicherten Kastens. **Nicht aus dem
Original** – das wäre unnötiges HEIC-Dekodieren.

Wie bei `/datei/…`: Anmeldung bei jeder Anfrage, Recht prüfen, kein frei wählbarer Pfad.
**Gesichter aus vorgemerkt gelöschten Bildern erscheinen nicht.**

---

## Vorgaben

- **`BIGINT` kommt als Zeichenkette** aus dem Treiber – `id::int AS id` oder `Number()`
- Bei Sammelvorgängen über Häufchen: **die `defaultChecked`-Falle**. Sie hat in diesem
  Projekt zweimal zugeschlagen; die Auswahl gehört in die Adresse, und der gespeicherte
  Wert in den React-Schlüssel
- Mobil bedienbar – Benennen ist Handarbeit, und die macht man abends auf dem Sofa
- Was 9a in `gesicht.gruppe_id` geschrieben hat, ist Maschinenvorschlag;
  `gesicht.person_id` ist die menschliche Zuordnung. **Niemals das eine mit dem anderen
  überschreiben**

---

## Prüfkriterien

- Betrachter ohne Recht `gesichter`: Seiten 404, Routen 403, Menüpunkt fehlt.
  Recht erteilt → sichtbar; entzogen → wieder abgewiesen
- **Betrachter mit Recht `gesichter`, aber ohne Verwalterrolle:** sieht Personen, kann
  aber nicht benennen – Server Action direkt angesprochen → abgewiesen
- Ein Häufchen benennen: alle seine Funde tragen die Person, die Zahl in der
  Personenliste stimmt mit der Datenbank überein
- Zweites Häufchen derselben Person zuordnen: Zahl wächst um dessen Größe
- Ein Gesicht herausnehmen: verschwindet aus der Person, **und ein erneuter Lauf von
  `tools/gesichter.sh` ordnet es nicht wieder zu**
- Häufchen als unwichtig ablegen: verschwindet aus der Liste, steht in der eigenen
  Ansicht, lässt sich zurückholen
- Galerie mit `person=X`: Zahl stimmt mit der Datenbank überein
- **Mit einem Konto auf einem einzelnen Jahr:** `person=X` zeigt nur Aufnahmen aus
  diesem Jahr
- Ein vorgemerkt gelöschtes Bild verschwindet aus der Personenansicht
- Person auflösen: Funde bleiben, Zuordnung weg, Bilder unverändert
- **Auf dem Telefon benennen** und berichten, was dort nicht taugt

Nach jedem Schritt berichten, was tatsächlich geprüft wurde – nicht nur, dass der Befehl
ohne Fehler durchlief.
