# Auftrag Phase 4 – Verarbeitung aus der Oberfläche anstoßen

Ziel: Nach dem Kopieren neuer Bilder nach `eingang/` genügt ein Knopf in der
Weboberfläche. Einlesen und Ableiten laufen dann durch, unabhängig vom Browser, und
der Fortschritt ist sichtbar.

Grundlage ist `CLAUDE.md`. Bei Widersprüchen gilt `CLAUDE.md`; bitte melden statt still
entscheiden.

---

## 0. Nachträge aus 3b

**`DATABASE_URL` wird aus den Einzelwerten zusammengesetzt**, nicht als eigener
Eintrag mit dem Passwort darin geführt. Zwei Stellen mit demselben Passwort sind ein
zweiter Stand – und genau daran hing die Anwendung am 31.08. für mehrere Stunden
unbemerkt, weil `/anmelden` die einzige Seite ist, die ohne Datenbank rendert.

Dazu drei Einträge in `CLAUDE.md`:

- **Die Bindung auf `0.0.0.0` ist bis zum Cloudflare Tunnel Absicht.** Das lokale Netz
  ist über `ufw` auf `192.168.188.0/24` begrenzt, `COOKIE_SECURE` steht deshalb auf 0.
  **Beim Tunnel gehört beides zurück** – `-H 127.0.0.1` und `COOKIE_SECURE=1`. Ohne
  diese Notiz wird der Zustand entweder „repariert", solange er richtig ist, oder er
  bleibt, wenn er falsch geworden ist.
- **`except Exception` schluckt `BrokenPipeError`.** Ein Paket, dessen Abnehmer weggeht,
  wird sonst zu Ende gerechnet, läuft in die volle Rohrleitung und bleibt dort für
  immer stehen. Abbrüche gehören durchgereicht, nicht behandelt.
- **Eine Seite, die ohne Datenbank rendert, verdeckt einen Totalausfall.** Deshalb
  gehört in `tools/status.sh` eine echte Abfrage gegen die Datenbank mit den
  Zugangsdaten der Anwendung – nicht nur „Container läuft".

## 1. Der Lauf gehört systemd, nicht Node

**Kein Kindprozess aus der Anwendung heraus.** Der hinge am Webdienst: bei jedem
Neustart stirbt er mit oder bleibt als Waise zurück. Zwei gangbare Wege:

- `systemctl --user start kajoe-verarbeiten.service` aus der Anwendung, oder
- eine **Auslösedatei**: die Anwendung schreibt `/data/kajoe_bilder/.anstoss`, eine
  `systemd.path`-Einheit startet daraufhin den Dienst, der die Datei entfernt und
  loslegt

Der zweite Weg kommt ohne Prozessaufruf aus Node aus und ist deshalb vorzuziehen; wenn
etwas dagegen spricht, bitte melden.

Der Dienst führt **beides nacheinander** aus: erst einlesen, dann ableiten. Schlägt das
Einlesen fehl, läuft das Ableiten nicht an.

**Nur einer gleichzeitig.** Eine Sperre, die auch einen abgestürzten Vorgänger erkennt –
eine Sperrdatei, die niemand mehr aufräumt, blockiert sonst dauerhaft.

## 2. Der Knopf

Nur für **Verwalter**. Nicht wegen Missbrauch, sondern weil ein versehentlicher Klick
Stunden Rechenzeit auslöst.

**Vor dem Anstoßen zeigen, was gefunden wurde:** Anzahl Dateien in `eingang/` und deren
Größe. Genau der Abgleich, der am 31.08. einen fehlenden Jahrgang sichtbar gemacht hat.

**Warnen, wenn es nach einer laufenden Übertragung aussieht:** eine `.filepart` liegt
vor, oder die jüngste Datei ist jünger als eine Minute. Als Hinweis, nicht als Sperre –
der Mensch weiß es besser als die Heuristik.

**Ist `eingang/` leer**, erscheint kein Knopf, sondern der Satz, dass nichts da ist.

**Läuft gerade etwas**, ist der Knopf nicht anklickbar und es steht dabei, was passiert.

## 3. Fortschritt

`ingest_lauf` wird bisher erst am Ende geschrieben. Für eine Anzeige muss der Lauf
seinen Stand **während** der Arbeit fortschreiben – etwa alle 100 Dateien. Dasselbe für
den Ableitungslauf; falls der noch keine eigene Tabelle hat, braucht er eine oder eine
gemeinsame.

Die Anzeige zeigt: Schritt (einlesen / ableiten), verarbeitet von wie vielen,
verstrichene Zeit, geschätzte Restzeit.

**Die Restzeit wird gemessen, nicht geraten** – aus dem Tempo der letzten Minuten, nicht
aus einem festen Wert je Datei. Läuft er erst zwei Minuten, ist die Schätzung
entsprechend zu kennzeichnen.

Die Seite aktualisiert sich selbst. **Sie hält keine Anfrage offen** und ist für den
Lauf ohne Bedeutung: Browser schließen, Telefon weglegen, später nachsehen.

## 4. Bericht

Nach dem Lauf: gefunden, übernommen, Dubletten, Quarantäne, übersprungen, dazu die
Ableitungen mit erzeugt und fehlgeschlagen.

**Quarantänefälle und Fehler namentlich**, nicht nur gezählt – sonst weiß niemand,
welche Datei fehlt.

Die letzten Läufe bleiben einsehbar.

## 5. Ohne Oberfläche muss es weiter gehen

`tools/einlesen.sh` und `tools/ableiten.sh` bleiben von Hand aufrufbar. Wenn die
Weboberfläche nicht läuft, darf die Verarbeitung nicht davon abhängen.

---

## Prüfkriterien

- Betrachter: Knopf unsichtbar, Server Action und Route direkt angesprochen → abgewiesen
- Leeres `eingang/`: kein Knopf, sondern der Hinweis
- Ein paar Dateien hineinlegen: Anzahl und Größe stimmen mit `find` und `du` überein
- Eine `.filepart` anlegen → Warnung erscheint; entfernen → verschwindet
- **Lauf anstoßen, Browser schließen, nach zwei Minuten neu öffnen → er läuft weiter und
  die Anzeige stimmt.** Das ist der Kern des Auftrags
- **Webdienst während eines Laufs neu starten → der Lauf läuft weiter.** Das ist der
  Test, der zeigt, ob er wirklich systemd gehört
- Zweiter Anstoß während eines Laufs: abgewiesen, mit Begründung
- Sperrdatei von Hand anlegen und den zugehörigen Prozess beenden → der nächste Anstoß
  erkennt die verwaiste Sperre und läuft
- Bericht nach einem echten Lauf: Zahlen gehen auf, Quarantänefälle stehen namentlich da
- `tools/einlesen.sh` von Hand: funktioniert unverändert
- Nach dem Umbau von `DATABASE_URL`: Anwendung, Ingest und `tools/` kommen alle an die
  Datenbank – **jedes einzeln geprüft**, nicht nur die Anwendung

Nach jedem Schritt berichten, was tatsächlich geprüft wurde – nicht nur, dass der
Befehl ohne Fehler durchlief.
