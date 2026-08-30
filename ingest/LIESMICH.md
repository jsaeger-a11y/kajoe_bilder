# ingest – Einlesen und Katalogisieren (Phase 1a)

Liest Dateien aus `/data/kajoe_bilder/eingang/`, legt sie unter
`original/<jahr>/<monat>/<sha256>.<endung>` ab und traegt sie in `bild` ein.
Ableitungen – Vorschau, Ansicht, Wiedergabefassung – sind **nicht** Teil davon;
das ist Phase 1b.

## Aufrufen

```bash
tools/einlesen.sh                 # regulaerer Lauf
tools/einlesen.sh --trockenlauf   # nichts anfassen, nur berichten
tools/einlesen.sh --grenze 50     # nur die ersten 50 Dateien
tools/einlesen.sh --quelle 'OneDrive – Zweitkonto'
```

Mehrfach ausfuehrbar. Ein zweiter Lauf ueber denselben Bestand legt nichts
doppelt an – erkannt wird ausschliesslich ueber den SHA-256 des **Inhalts**,
nie ueber den Dateinamen.

Noch **kein** systemd-Timer. Der kommt, wenn der Lauf ueber mehrere Jahrgaenge
erprobt ist.

## Aufbau

| Datei | Inhalt |
|---|---|
| `lauf.py` | Durchlauf, Reihenfolge, Buchfuehrung, Bericht |
| `metadaten.py` | exiftool im Stapelbetrieb |
| `einordnen.py` | Dateityp, Herkunft, Zeit, Ort – die Fachlogik, ohne Dateien und ohne Datenbank pruefbar |
| `datenbank.py` | Verbindung aus `.env`, Gegenprobe ueber eine zweite Verbindung |

## Die Reihenfolge beim Ablegen

1. **Hardlink** von `eingang/…` nach `original/<jahr>/<monat>/<sha256>.<endung>`
2. Datenbankzeile schreiben und **committen**
3. Erst danach die Datei aus `eingang/` loesen

Naheliegend waere, zuerst zu verschieben. Bricht der Lauf dann zwischen
Verschieben und Zeile ab, liegt die Datei am Ziel und ist in keiner Tabelle
verzeichnet – der naechste Lauf findet sie in `eingang/` nicht mehr und merkt
nichts davon. In dieser Reihenfolge bleibt sie liegen und der naechste Lauf
macht weiter. Beide Orte liegen auf demselben Dateisystem, der Hardlink kostet
also weder Platz noch Zeit.

## Umgebung einrichten

`python3-venv` ist auf `webspace` **nicht** installiert und `sudo` verlangt ein
Passwort, deshalb entsteht die Umgebung ohne `ensurepip`:

```bash
python3 -m venv --without-pip ingest/.venv

# pip einmalig aus dem Rad bootstrappen (ein Rad, kein Skript aus dem Netz)
curl -sSLO https://files.pythonhosted.org/packages/f3/6e/1736e5b4ae2b778ef2f81c47d797de9f891d4d8acb047a24ca37a60294dd/pip-26.2.1-py3-none-any.whl
ingest/.venv/bin/python pip-26.2.1-py3-none-any.whl/pip install --no-index pip-26.2.1-py3-none-any.whl

ingest/.venv/bin/python -m pip install -r ingest/anforderungen.txt
```

Sobald `sudo apt install python3.14-venv` moeglich ist, reicht wieder das
uebliche `python3 -m venv ingest/.venv`.

Ausserhalb der Umgebung gebraucht: **exiftool** (13.50) aus den Paketquellen.

## Was beim Auswerten leicht schiefgeht

**Der Zeitstempel im OneDrive-Dateinamen ist UTC, nicht Ortszeit.**
Nachgemessen am Bestand 2026: bei allen 587 Bildern, die sowohl
`DateTimeOriginal` als auch `OffsetTimeOriginal` tragen, gilt ausnahmslos
`DateTimeOriginal = Dateiname + Zeitversatz`. Wer die Ziffern als Ortszeit
nimmt, legt ein Bild von Silvester 00:30 Berliner Zeit als 31.12. 23:30 ab –
genau der Fehler, den `CLAUDE.md` ausschliesst. Android-Namen (`IMG_`, `PXL_`)
tragen dagegen Ortszeit; welches Muster wie gemeint ist, steht in
`einordnen.MUSTER`.

**`exiftool -G0` ist Pflicht.** Ohne Gruppenpraefix liefert exiftool fuer
`GPSLatitude` den *Composite*-Wert, der bereits vorzeichenbehaftet ist. Mit
`-G0` stehen `EXIF:GPSLatitude` (Betrag) und `Composite:GPSLatitude`
(vorzeichenbehaftet) nebeneinander. Ausgewertet wird der EXIF-Wert plus
`GPSLatitudeRef`; `S` und `W` sind negativ.

**Dieselbe Angabe steht je nach Format in einer anderen Gruppe.** Bildmasse
liegen bei HEIC und JPEG unter `File:`, bei Videos unter `QuickTime:`, bei PNG
unter `PNG:`. Eine feste Gruppenliste laesst genau ein Format still leer –
beim ersten Anlauf waren das die 70 PNG mit `breite IS NULL`. Dafuer gibt es
`metadaten.wert_beliebig()`.

**exiftool je Datei einzeln aufzurufen ist zu langsam.** Der Programmstart
kostet mehr als das Auslesen. Hier laufen 200 Dateien je Aufruf, die Liste
geht ueber die Standardeingabe.

## Zeitquellen

Rangfolge `exif` → `dateiname` → `ordner` → `dateizeit`; welche gegriffen hat,
steht in `bild.zeitquelle`.

`aufnahme_lokal` ist immer belegt und immer massgeblich. `aufnahme_utc` wird
nur gesetzt, wo die UTC-Zeit wirklich bekannt ist. `zeitversatz` **nur**, wo
ihn das Geraet selbst geschrieben hat. Steht also `zeitquelle = 'dateiname'`
und `zeitversatz IS NULL`, heisst das: die UTC-Zeit ist sicher, die Ortszeit
beruht auf der Annahme `Europe/Berlin` (`einordnen.ZONE`).
