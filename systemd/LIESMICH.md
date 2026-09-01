# systemd

Die Dateien hier sind die **Kopien im Repository**. Aktiv sind die Kopien unter
`~/.config/systemd/user/`.

Der Timer laeuft als **Benutzerdienst**, nicht als Systemdienst: das
Sicherungsverzeichnis liegt im Home und der Docker-Zugriff haengt an der
Gruppenmitgliedschaft von `jsaeger`.

## Einrichten

```bash
# Einmalig: sonst haelt systemd die Benutzerdienste beim Abmelden an
# und der Timer feuert nie.
loginctl enable-linger jsaeger

mkdir -p ~/.config/systemd/user
cp systemd/kajoe-sicherung.service systemd/kajoe-sicherung.timer \
   systemd/kajoe-aufraeumen.service systemd/kajoe-aufraeumen.timer \
   systemd/kajoe-verarbeiten.service systemd/kajoe-verarbeiten.path \
   systemd/kajoe-web.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now kajoe-sicherung.timer
systemctl --user enable --now kajoe-aufraeumen.timer
systemctl --user enable --now kajoe-web.service
systemctl --user enable --now kajoe-verarbeiten.path
```

`kajoe-verarbeiten.path` wacht über `/data/kajoe_bilder/.anstoss`. Taucht die
Datei auf, startet `kajoe-verarbeiten.service` und entfernt sie als Erstes.
Der Dienst selbst wird **nicht** aktiviert – er wird nur ausgelöst.

`kajoe-aufraeumen.timer` läuft täglich um 03:20 UTC – **nach** der Sicherung
um 03:00, damit der Dump von heute Nacht noch den Stand vor dem Löschen
enthält. Ob der Lauf wirklich löscht oder nur zählt, steht in der `.env`
(`AUFRAEUMEN_SCHARF`) und **nicht** in der Unit: die Umstellung soll eine Zeile
sein und kein `daemon-reload`, den jemand vergisst.

**In den Einheiten steht `StartLimitIntervalSec=0`, und das ist kein
Beiwerk.** Ohne die Zeile greift systemds Startbegrenzung (fünf Starts in zehn
Sekunden). Danach steht nicht nur der Dienst auf `start-limit-hit`, sondern die
**path-Einheit selbst geht auf `failed`** und wacht überhaupt nicht mehr – beim
nächsten Anstoß passiert dann gar nichts, ohne jede Meldung in der Oberfläche.
Nachgemessen am 31.08.2026 nach vier Anstößen binnen Sekunden; zurück ging es
nur mit `systemctl --user reset-failed`.

**Und die Zeile gehört in `[Unit]`, nicht in `[Service]`.** Im falschen
Abschnitt wird sie stillschweigend verworfen; die einzige Spur ist eine Zeile
`Unknown key 'StartLimitIntervalSec' in section [Service], ignoring` im
Journal, die niemand liest. Genau so stand sie zuerst in
`kajoe-aufraeumen.service`. Gegenprobe:

```bash
systemctl --user show kajoe-aufraeumen.service -p StartLimitIntervalUSec
# muss 0 sagen, nicht 10s
```

`kajoe-web.service` braucht vorher einmal `npm run build` in `web/`. Node liegt
unter `~/.local/node/bin` und steht deshalb ausdruecklich im `PATH` der
Dienstdatei – **systemd kennt `~/.bashrc` nicht**.

## Pruefen

```bash
loginctl show-user jsaeger | grep Linger     # muss Linger=yes sagen
systemctl --user list-timers kajoe-sicherung.timer
systemctl --user start kajoe-sicherung.service   # Lauf von Hand
journalctl --user -u kajoe-sicherung.service -n 30

systemctl --user status kajoe-web.service
journalctl --user -u kajoe-web.service -n 30     # zeigt auch die Cookie-Zeile
curl -sI http://127.0.0.1:3000/anmelden | head -1

systemctl --user status kajoe-verarbeiten.path   # muss "active (waiting)" sein
journalctl --user -u kajoe-verarbeiten.service -n 40
echo 1 > /data/kajoe_bilder/.anstoss             # Anstoss von Hand

systemctl --user list-timers kajoe-aufraeumen.timer
systemctl --user start kajoe-aufraeumen.service   # Lauf von Hand, Modus aus .env
journalctl --user -u kajoe-aufraeumen.service -n 40
tools/status.sh                                   # zeigt die letzten Laeufe
```

**Der Aufräumlauf ist der einzige Vorgang, der Dateien wirklich entfernt.**
Deshalb zwei Sicherungen, die nichts kosten: er startet im Probelauf
(`AUFRAEUMEN_SCHARF=0`), und er bricht ab, wenn er auf einmal mehr als 2.500
Dateien fällig findet. Beides ist in `ingest/LIESMICH.md` beschrieben.

## Nach Aenderungen

Die Dateien hier bearbeiten, dann erneut nach `~/.config/systemd/user/`
kopieren und `systemctl --user daemon-reload` aufrufen. Eine Aenderung nur im
Repository wirkt nicht.
