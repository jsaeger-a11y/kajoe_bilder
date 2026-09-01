# betrieb – Dateien, die als root nach `/etc` gehören

Wie `systemd/` sind das hier **Kopien im Repository**. Aktiv ist erst, was
kopiert wurde.

Der Unterschied zu `systemd/`: diese Dateien brauchen `root`. Auf `webspace`
hat `jsaeger` kein Sudo ohne Passwort, deshalb kann kein Skript und keine
Sitzung sie von selbst aufspielen. Sie liegen hier fertig, mit den Befehlen
darunter.

---

## `52-kajoe-sicherheit` – Sicherheitsupdates mit Neustart

Ziel: Sicherheitsstände werden von selbst eingespielt, und wenn einer einen
Neustart braucht, bekommt er ihn – nachts, nach Sicherung und Aufräumlauf.

**Eine eigene Datei, keine Änderung an `50unattended-upgrades`.** Die
Stockdatei gehört dem Paket. Wer sie bearbeitet, bekommt beim nächsten
Paketwechsel eine Rückfrage, welche Fassung gelten soll – und beantwortet sie
irgendwann falsch. Dateien in `apt.conf.d` werden in Namensreihenfolge
gelesen; `52` kommt nach `50` und gewinnt.

### Aufspielen

```bash
sudo install -o root -g root -m 644 \
     betrieb/52-kajoe-sicherheit /etc/apt/apt.conf.d/52-kajoe-sicherheit
```

### Prüfen

```bash
# Was gilt jetzt wirklich? Muss GENAU drei Quellen zeigen, alle mit -security,
# und keine Zeile "${distro_id}:${distro_codename}".
apt-config dump | grep -E 'Allowed-Origins::|Automatic-Reboot'

sudo unattended-upgrade --dry-run --verbose
systemctl list-timers apt-daily-upgrade.timer
```

Die Wirkung lässt sich **vor** dem Aufspielen ansehen, ohne root:

```bash
apt-config dump -c betrieb/52-kajoe-sicherheit | grep -E 'Allowed-Origins::|Automatic-Reboot'
```

### Warum `#clear` in der Datei steht

Eine Gruppe in einer apt-Konfiguration **ergänzt** die vorhandene Liste, sie
ersetzt sie nicht. Ohne `#clear Unattended-Upgrade::Allowed-Origins;` stünde
die Vorgabe aus `50unattended-upgrades` weiter drin – darunter
`"${distro_id}:${distro_codename}"`, die Veröffentlichungsquelle, die eben
keine Sicherheitsquelle ist.

Nachgemessen mit derselben Datei einmal mit und einmal ohne die Zeile:

| | Quellen laut `apt-config dump` |
|---|---|
| mit `#clear` | 3 – alle `-security` |
| ohne `#clear` | 7 – die vier alten plus die drei neuen |

Man sieht der Datei nicht an, dass sie nichts bewirkt. Nur `apt-config dump`
sagt es.

### Zeitpunkt

`Automatic-Reboot-Time "03:45"` in **Ortszeit des Rechners** – die Systemzeit
ist UTC (siehe `CLAUDE.md`), also 03:45 UTC. Die Reihenfolge in der Nacht:

| | |
|---|---|
| 03:00 (+ ≤ 5 min) | `kajoe-sicherung.timer` – `pg_dump` |
| 03:20 (+ ≤ 2 min) | `kajoe-aufraeumen.timer` – löscht Dateien |
| 03:45 | Neustart, falls einer aussteht |
| 06:00 (+ ≤ 60 min) | `apt-daily-upgrade.timer` – spielt ein |

**Der Neustart kommt nicht am selben Tag wie das Einspielen.**
`unattended-upgrades` läuft um 06:00–07:00; braucht ein Stand einen Neustart,
wird der für das nächste 03:45 vorgemerkt – also gut zwanzig Stunden später.
Das ist gewollt: nachts stört er niemanden. Wer es schneller braucht, startet
von Hand neu.

### Danach

```bash
tools/nachneustart.sh      # kommt alles von selbst wieder?
```

Einmal **vor** einem geplanten Neustart aufrufen, damit der Zähler für
`Unsafe Shutdowns` einen Vergleichswert hat:

```bash
sudo tools/nachneustart.sh --merken
```

---

## Was hier bewusst nicht steht

Die **Verarbeitung** wird nicht automatisiert. Ein Timer, der nachsieht, ob
etwas in `eingang/` liegt, müsste raten, ob eine Übertragung fertig ist – der
Knopfdruck aus Phase 4 ist der Beleg dafür, dass sie es ist.
