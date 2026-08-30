# auftrag-phase0.md

Ziel: Phase 0 abschließen. Datenbank läuft, Repo steht, Sicherung greift.

Nicht Teil dieses Auftrags: Ingest, Weboberfläche, alles unter /data/kajoe_bilder.

1. docker-compose.yml — PostgreSQL 17, gebunden an 127.0.0.1:5432,
   Datenverzeichnis als benanntes Volume, restart: unless-stopped
2. .env mit den Zugangsdaten, .env.beispiel ohne sie
3. .gitignore: .env, node_modules/, .next/, __pycache__/, *.pyc
4. git init, erster Commit — gezielt mit git add <datei>, nie git add -A
5. db/migrations/001-grundschema.sql einspielen, Ergebnis prüfen
6. tools/sicherung.sh: pg_dump nach ~/kajoe_bilder/sicherung/,
   14 Tage aufbewahren, älteres löschen
7. systemd/kajoe-sicherung.{service,timer} für 03:00 Uhr
8. tools/status.sh: Container, Tabellenzeilen, Plattenplatz, letzte Sicherung

Nach jedem Schritt prüfen, ob er tatsächlich gewirkt hat — nicht nur, ob der
Befehl ohne Fehler durchlief.

Wichtig:
- Postgres bindet an 127.0.0.1:5432, nicht 0.0.0.0. Docker schreibt eigene
  iptables-Regeln; ohne die Adresse davor steht der Port am ufw vorbei offen.
- Der Timer läuft als Benutzerdienst (systemctl --user), weil das
  Sicherungsverzeichnis im Home liegt. Dafür ist einmalig
  `loginctl enable-linger jsaeger` nötig, sonst hält systemd die
  Benutzerdienste nach dem Abmelden an und der Timer feuert nie.