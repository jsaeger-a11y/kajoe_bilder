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
cp systemd/kajoe-sicherung.service systemd/kajoe-sicherung.timer ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now kajoe-sicherung.timer
```

## Pruefen

```bash
loginctl show-user jsaeger | grep Linger     # muss Linger=yes sagen
systemctl --user list-timers kajoe-sicherung.timer
systemctl --user start kajoe-sicherung.service   # Lauf von Hand
journalctl --user -u kajoe-sicherung.service -n 30
```

## Nach Aenderungen

Die Dateien hier bearbeiten, dann erneut nach `~/.config/systemd/user/`
kopieren und `systemctl --user daemon-reload` aufrufen. Eine Aenderung nur im
Repository wirkt nicht.
