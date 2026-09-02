# Auftrag – Nachträge nach dem Plattenumzug

Kleiner Auftrag, drei Punkte. Kein neuer Baustein.

---

## 1. `CLAUDE.md` und `docs/anforderungen.md`: die neue Plattenaufteilung

Der Bestand ist auf eine eigene 1-TB-SSD umgezogen. Was dort bisher steht – ein
250-GB-Logical-Volume in `ubuntu-vg`, eingehängt unter `/data/kajoe_bilder` – stimmt
nicht mehr.

Neu:

```
/dev/sda1, 1 TB SSD, ext4, Label »daten«
UUID 13abc672-a8df-4ea7-b379-55ebbb8808ac
eingehaengt unter /data, Reserve auf 1 % gesenkt
```

- **`/data` ist der Einhängepunkt**, nicht mehr `/data/kajoe_bilder`. Die Projekte
  liegen als Unterverzeichnisse darin, `/data/kajoe_bilder` ist ein gewöhnlicher Ordner
- **Kein LVM auf dieser Platte.** Ein Volume je Projekt wäre nur eine
  Größenbeschränkung, die man später mühsam nachjustiert; auf einer eigenen Datenplatte
  konkurriert nichts mit dem System
- Der Preis: Ein Projekt kann die Platte für alle vollaufen lassen. Bei 1 TB und
  Hobbyprojekten überschaubar, und `tools/status.sh` zeigt den Platz
- Die Systemplatte (476 GB NVMe) trägt weiterhin `/` mit 100 GB in `ubuntu-vg`
- Das alte LV `ubuntu-vg/kajoe_bilder` (250 GB) **existiert noch** und ist in
  `/etc/fstab` auskommentiert. Es wird erst entfernt, wenn der neue Zustand ein paar
  Tage getragen hat – bis dahin ist es die Rückfalltür

Belegt nach dem Umzug: 116 GB von 916 GB, 55.190 Dateien, gegengeprüft auf beiden
Seiten. Die Hardlinks zwischen `eingang` und `original` haben den `rsync -aHAX`
überstanden (sonst stünden dort 124 GB statt 116).

## 2. Die beiden erwarteten Warnungen benennen

`tools/status.sh` meldet zwei Dinge als Auffälligkeit, die derzeit **richtig** sind:

- `0.0.0.0:3000 – ACHTUNG: nicht auf 127.0.0.1 gebunden`
- `COOKIE_SECURE 0 – Sitzungscookie OHNE Secure`

Beides ist der gewollte Zustand, bis der Cloudflare Tunnel kommt (etwa drei Monate).
Das lokale Netz ist über `ufw` auf `192.168.188.0/24` begrenzt.

In `CLAUDE.md` gehört dazu ein Satz, der beides zusammenhält: **erwartet bis zum
Tunnel, danach zurückzustellen.** Ohne ihn passiert eines von zwei Dingen – jemand
„repariert" den Zustand, solange er richtig ist, oder er bleibt, wenn er falsch geworden
ist.

Die Warnungen selbst bleiben stehen. Sie sollen weiter auffallen.

## 3. `SuccessExitStatus=143` für `kajoe-web`

Der Dienst geht bei jedem normalen Stopp auf `failed`, weil Next SIGTERM abfängt und
mit 143 endet. Beim Plattenumzug stand er wieder so da.

Ein Dienst, der im Normalbetrieb `failed` meldet, macht die Zustandsanzeige wertlos –
irgendwann sieht niemand mehr hin, und dann fällt ein echter Fehlschlag durch. Also
`SuccessExitStatus=143` in die Unit, und danach einmal stoppen und starten, um zu
sehen, dass er sauber auf `inactive` geht.

---

## Prüfkriterien

- `tools/nachneustart.sh` läuft durch und prüft den Einhängepunkt `/data` (nicht mehr
  `/data/kajoe_bilder`)
- `tools/status.sh` zeigt die Plattenbelegung richtig
- `systemctl --user stop kajoe-web` → `inactive`, nicht `failed`; danach wieder starten
  und die Weboberfläche aufrufen
- Ein Bild in der Galerie ansehen – die Ableitungen kommen von der neuen Platte
- Die Angaben in `CLAUDE.md` gegen `lsblk`, `df -h` und `/etc/fstab` prüfen, nicht
  gegen diesen Auftrag

Nach jedem Schritt berichten, was tatsächlich geprüft wurde – nicht nur, dass der Befehl
ohne Fehler durchlief.
