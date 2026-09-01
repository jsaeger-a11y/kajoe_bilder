# Auftrag Phase 7 – Aufräumen und Systempflege automatisieren

Ziel: Der Aufräumlauf läuft von selbst, und Sicherheitsupdates werden eingespielt –
mit Neustart, wenn einer nötig ist. Beides nach dem Muster des Wildkameraprojekts auf
`hunter`.

Grundlage ist `CLAUDE.md`. Bei Widersprüchen gilt `CLAUDE.md`; bitte melden statt still
entscheiden.

---

## 1. Der Aufräumlauf – vorsichtig automatisieren

`tools/aufraeumen.sh` ist **der einzige Vorgang im System, der Dateien wirklich
entfernt**. Er läuft bisher von Hand, und das war Absicht. Beim Automatisieren gehören
deshalb zwei Sicherungen dazu, die nichts kosten.

**Ein Probelauf-Schalter.** Der Timer ruft zunächst `--probe` auf: zählen und berichten,
nichts löschen. Der Schalter steht in der Unit oder der `.env`, nicht im Skript – die
Umstellung auf scharf soll eine Zeile sein und kein Eingriff in den Code. Ein deutlicher
Hinweis im Bericht, in welchem Modus gelaufen wurde.

**Eine Obergrenze je Lauf.** Findet er auf einmal mehr als eine festzulegende Zahl von
Dateien, ist das kein normaler Betrieb, sondern ein Fehler – etwa ein versehentlicher
Sammelvorgang. Dann **bricht er ab und meldet**, statt zu arbeiten. Die Grenze steht an
einer Stelle.

**Zeitpunkt: nach der Sicherung**, nicht davor. Die Sicherung um 03:01 enthält dann noch
den Stand vor dem Löschen. Also etwa 03:20.

`Persistent=true`, damit ein verpasster Lauf nachgeholt wird.

**Der Bericht muss jemanden erreichen.** Ein Vorgang, der unbeobachtet löscht, ist
derselbe Fall wie eine ungetestete Sicherung. Mindestens: die letzten Läufe in
`tools/status.sh`, mit Anzahl und Modus.

## 2. Sicherheitsupdates

`unattended-upgrades` einrichten, nur Sicherheitsquellen.

**Mit Neustart**, wenn einer nötig ist. Zeitpunkt so wählen, dass er weder mit der
Sicherung (03:01) noch mit dem Aufräumlauf kollidiert – auf `hunter` ist es 03:45 UTC,
das passt auch hier.

Zu prüfen ist, dass danach alles von selbst wiederkommt:

- PostgreSQL-Container (`restart: unless-stopped`)
- `kajoe-web` als Benutzerdienst – hängt an `loginctl enable-linger`
- Der Einhängepunkt aus der `fstab`
- Die Gruppen `render` und `video` für VAAPI

Ein Neustart wurde einmal von Hand geprüft und lief sauber. Nach der Einrichtung bitte
noch einmal, weil sich seither einiges dazugesellt hat.

> **Ein Neustart kann einen laufenden Verarbeitungsvorgang treffen.** Das ist
> verkraftbar: Der Ingest ist wiederaufsetzbar, und Phase 4 erkennt eine
> Datenbankzeile mit totem Prozess und setzt sie auf `abgebrochen`. Bitte trotzdem
> **prüfen**, dass das nach einem echten Neustart mitten im Lauf auch greift – bisher
> ist es nur mit einem beendeten Prozess erprobt.

**„Seit wann steht der Neustart aus" kommt nicht aus der Dateizeit.**
`/var/run/reboot-required` wird bei **jedem** Kernel neu angefasst. Rückt Monat für
Monat einer nach, ohne dass jemand neu startet, springt die Dateizeit immer wieder auf
heute. Wer das anzeigen will, braucht eine eigene Erstsichtung. Für `tools/status.sh`
genügt zunächst, **dass** ein Neustart aussteht.

## 3. Was nicht automatisiert wird

Die **Verarbeitung** bleibt beim Knopf aus Phase 4. Ein Timer, der nachsieht, ob etwas in
`eingang/` liegt, müsste raten, ob eine Übertragung fertig ist – der Knopfdruck ist der
Beleg dafür.

---

## Prüfkriterien

- Timer steht in `systemctl --user list-timers` mit der nächsten Startzeit
- **Probelauf mit einer Attrappe** (`geloescht_am` auf vor 31 Tagen): meldet die Datei,
  **löscht sie nicht**, Datei liegt danach noch da
- Umstellung auf scharf: derselbe Fall wird gelöscht, Zeile bleibt stehen, `sha256`
  erhalten
- **Obergrenze:** mehr Attrappen anlegen als die Grenze erlaubt → Abbruch mit Meldung,
  **keine Datei entfernt**
- Verpasster Lauf wird nachgeholt (`Persistent=true` – prüfbar, indem der Timer bei
  gestopptem Benutzermanager fällig wird)
- `tools/status.sh` zeigt die letzten Läufe mit Modus
- `unattended-upgrades --dry-run` läuft durch, Konfiguration zeigt Sicherheitsquellen
  und den Neustartzeitpunkt
- **Neustart auslösen und danach prüfen:** Einhängepunkt, Container, Webdienst, Timer,
  Gruppen, VAAPI ohne `sg render`, `Unsafe Shutdowns` unverändert
- **Verarbeitungslauf starten, mitten darin neu starten** → die Zeile geht auf
  `abgebrochen`, ein neuer Anstoß läuft, der Bestand ist danach vollständig

Nach jedem Schritt berichten, was tatsächlich geprüft wurde – nicht nur, dass der Befehl
ohne Fehler durchlief.
