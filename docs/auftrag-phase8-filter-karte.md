# Auftrag Phase 8 – Mehrere Jahre filtern, von der Karte in die Galerie

Zwei Erweiterungen an vorhandenen Bausteinen:

1. Der Jahresfilter nimmt **mehrere Jahre gleichzeitig** (etwa 2022, 2023, 2025)
2. Ein Klick auf eine Gruppe der Karte zeigt **deren Aufnahmen in der Galerie**

Grundlage ist `CLAUDE.md`. Bei Widersprüchen gilt `CLAUDE.md`; bitte melden statt still
entscheiden.

---

## 1. Mehrere Jahre im Filter

In der Adresse als Aufzählung, etwa `jahr=2022,2023,2025`. **Bestehende Adressen mit
einem einzelnen Jahr müssen weiter funktionieren** – es gibt Lesezeichen.

Wirkt überall dort, wo der Jahresfilter heute wirkt: Galerie, Karte, Sammelauswahl,
Übersicht. Über **dieselbe** Bedingungsfunktion, nicht als zweite Fassung daneben.

Bedienung: Kästchen je Jahr statt einer Auswahlliste, mit „alle" als Rückweg. Die
angebotenen Jahre kommen aus den Daten und sind bereits auf die freigeschalteten
begrenzt.

Der **Monatsfilter** bleibt daneben bestehen und wirkt über alle gewählten Jahre – „Juli
2022, 2023 und 2025" ist eine sinnvolle Frage. Falls das der heutigen Bauweise
widerspricht, bitte melden.

> **Der Filter darf den Zugriff niemals erweitern.** Freischaltung und Filter sehen sich
> ähnlich und sind es nicht: Die Freischaltung sagt, was jemand **darf**, der Filter,
> was er gerade **sehen will**. Steht in der Adresse ein Jahr, das nicht freigeschaltet
> ist, kommt dafür **nichts** – keine Fehlerseite, keine Bilder. Der Filter schneidet
> nur innerhalb des Erlaubten.
>
> Das ist der Punkt, an dem ein Mehrfachfilter gefährlich wird: Bei einem einzelnen Jahr
> fällt eine fehlende Prüfung sofort auf, bei einer Aufzählung mit einem
> unberechtigten Eintrag darin nicht.

## 2. Von der Karte in die Galerie

Klick auf eine Gruppe: Die Aufnahmen dahinter erscheinen in der Galerie, neueste zuerst
(wie dort ohnehin üblich).

**Nicht die Bildkennungen weiterreichen.** Hinter einer Gruppe können über zweitausend
Aufnahmen liegen; die passen in keine Adresse. Stattdessen wandert der **Ausschnitt**
mit – die Gitterzelle, aus der die Gruppe entstanden ist, etwa
`zelle=<stufe>:<zeile>:<spalte>`.

> **Dieselbe Zellrechnung verwenden wie die Karte, nicht eine zweite in Grad.** Das
> Gitter der Karte liegt in Mercator-Koordinaten. Ein Rechteck in Grad nachzubilden
> ergäbe einen leicht anderen Ausschnitt – und 43 Punkte auf der Karte gegen 44 Bilder
> in der Galerie sieht aus wie ein Fehler, auch wenn beide für sich richtig rechnen.

In der Galerie steht dann sichtbar, dass ein Kartenausschnitt gefiltert ist, mit einem
Weg zurück zur Karte an derselben Stelle. Der Ausschnitt lässt sich mit Jahr, Monat, Typ
und Herkunft kombinieren wie jeder andere Filter.

**Auch die Gruppe, die sich nicht weiter teilen lässt** (über dem dichtesten Punkt
stehen 2.121 Aufnahmen), muss so erreichbar sein – dort ist der Sprung in die Galerie
sogar der einzige Weg an die Bilder.

Aufnahmen ohne Ort erscheinen bei gesetztem Ausschnitt nicht. Das ist richtig und sollte
niemanden überraschen, solange danebensteht, dass gefiltert wird.

---

## Prüfkriterien

**Mehrjahresfilter**

- `jahr=2022,2023,2025`: Trefferzahl gleich der Summe der drei Einzeljahre
- Dieselbe Auswahl auf der Karte: Summe der Gruppen gleich der Galeriezahl mit denselben
  Filtern
- Zusammen mit dem Monatsfilter: `jahr=2022,2023&monat=7` ergibt die Summe der drei Julis
- Eine alte Adresse mit `jahr=2026` funktioniert unverändert
- **Mit einem Konto auf `{2025}`:** `jahr=2024,2025` in der Adresse ergibt genau die
  Zahl für 2025 allein. Ebenso `jahr=2024` allein: nichts. Für Galerie, Karte **und**
  die Bildauslieferung einzeln geprüft
- Unsinnige Eingaben (`jahr=abc`, `jahr=2022,,`, `jahr=99999`) führen nicht zu einer
  Fehlerseite

**Karte in Galerie**

- Klick auf eine Gruppe mit 43 Aufnahmen: Galerie zeigt **genau 43**
- Auf drei verschiedenen Zoomstufen geprüft, jedes Mal stimmt die Zahl
- Die Gruppe mit 2.121: Galerie zeigt 2.121, seitenweise
- Ausschnitt plus `jahr=2025`: Zahl gleich der Kartengruppe mit demselben Jahresfilter
- Zurück zur Karte: derselbe Ausschnitt, dieselbe Zoomstufe
- **Mit einem eingeschränkten Konto:** Der Ausschnitt zeigt nur Aufnahmen aus
  freigeschalteten Jahren, auch wenn die Zelle andere enthält
- Adresse mit Ausschnitt in einem neuen Fenster: dieselbe Menge

Nach jedem Schritt berichten, was tatsächlich geprüft wurde – nicht nur, dass der Befehl
ohne Fehler durchlief.
