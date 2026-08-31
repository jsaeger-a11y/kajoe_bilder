# Auftrag Phase 5 – Karte

Ziel: Eine Karte, auf der die Aufnahmeorte zu sehen sind. Je weiter herausgezoomt, desto
gröber die Gruppierung; beim Hineinzoomen zerfallen die Gruppen in feinere und
schließlich in einzelne Aufnahmen.

Grundlage ist `CLAUDE.md`. Bei Widersprüchen gilt `CLAUDE.md`; bitte melden statt still
entscheiden.

Bestand: 17.524 Zeilen, davon **15.198 mit `gps_status = 'ok'`** und 1.404 ohne Ort.

---

## 1. Die Gruppierung gehört auf den Server

Der naheliegende Weg – alle Punkte in den Browser laden und dort gruppieren
(Leaflet.markercluster) – trägt hier nicht. 15.198 Punkte sind auf dem Telefon zu viel,
und mobil ist der wichtigere Fall.

Stattdessen: Der Browser meldet **Ausschnitt und Zoomstufe**, der Server antwortet mit
den Gruppen für genau diesen Ausschnitt.

**Kein PostGIS.** In `CLAUDE.md` steht bisher, dass es keine Karte gibt und deshalb kein
PostGIS – Ersteres ändert sich, Letzteres nicht. Eine Gitterrechnung über gerundete
Koordinaten genügt:

```sql
floor(lat / :zelle) AS zeile,
floor(lon / :zelle) AS spalte,
count(*),
avg(lat), avg(lon),
min(id) AS beispiel
```

Die Zellgröße hängt an der Zoomstufe, die Zuordnung steht an **einer** Stelle. Der
Index `bild_gps_idx` ist vorhanden.

**Der Marker sitzt auf dem Schwerpunkt der Gruppe, nicht in der Zellmitte.** Sonst
stehen die Punkte sichtbar auf einem Raster statt dort, wo fotografiert wurde.

**Eine Gruppe mit genau einer Aufnahme wird als einzelne Aufnahme gezeigt**, nicht als
Gruppe mit der Zahl 1.

## 2. Kartenmaterial

Leaflet mit OpenStreetMap. **Die Namensnennung ist Pflicht** und muss auf der Karte
stehen.

> **Keine Rückwärtssuche nach Ortsnamen.** Verlockend wäre, zu jeder Gruppe „Wien" oder
> „Norderstedt" anzuzeigen. Das hieße aber, private Aufnahmekoordinaten – darunter die
> eigene Wohnung – an einen fremden Dienst zu schicken. Die Kartenkacheln selbst
> verraten nur, welchen Ausschnitt jemand ansieht; Koordinaten aus dem eigenen Bestand
> gehen nicht hinaus.

## 3. Bedienung

- Klick auf eine Gruppe: hineinzoomen, bis sie zerfällt
- Klick auf eine einzelne Aufnahme: Vorschaubild und Datum, von dort in die
  Einzelansicht
- Beim Zurückkommen aus der Einzelansicht steht die Karte wieder da, wo sie war

**Ausschnitt und Zoomstufe stehen in der Adresse**, wie die Filter in der Galerie. Sonst
lässt sich eine Ansicht nicht wiederfinden und der Zurück-Knopf tut nicht, was er soll.

## 4. Filter gelten auch hier

Die Filter der Galerie – Jahr, Monat, Herkunft, Typ – wirken auf der Karte genauso, und
zwar mit **derselben Bedingung im Code**, nicht mit einer zweiten Fassung davon. Zwei
Formulierungen laufen auseinander, und dann zeigt die Karte etwas anderes als die
Galerie.

Ebenso: `geloescht_am IS NULL` und `gps_status = 'ok'`.

**Sichtbar dazuschreiben, wie viele Aufnahmen keinen Ort haben** (1.404 von 17.524, also
8 %). Wer das nicht weiß, hält die Karte für vollständig und sucht ein Bild, das dort
nie erscheinen wird.

## 5. Mobil

Der wichtigere Fall. Die Karte muss auf einem Telefon bedienbar sein: Zoomen mit zwei
Fingern, Marker groß genug zum Treffen, keine Bedienelemente unter dem Daumenrand.

**Nicht bei jeder Kartenbewegung nachladen.** Sonst prasseln beim Ziehen Dutzende
Anfragen los. Ein kurzes Abwarten nach dem Loslassen genügt.

---

## Prüfkriterien

- Summe der Gruppengrößen über ganz Europa ergibt **15.198**
- Mit Filter `jahr = 2026`: Summe auf der Karte gleich der Trefferzahl in der Galerie mit
  demselben Filter
- Hineinzoomen: eine Gruppe zerfällt, die Summe der Teile ergibt die vorherige Zahl
- Auf maximaler Stufe stehen einzelne Aufnahmen, keine Gruppen mit der Zahl 1
- Eine vorgemerkt gelöschte Aufnahme verschwindet von der Karte
- Adresse mit Ausschnitt in einem neuen Fenster öffnen → derselbe Ausschnitt
- **Antwortzeit für einen Ausschnitt über ganz Deutschland messen** – die Abfrage darf
  nicht über alle 15.198 Zeilen einzeln laufen
- **Netzverkehr beim Ziehen der Karte ansehen**: keine Anfrageflut
- Namensnennung von OpenStreetMap ist sichtbar
- **Auf dem Telefon bedienen** und berichten, was dort nicht taugt

Nach jedem Schritt berichten, was tatsächlich geprüft wurde – nicht nur, dass der Befehl
ohne Fehler durchlief.
