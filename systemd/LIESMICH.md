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
   systemd/kajoe-web.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now kajoe-sicherung.timer
systemctl --user enable --now kajoe-web.service
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
```

## Nach Aenderungen

Die Dateien hier bearbeiten, dann erneut nach `~/.config/systemd/user/`
kopieren und `systemctl --user daemon-reload` aufrufen. Eine Aenderung nur im
Repository wirkt nicht.
