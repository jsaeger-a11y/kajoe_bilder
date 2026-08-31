##Auftrag Phase 6 – Jahresfreischaltung je Benutzer

Ziel: Ein Benutzer sieht nur die Jahrgänge, die für ihn freigegeben sind. Der Anlass
ist konkret: Für den Kalender bekommt jemand Zugriff auf genau das Jahr, aus dem der
Kalender entsteht.

Grundlage ist `CLAUDE.md`. Bei Widersprüchen gilt `CLAUDE.md`; bitte melden statt still
entscheiden.

**Diese Entscheidung ist neu und kehrt eine frühere um.** In `CLAUDE.md` stand bisher,
eine Freischaltung je Jahr löse hier kein Problem, weil es keinen Jahrgang gebe, den
nicht jeder sehen dürfe. Das galt für den Haushalt, nicht für Gäste. Der Satz gehört
ersetzt, nicht stillschweigend übergangen.

---

## 1. Migration 005

`benutzer.jahre` als Liste von Jahreszahlen, **NULL erlaubt**:

| Wert | Bedeutung |
|---|---|
| `NULL` | alle Jahre, **auch künftige** |
| `{2025,2026}` | genau diese Jahre |
| `{}` | keines |

`NULL` ist die Vorgabe und der Normalfall. Damit erscheint 2027 von selbst, sobald die
ersten Bilder aus 2027 eintreffen – ohne dass jemand eine Liste nachführen muss. Nur
wer eingeschränkt werden soll, bekommt eine Liste.

**Bestehende Konten bekommen `NULL`**, nicht eine Liste der heute vorhandenen Jahre.
Sonst stünde ab Januar jeder ohne den neuen Jahrgang da.

Ein **Verwalter ist nie eingeschränkt**, unabhängig vom Feld.

## 2. Durchsetzen – an einer Stelle

Die Einschränkung gehört in die gemeinsame Bedingungsfunktion, die Galerie und Karte
bereits teilen. Eine zweite Fassung liefe auseinander, und dann zeigt die Karte, was
die Galerie verbirgt.

Betroffen sind **alle** Wege zu einem Bild:

- Galerie und Sammelauswahl
- Einzelansicht und das Blättern darin
- **Die Bildauslieferung** (`/datei/…`) – der wichtigste Fall. Eine geratene oder
  gemerkte Kennung darf kein Bild aus einem gesperrten Jahr liefern
- Karte
- Auswahllisten
- Herunterladen einzeln und als Paket
- Zahlen auf der Übersicht

**Die Jahresauswahl im Filter zeigt nur erlaubte Jahre.** Ein Jahr, das man wählen kann
und das dann leer ist, sieht aus wie ein Fehler.

## 3. Auswahllisten

**Die Bilder bleiben in der Liste.** Wird ein Jahr gesperrt, sind sie für diesen
Benutzer nicht sichtbar und nicht herunterladbar; nach der Freischaltung sind sie wieder
da. Nichts wird entfernt.

**Und die Liste sagt es.** „55 Bilder, davon 12 derzeit nicht verfügbar" – still
weglassen wäre das Schlimmste: Man lädt ein Paket herunter und baut einen Kalender mit
Lücken, ohne zu wissen, dass welche fehlen.

Dasselbe beim Paket: Die Zahl vor dem Herunterladen ist die der **verfügbaren** Bilder,
und der Unterschied steht dabei.

## 4. Bedienung in der Benutzerverwaltung

Je Benutzer eine aufklappbare Zeile mit:

- einem Schalter **„Alle Jahre, auch künftige"** (entspricht `NULL`)
- darunter, wenn er aus ist, ein Kästchen je Jahr

**Die Jahre kommen aus den Daten** (`SELECT DISTINCT jahr FROM bild`), nicht aus einer
Liste im Code. Sonst müsste sie jemand nachführen und würde es vergessen. Zur
Orientierung die Anzahl je Jahr dazu.

Welche Zeile aufgeklappt ist, gehört in die **Adresse**, nicht in ein `<details>`, das
der Server nachträglich aufziehen müsste.

Sichtbar machen, was gilt: In der Benutzerliste steht bei einem eingeschränkten Konto,
welche Jahre es sind – nicht nur „eingeschränkt".

## 5. Was sich nicht ändert

Das Recht `karte` und die Rolle bleiben, wie sie sind. Die Jahresfreischaltung ist eine
dritte, unabhängige Achse.

---

## Prüfkriterien

Mit einem Konto, das nur `{2025}` hat:

- Galerie zeigt ausschließlich 2025; die Summe stimmt mit der Datenbank für 2025 überein
- Der Jahresfilter bietet nur 2025 an
- **Eine Bildkennung aus 2024 direkt über `/datei/…` aufrufen → abgewiesen.** Vorschau,
  Ansicht und Wiedergabe je einzeln
- Einzelansicht eines Bildes aus 2024 über die Adresse → abgewiesen
- Karte: Summe gleich der Zahl der verorteten Aufnahmen aus 2025
- Übersicht nennt keine Zahlen aus gesperrten Jahren
- Eine Auswahlliste mit Bildern aus 2024 und 2025: Bilder bleiben in der Liste, nur die
  aus 2025 sind sichtbar, und die Zahl der nicht verfügbaren steht dabei
- Paket aus dieser Liste enthält **nur** die aus 2025, und die Ankündigung nennt die
  richtige Zahl
- Recht auf `{2024,2025}` erweitert → beide Jahre da, ohne Neuanmeldung
- Auf `{}` gesetzt → nichts sichtbar, keine Fehlerseite, sondern ein verständlicher Satz
- **Konto auf `NULL`** → alles sichtbar, wie vorher
- **Verwalter mit einer Liste im Feld** → sieht trotzdem alles
- Ein neues Jahr in `bild` einfügen (Attrappe, danach entfernen): erscheint bei `NULL`
  von selbst, bei einer Liste nicht

Nach jedem Schritt berichten, was tatsächlich geprüft wurde – nicht nur, dass der Befehl
ohne Fehler durchlief.
