# Auftrag – Bildschirmfotos als eigene Herkunft

Ziel: Bildschirmfotos werden beim Einlesen als solche erkannt und bekommen eine eigene
Herkunft. Damit zerfällt das heutige Sammelbecken `ohne_exif` in das, was es tatsächlich
enthält.

Grundlage ist `CLAUDE.md`. Bei Widersprüchen gilt `CLAUDE.md`; bitte melden statt still
entscheiden.

> **Zum Zeitpunkt:** Punkt 1 bis 4 können sofort laufen. **Punkt 5, der Nachlauf über
> den vorhandenen Bestand, erst wenn ausdrücklich freigegeben** – derzeit werden rund
> 37.000 Dateien nach `eingang/` kopiert, und ein Nachlauf in einen wachsenden Bestand
> hinein liefert Zahlen, die sich nicht gegenprüfen lassen.

---

## 1. Erkennung – ohne KI

Bildschirmfotos vom iPhone tragen mehrere eindeutige Merkmale. Entscheidend ist die
**Kombination**, nicht ein einzelnes davon:

- **Die Bildmaße entsprechen exakt einer bekannten Bildschirmauflösung** –
  1179×2556, 1290×2796, 1170×2532, 1284×2778, 828×1792, 750×1334 und so weiter, jeweils
  auch quer. Die Liste steht an **einer** Stelle und ist eine gepflegte Datei, kein Code
- **und `Make` fehlt** (Kameradaten sind nicht vorhanden)

Ein echtes Foto erfüllt beides nie zugleich: Es hat entweder Kameradaten oder
Sensormaße, die auf keine Bildschirmgröße passen.

**Beide Bedingungen müssen zutreffen.** Nur die Maße zu prüfen wäre riskant – ein
zugeschnittenes Foto könnte zufällig passen. Nur `Make` zu prüfen ist das, was heute
schon geschieht und `ohne_exif` ergibt.

Das Dateiformat (PNG) ist ein **Hinweis, kein Kriterium**: Ältere iOS-Fassungen
speichern PNG, neuere teils HEIC. Umgekehrt gibt es PNG, die keine Bildschirmfotos sind.

## 2. Migration

Neuer Wert `screenshot` in `bild.herkunft`, samt Erweiterung der Prüfbedingung.

Die Reihenfolge der Prüfung im Ingest: **Bildschirmfoto vor `ohne_exif`.** Sonst greift
die alte Regel zuerst und die neue nie.

## 3. Anzeige

- `screenshot` erscheint im Herkunftsfilter der Galerie wie die anderen Werte
- **Nicht in der Vorgabe.** Die Galerie zeigt weiterhin `iphone`
- Auf der Übersicht mitzählen

## 4. Nicht löschen

Bildschirmfotos werden **nicht** verworfen, weder beim Einlesen noch danach. Sie
bekommen eine Kategorie, mehr nicht. Anders als bei den Wildkamerabildern gibt es hier
keinen zwingenden Grund – und die Erkennung ist neu und ungeprüft. Wer sie später
loswerden will, filtert und räumt zweistufig auf, wie bei allem anderen.

## 5. Nachlauf über den vorhandenen Bestand – **erst nach Freigabe**

Die vorhandenen Zeilen mit `herkunft = 'ohne_exif'` werden neu bewertet und, wo die
Kombination zutrifft, auf `screenshot` gesetzt.

- **Nur `ohne_exif` wird angefasst.** `iphone`, `fremd` und `apple_sonstig` bleiben
  unberührt – dort ist ein `Make` vorhanden, also ist es kein Bildschirmfoto
- Wiederholt ausführbar
- **Vorher zählen, was getroffen würde, und die Zahl berichten**, bevor geschrieben wird
- Eine Handvoll Treffer als Bildbelege nach `/data/kajoe_bilder/probe/screenshots/` –
  ob die Erkennung taugt, sieht man nicht an einer Zahl

Die Bildmaße stehen bereits in `bild.breite` und `bild.hoehe`; ein erneutes Lesen der
Dateien ist nicht nötig.

---

## Prüfkriterien

- Ein bekanntes Bildschirmfoto und ein bekanntes Foto durch den Ingest schicken →
  `screenshot` und `iphone`
- **Ein Foto, das zufällig auf eine Bildschirmgröße zugeschnitten wurde**, aber `Make`
  trägt → bleibt `iphone`. Falls sich im Bestand keines findet, eines herstellen
- Eine PNG-Datei mit ungewöhnlichen Maßen und ohne `Make` → bleibt `ohne_exif`
- Filter `herkunft=screenshot` in der Galerie: Zahl stimmt mit der Datenbank überein
- Vorgabe der Galerie unverändert `iphone`
- Zweiter Ingest-Lauf über dieselben Dateien: keine Änderung
- **Nach dem Nachlauf:** Summe über alle Herkunftswerte ergibt weiterhin die
  Gesamtzahl der Zeilen; nur `ohne_exif` hat abgenommen, nur `screenshot` zugenommen
- **Die Bildbelege ansehen und beurteilen** – sind es tatsächlich Bildschirmfotos?

Nach jedem Schritt berichten, was tatsächlich geprüft wurde – nicht nur, dass der Befehl
ohne Fehler durchlief.
