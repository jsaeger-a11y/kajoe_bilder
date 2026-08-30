# Auftrag Phase 2a – Grundgerüst, Anmeldung, Benutzerverwaltung

Ziel: Eine Next.js-Anwendung auf `127.0.0.1:3000`, an der man sich anmelden kann, mit
Benutzerverwaltung für Verwalter. Am Ende gibt es zwei Konten, und ein Betrachter kommt
nachweislich nicht an die Verwaltungsseiten.

**Nicht Teil dieses Auftrags:** Galerie, Bildanzeige, Auswahllisten, Karte, Download.
Das ist 2b und später. Es genügt eine Übersichtsseite, die den angemeldeten Namen und
die Rolle zeigt.

Grundlage ist `CLAUDE.md`, besonders der Abschnitt „Zugriff". Bei Widersprüchen gilt
`CLAUDE.md`; bitte melden statt still entscheiden.

---

## 1. Grundgerüst

Next.js 16 unter `web/`, App Router, TypeScript. Hört auf `127.0.0.1:3000` – **nicht**
auf `0.0.0.0`. Später steht ein Cloudflare Tunnel davor.

- Proxy-Header `X-Forwarded-For` und `X-Forwarded-Proto` auswerten
- Keine absoluten URLs mit Hostnamen, nur relative Pfade
- Datenbankzugang aus `.env`, dieselbe Datei wie der Ingest

## 2. Migration 003 – Sitzungen

Als neue nummerierte Datei, eingespielt über `tools/migrieren.sh`.

**Vorher entscheiden und die Entscheidung begründen:** Auth.js unterstützt beim
Credentials-Provider keine Datenbanksitzungen, sondern nur JWT. Damit gibt es zwei
Wege – Auth.js mit JWT, oder eine eigene, sehr kleine Sitzungsverwaltung mit Tabelle.
Für drei Benutzer ist die zweite Variante überschaubar und durchsichtiger, aber das ist
keine Vorgabe. Was gewählt wird, gehört mit Begründung in `web/LIESMICH.md`.

Bei einer eigenen Tabelle: Kennung als Zufallswert ausreichender Länge, Ablaufdatum,
Benutzerbezug, angelegt am. Abgelaufene Sitzungen im vorhandenen Aufräumlauf entfernen.

## 3. Anmeldung

**Passwörter mit argon2id.** Nie im Klartext, nie umkehrbar gehasht, nie in ein Log.

**Das erste Konto entsteht über ein Skript, nicht über eine Webseite.** Es gibt keine
offene Registrierung, und eine Seite „ersten Verwalter anlegen" wäre eine Tür, die
jemand findet, bevor du sie schließt. Also `tools/benutzer.sh` oder ein
Node-Skript: anlegen, Passwort setzen, Rolle setzen, abschalten.

**Cookie:** `HttpOnly`, `SameSite=Lax`, und `Secure`.

> **Achtung, hier steckt eine Falle.** `Secure` bedeutet: nur über HTTPS. Im lokalen
> Netz läufst du über `http://webspace:3000`, und dann kommt das Cookie nie an – die
> Anmeldung schlägt scheinbar grundlos fehl. `localhost` gilt als sicherer Kontext,
> ein Hostname im LAN nicht.
>
> Also `Secure` über eine Umgebungsvariable schaltbar machen, **Vorgabe an**. Und die
> Anwendung schreibt beim Start eine deutliche Zeile ins Log, wenn sie ohne läuft –
> sonst bleibt die Einstellung nach dem Tunnel still aus, und das merkt niemand.

**Anmeldeversuche festhalten, Passwörter nie** – auch nicht gekürzt, auch nicht
gehasht. Jeder Ausgang wird vermerkt, der erfolgreiche mit. Die Adresse kommt aus
`CF-Connecting-IP`, ersatzweise aus dem **ersten** Eintrag von `X-Forwarded-For`.

**Fehlversuche zählen** (`benutzer.fehlversuche`), auf null zurücksetzen beim nächsten
Erfolg. Nach einer festzulegenden Zahl sperren – die Schwelle steht an **einer** Stelle
im Code.

**Die Anmeldeseite sagt nicht, worum es geht.** Keine Namen, keine Familie, keine
Fotos – weder im Text noch im Titel noch in den Metaangaben, auch nicht im
Wurzel-Layout, dessen Titel dort durchschlägt. Kein Impressum.

**Die Fehlermeldung unterscheidet nicht** zwischen „Benutzer gibt es nicht" und
„Passwort falsch". Sonst lässt sich von außen herausfinden, welche Konten existieren.

## 4. Benutzerverwaltung

Nur für Verwalter. Anlegen, Rolle ändern, Passwort zurücksetzen, **abschalten statt
löschen** (`aktiv`) – sonst verwaisen später die Auswahllisten.

Jeder ändert sein eigenes Passwort selbst, dafür braucht es keinen Verwalter.

**Die Rollenprüfung steht in jeder Seite, jeder Server Action und jeder Route**, nicht
nur im Menü. Ein ausgeblendeter Menüpunkt ist keine Prüfung; ein altes Lesezeichen
käme sonst durch. Eine gemeinsame Funktion dafür, an einer Stelle.

## 5. Aufräumen

Anmeldeversuche nach 90 Tagen entfernen, abgelaufene Sitzungen ebenso. IP-Adressen sind
personenbezogene Daten. Als Skript in `tools/`, Timer kommt später.

## 6. Dienst

`systemd/kajoe-web.service` als Benutzerdienst, wie die Sicherung. **Node kennt
`~/.bashrc` nicht** – der Dienst braucht den vollen Pfad oder `Environment=PATH=…`.

---

## Prüfkriterien

Mit Zahlen oder Nachweis zu beantworten:

- Zwei Konten angelegt: ein Verwalter, ein Betrachter
- Anmeldung mit richtigem Passwort gelingt, mit falschem nicht
- **Nach drei Fehlversuchen und einem Erfolg steht `fehlversuche` wieder auf 0**
- `SELECT * FROM anmeldeversuch` enthält **kein** Passwortfragment – die Tabelle einmal
  vollständig ansehen, nicht nur die Spaltennamen
- Ein Versuch mit einem **nicht existierenden** Benutzernamen hinterlässt eine Zeile
- Die Fehlermeldung ist bei „gibt es nicht" und „falsches Passwort" identisch
- **Als Betrachter angemeldet die Verwaltungsseite direkt über die Adresse aufrufen** →
  abgewiesen. Ebenso die zugehörige Server Action und Route direkt ansprechen
- Cookie-Kennzeichen im Browser nachsehen: `HttpOnly`, `SameSite=Lax`, `Secure` je nach
  Einstellung
- Quelltext der Anmeldeseite ansehen: kein Hinweis auf Fotos, Familie oder Namen, auch
  nicht im `<title>` und nicht in den Metaangaben
- Dienst neu gestartet → Anmeldung funktioniert weiter
- Ein abgeschaltetes Konto (`aktiv = false`) kommt nicht mehr hinein

Nach jedem Schritt berichten, was tatsächlich geprüft wurde – nicht nur, dass der
Befehl ohne Fehler durchlief.
