#!/usr/bin/env python3
"""ingest/gesichter.py – Gesichter finden, bewerten, gruppieren, berichten.

Phase 9a. Ohne Oberflaeche: am Ende steht ein Bericht mit Zahlen und je
Haeufchen ein Blatt mit Beispielausschnitten. Ob eine Gruppierung taugt, kann
niemand an einer Zahl ablesen – nur am Ansehen.

Zwei Modelle, lokal ueber onnxruntime, kein Bild verlaesst den Server:
RetinaFace findet Gesichter, ArcFace macht aus jedem einen Vektor. Zwei
Vektoren nah beieinander heisst: wahrscheinlich dieselbe Person.

    tools/gesichter.sh [--grenze N] [--nur-gruppieren] [--neu-gruppieren] [--nur-bericht]

**Gerechnet wird auf der Ansichtsfassung** (~1600 px), nicht auf dem Original.
Das spart das Dekodieren von HEIC und reicht fuer Gesichter; die Kaesten in
`gesicht.kasten` beziehen sich darauf.

**Wiederholbar, ohne Arbeit zu zerstoeren.** Ein Bild gilt als bearbeitet,
sobald `bild.gesichter_am` gesetzt ist – Fortschritt am Datensatz. Ein neuer
Lauf nimmt nur Unbearbeitetes. Neue Funde werden erst gegen die vorhandenen
Haeufchen geprueft und nur, wenn keines passt, untereinander gruppiert. Was
ein Mensch zugeordnet hat (`person_id`), fasst kein Lauf an.
"""

from __future__ import annotations

import argparse
import os
import resource
import socket
import sys
import time
import warnings
from dataclasses import dataclass
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))

from datenbank import verbindung  # noqa: E402
import gruppieren  # noqa: E402

DATEN = Path("/data/kajoe_bilder")
MODELLE = DATEN / "modelle" / "insightface"
BELEGE = DATEN / "probe" / "gruppen"
MODELL = "insightface buffalo_l (det_10g + w600k_r50)"

# Hersteller-Hinweis auf eine veraltete scikit-image-Funktion in insightface –
# nichts, was hier zu tun waere.
warnings.filterwarnings("ignore", category=FutureWarning)


# ---------------------------------------------------------------------------
# DIE SCHWELLEN – an einer Stelle, sonst nirgends
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class Schwellen:
    """Eingestellt am Piloten (60 Bilder Voraberhebung, dann 5.000).

    Qualitaet vor der Gruppierung: nur Funde, die alle vier Grenzen
    unterschreiten bzw. ueberschreiten, bilden Haeufchen. Ein verwackeltes
    Profil im Hintergrund liegt sonst in der Mitte zwischen mehreren Personen
    und verbindet sie zu einem einzigen Haeufchen.
    """
    # Detektor-Guete (0..1). P25 der Voraberhebung lag bei 0,6.
    guete: float = 0.70
    # Kuerzere Kastenseite in Bildpunkten der Ansicht. Darunter traegt der
    # Vektor wenig; P25 lag bei 48 px.
    groesse: int = 40
    # Laplace-Varianz des Ausschnitts. P10 lag bei 168, verwackelte weit darunter.
    schaerfe: float = 100.0
    # Kopfhaltung in Grad. Profile (|Gier| gross) tragen einen anderen Vektor
    # als Frontalaufnahmen derselben Person.
    gier: float = 35.0
    nick: float = 30.0

    # Kosinus, ab dem zwei taugliche Funde als Nachbarn gelten. STRENG gewaehlt:
    # lieber zu viele Haeufchen als zu wenige – drei Haeufchen fuehrt der
    # Mensch in 9b mit drei Klicks zusammen, zwei verschmolzene Personen
    # benennt er falsch und merkt es erst beim Durchsehen.
    nachbar: float = 0.55
    # So viele Nachbarn braucht ein Fund, um ein Kern zu sein. Mit 2 besteht
    # das kleinste Haeufchen aus drei Funden, die sich gegenseitig stuetzen.
    mindest_stuetzen: int = 2
    # Kosinus zum Mittelvektor, ab dem ein tauglicher Fund einem VORHANDENEN
    # Haeufchen zugeordnet wird (zweiter Lauf, neue Bilder).
    zuordnung: float = 0.55
    # Dasselbe fuer UNTAUGLICHE Funde – strenger, denn ihr Vektor ist
    # unsicherer. Passt keiner, bleiben sie ohne Haeufchen.
    zuordnung_streng: float = 0.62


SCHWELLEN = Schwellen()


def tauglich(guete: float, groesse: int, schaerfe: float | None,
             nick: float | None, gier: float | None) -> bool:
    s = SCHWELLEN
    return (guete >= s.guete and groesse >= s.groesse
            and (schaerfe is None or schaerfe >= s.schaerfe)
            and (gier is None or abs(gier) <= s.gier)
            and (nick is None or abs(nick) <= s.nick))


# ---------------------------------------------------------------------------
# Kleinkram
# ---------------------------------------------------------------------------

def temperatur() -> float | None:
    """Paket-Temperatur des Prozessors in Grad – ueber den Typ gesucht, nicht
    ueber die Nummer der Zone; die Nummern wechseln zwischen Kernen."""
    for zone in Path("/sys/class/thermal").glob("thermal_zone*"):
        try:
            if (zone / "type").read_text().strip() == "x86_pkg_temp":
                return int((zone / "temp").read_text()) / 1000
        except OSError:
            continue
    return None


def boot_kennung() -> str | None:
    try:
        return Path("/proc/sys/kernel/random/boot_id").read_text().strip() or None
    except OSError:
        return None


def ansichtspfad(jahr: int, monat: int, sha256: str) -> Path:
    return DATEN / "abgeleitet" / f"{jahr:04d}" / f"{monat:02d}" / f"{sha256}-ansicht.jpg"


def rss_mb() -> float:
    return resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024


# ---------------------------------------------------------------------------
# Erkennen
# ---------------------------------------------------------------------------

def modell_laden():
    import cv2  # noqa: F401 – nur, damit ein fehlendes cv2 hier auffaellt
    from insightface.app import FaceAnalysis
    app = FaceAnalysis(name="buffalo_l", root=str(MODELLE),
                       providers=["CPUExecutionProvider"])
    app.prepare(ctx_id=-1, det_size=(640, 640))
    return app


def erkennen(conn, app, lauf_id: int, grenze: int) -> tuple[int, int, float, float | None]:
    """Unbearbeitete Bilder durch den Detektor. Gibt (bilder, gesichter,
    sekunden_je_bild, temperatur_max) zurueck."""
    import cv2

    with conn.cursor() as cur:
        cur.execute(
            """SELECT id::int, jahr, monat, sha256
                 FROM bild
                WHERE gesichter_am IS NULL AND typ = 'bild'
                  AND geloescht_am IS NULL AND vorschau_erzeugt
                -- deterministisch durchmischt: ein Pilot ueber "die ersten
                -- 5.000 Kennungen" waere ein einziger Jahrgang
                ORDER BY md5(sha256)
                LIMIT %s""",
            (grenze if grenze > 0 else None,),
        )
        bilder = cur.fetchall()
        cur.execute("UPDATE gesichtslauf SET bilder_geplant = %s WHERE id = %s",
                    (len(bilder), lauf_id))

    print(f"{len(bilder)} Bild(er) zu bearbeiten")
    t_start = time.time()
    gesichter_gesamt = 0
    temp_max: float | None = None

    for n, (bild_id, jahr, monat, sha256) in enumerate(bilder, start=1):
        pfad = ansichtspfad(jahr, monat, sha256)
        img = cv2.imread(str(pfad))
        funde = []
        if img is not None:
            for f in app.get(img):
                x1, y1, x2, y2 = (int(round(v)) for v in f.bbox)
                x1, y1 = max(0, x1), max(0, y1)
                x2, y2 = min(img.shape[1], x2), min(img.shape[0], y2)
                if x2 <= x1 or y2 <= y1:
                    continue
                ausschnitt = cv2.cvtColor(img[y1:y2, x1:x2], cv2.COLOR_BGR2GRAY)
                schaerfe = float(cv2.Laplacian(ausschnitt, cv2.CV_64F).var())
                pose = getattr(f, "pose", None)
                nick, gier, roll = (float(pose[0]), float(pose[1]), float(pose[2])) \
                    if pose is not None else (None, None, None)
                funde.append((
                    [x1, y1, x2, y2], float(f.det_score),
                    [float(v) for v in f.normed_embedding],
                    min(x2 - x1, y2 - y1), schaerfe, nick, gier, roll,
                ))

        # Funde und Markierung in EINER Transaktion: stirbt der Prozess
        # dazwischen, gaebe es sonst Funde ohne Markierung, und der naechste
        # Lauf legte sie ein zweites Mal an.
        with conn.transaction():
            with conn.cursor() as cur:
                for kasten, guete, vektor, groesse, schaerfe, nick, gier, roll in funde:
                    cur.execute(
                        """INSERT INTO gesicht
                               (bild_id, kasten, guete, vektor, groesse, schaerfe,
                                nick, gier, roll, modell, lauf_id)
                           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                        (bild_id, kasten, guete, vektor, groesse, schaerfe,
                         nick, gier, roll, MODELL, lauf_id),
                    )
                cur.execute(
                    "UPDATE bild SET gesichter_am = now(), gesichter_modell = %s WHERE id = %s",
                    (MODELL, bild_id),
                )
        gesichter_gesamt += len(funde)

        if n % 100 == 0 or n == len(bilder):
            t = temperatur()
            if t is not None:
                temp_max = t if temp_max is None else max(temp_max, t)
            je = (time.time() - t_start) / n
            with conn.cursor() as cur:
                cur.execute(
                    """UPDATE gesichtslauf
                          SET bilder = %s, gesichter = %s, sekunden_je_bild = %s,
                              temperatur_max = %s, aktualisiert_am = now()
                        WHERE id = %s""",
                    (n, gesichter_gesamt, je, temp_max, lauf_id),
                )
            rest = (len(bilder) - n) * je
            print(f"  {n:6d}/{len(bilder)}  {gesichter_gesamt:6d} Gesichter  "
                  f"{je*1000:5.0f} ms/Bild  noch ~{rest/60:.0f} min  "
                  f"{'%.0f °C' % t if t is not None else ''}  RSS {rss_mb():.0f} MB")

    je = (time.time() - t_start) / len(bilder) if bilder else 0.0
    return len(bilder), gesichter_gesamt, je, temp_max


# ---------------------------------------------------------------------------
# Gruppieren
# ---------------------------------------------------------------------------

def _lade(conn, nur_ohne_gruppe: bool):
    """Funde als (ids, vektoren, tauglich) laden."""
    with conn.cursor() as cur:
        cur.execute(
            f"""SELECT g.id::int, g.vektor, g.guete, g.groesse, g.schaerfe, g.nick, g.gier
                  FROM gesicht g JOIN bild b ON b.id = g.bild_id
                 WHERE b.geloescht_am IS NULL
                   -- Von Hand aus einem Haeufchen genommen (Phase 9b,
                   -- Migration 011). Ohne diese Zeile suchte der Lauf sich
                   -- genau diese Funde – sie haben ja kein Haeufchen – und
                   -- legte das fremde Gesicht wieder dazu. Ein Mensch haette
                   -- dann dieselbe Korrektur nach jedem Lauf erneut zu machen.
                   AND g.ausgenommen_am IS NULL
                   {"AND g.gruppe_id IS NULL" if nur_ohne_gruppe else ""}
                 ORDER BY g.id""",
        )
        zeilen = cur.fetchall()
    if not zeilen:
        return np.zeros(0, dtype=np.int64), np.zeros((0, 512), dtype=np.float32), np.zeros(0, dtype=bool)
    ids = np.array([z[0] for z in zeilen], dtype=np.int64)
    v = np.array([z[1] for z in zeilen], dtype=np.float32)
    ok = np.array([tauglich(z[2], z[3], z[4], z[5], z[6]) for z in zeilen], dtype=bool)
    return ids, v, ok


def _gruppen_laden(conn):
    with conn.cursor() as cur:
        cur.execute("SELECT id::int, mittelvektor FROM gruppe ORDER BY id")
        zeilen = cur.fetchall()
    if not zeilen:
        return np.zeros(0, dtype=np.int64), np.zeros((0, 512), dtype=np.float32)
    return (np.array([z[0] for z in zeilen], dtype=np.int64),
            np.array([z[1] for z in zeilen], dtype=np.float32))


def _zuordnung_schreiben(conn, ids: np.ndarray, gruppen: np.ndarray, werte: np.ndarray) -> int:
    """gruppe_id fuer die Funde setzen, bei denen gruppen >= 0 ist."""
    treffer = np.nonzero(gruppen >= 0)[0]
    if not len(treffer):
        return 0
    with conn.cursor() as cur:
        cur.executemany(
            "UPDATE gesicht SET gruppe_id = %s, gruppe_aehnlichkeit = %s WHERE id = %s",
            [(int(gruppen[i]), float(werte[i]), int(ids[i])) for i in treffer],
        )
    return len(treffer)


def _gruppen_nachfuehren(conn) -> None:
    """Groesse, Mittelvektor und Vertreter aller Haeufchen aus den Mitgliedern."""
    with conn.cursor() as cur:
        cur.execute(
            """SELECT g.gruppe_id::int, g.id::int, g.vektor, g.guete, g.groesse
                 FROM gesicht g
                WHERE g.gruppe_id IS NOT NULL
                  -- Von Hand herausgenommen (9b): der Fund BLEIBT im Haeufchen
                  -- stehen, damit die Ruecknahme moeglich ist und er nicht
                  -- unauffindbar wird – aber er zaehlt nicht mehr mit. Sonst
                  -- verzoege genau das fremde Gesicht, das jemand entfernt hat,
                  -- weiter den Mittelvektor und zoege aehnliche Fremde nach.
                  AND g.ausgenommen_am IS NULL
                ORDER BY g.gruppe_id""",
        )
        zeilen = cur.fetchall()
    je_gruppe: dict[int, list] = {}
    for gid, fid, vek, guete, groesse in zeilen:
        je_gruppe.setdefault(gid, []).append((fid, vek, guete, groesse))
    with conn.cursor() as cur:
        for gid, mitglieder in je_gruppe.items():
            v = np.array([m[1] for m in mitglieder], dtype=np.float32)
            mittel = gruppieren.mittelvektor(v)
            # Vertreter: naeher am Mittel ist wichtiger als schoen – gewichtet
            # mit Guete und Groesse, damit kein winziger Fund gewinnt.
            aehn = v @ mittel
            punkte = aehn * np.array([m[2] for m in mitglieder]) * np.minimum(
                1.0, np.array([m[3] for m in mitglieder]) / 120.0)
            vertreter = mitglieder[int(punkte.argmax())][0]
            cur.execute(
                """UPDATE gruppe
                      SET groesse = %s, mittelvektor = %s, vertreter_id = %s,
                          aktualisiert_am = now()
                    WHERE id = %s""",
                (len(mitglieder), [float(x) for x in mittel], vertreter, gid),
            )
        # Haeufchen ohne Mitglieder (nach --neu-gruppieren) verschwinden.
        cur.execute("DELETE FROM gruppe WHERE NOT EXISTS "
                    "(SELECT 1 FROM gesicht WHERE gesicht.gruppe_id = gruppe.id)")
        # Ein Haeufchen, von dem nur ausgenommene Funde uebrig sind, steht oben
        # nicht in `je_gruppe` und behielte seine alte Groesse. Es wird hier
        # nachgezogen und NICHT geloescht: die Ruecknahme soll moeglich bleiben.
        cur.execute(
            """UPDATE gruppe SET groesse = 0, aktualisiert_am = now()
                WHERE NOT EXISTS (SELECT 1 FROM gesicht
                                   WHERE gesicht.gruppe_id = gruppe.id
                                     AND gesicht.ausgenommen_am IS NULL)
                  AND groesse <> 0""",
        )


def gruppieren_lauf(conn, lauf_id: int, neu: bool) -> tuple[int, int, int]:
    """Gibt (tauglich, gruppen_neu, zugeordnet) zurueck."""
    s = SCHWELLEN

    if neu:
        # Vollstaendig neu – nur auf ausdruecklichen Wunsch. person_id bleibt:
        # das ist die menschliche Spalte, hier wird nur der Maschinenvorschlag
        # verworfen.
        #
        # Was dabei aber SEHR WOHL verlorengeht, sind die Ablage-Entscheidungen
        # aus 9b: `gruppe.zustand = 'unwichtig'` haengt am Haeufchen, und das
        # Haeufchen wird hier geloescht. Wer die Nachbarin einmal weggelegt hat,
        # bekaeme sie danach wieder als offene Frage vorgelegt. Deshalb wird
        # gezaehlt und gemeldet, statt es geschehen zu lassen.
        with conn.cursor() as cur:
            cur.execute("SELECT count(*) FROM gruppe WHERE zustand = 'unwichtig'")
            abgelegt = cur.fetchone()[0]
            cur.execute("UPDATE gesicht SET gruppe_id = NULL, gruppe_aehnlichkeit = NULL")
            cur.execute("UPDATE gruppe SET vertreter_id = NULL")
            cur.execute("DELETE FROM gruppe")
        print("  alle Haeufchen verworfen (person_id unangetastet)")
        if abgelegt:
            print(f"  ACHTUNG: {abgelegt} als unwichtig abgelegte(s) Haeufchen ist damit "
                  f"weg – diese Funde kommen wieder als offene Frage")

    ids, v, ok = _lade(conn, nur_ohne_gruppe=True)
    print(f"  {len(ids)} Fund(e) ohne Haeufchen, davon {int(ok.sum())} tauglich")
    zugeordnet = 0

    # --- A: taugliche neue Funde gegen VORHANDENE Haeufchen ----------------
    g_ids, g_mittel = _gruppen_laden(conn)
    if len(g_ids) and ok.any():
        wahl, wert = gruppieren.zuordnen(v[ok], g_mittel, s.zuordnung)
        gruppen = np.where(wahl >= 0, g_ids[np.maximum(wahl, 0)], -1)
        n = _zuordnung_schreiben(conn, ids[ok], gruppen, wert)
        zugeordnet += n
        print(f"  A: {n} taugliche Funde vorhandenen Haeufchen zugeordnet "
              f"(Kosinus >= {s.zuordnung})")
        # Die Zugeordneten sind erledigt.
        erledigt = np.zeros(len(ids), dtype=bool)
        erledigt[np.nonzero(ok)[0][wahl >= 0]] = True
        ok = ok & ~erledigt

    # --- B: die uebrigen tauglichen untereinander -------------------------
    gruppen_neu = 0
    if ok.sum() >= s.mindest_stuetzen + 1:
        vt = v[ok]
        idt = ids[ok]
        rss_vorher = rss_mb()
        paare = gruppieren.aehnliche_paare(vt, s.nachbar, block=1000)
        kennzeichen = gruppieren.haeufchen(len(vt), paare, s.mindest_stuetzen)
        print(f"  B: {len(vt)} taugliche Funde paarweise verglichen, "
              f"RSS {rss_vorher:.0f} -> {rss_mb():.0f} MB")
        with conn.cursor() as cur:
            for k in sorted(set(kennzeichen[kennzeichen >= 0].tolist())):
                mitglieder = np.nonzero(kennzeichen == k)[0]
                mittel = gruppieren.mittelvektor(vt[mitglieder])
                cur.execute(
                    "INSERT INTO gruppe (groesse, mittelvektor, lauf_id) VALUES (%s, %s, %s) "
                    "RETURNING id::int",
                    (len(mitglieder), [float(x) for x in mittel], lauf_id),
                )
                gid = cur.fetchone()[0]
                aehn = vt[mitglieder] @ mittel
                cur.executemany(
                    "UPDATE gesicht SET gruppe_id = %s, gruppe_aehnlichkeit = %s WHERE id = %s",
                    [(gid, float(aehn[n]), int(idt[i])) for n, i in enumerate(mitglieder)],
                )
                gruppen_neu += 1
        print(f"  B: {gruppen_neu} neue Haeufchen aus "
              f"{int((kennzeichen >= 0).sum())} Funden; "
              f"{int((kennzeichen < 0).sum())} bleiben allein")

    # --- B2: taugliche Reste gegen ALLE Haeufchen, auch die eben gebildeten --
    # Ohne diesen Schritt bliebe ein tauglicher Fund, der in B keinen Kern
    # gefunden hat, aber einem frisch gebildeten Haeufchen nahe genug ist,
    # bis zum naechsten Lauf allein – und der naechste Lauf holte ihn dann in
    # A nach. Genau so sah der Pilot aus: der zweite Lauf ueber denselben
    # Bestand ordnete 42 Funde zu, die der erste liegen gelassen hatte.
    # Ein Lauf soll aber fertig sein, wenn er fertig ist.
    g_ids, g_mittel = _gruppen_laden(conn)
    ids2, v2, ok2 = _lade(conn, nur_ohne_gruppe=True)
    if len(g_ids) and ok2.any():
        wahl, wert = gruppieren.zuordnen(v2[ok2], g_mittel, s.zuordnung)
        gruppen = np.where(wahl >= 0, g_ids[np.maximum(wahl, 0)], -1)
        n = _zuordnung_schreiben(conn, ids2[ok2], gruppen, wert)
        zugeordnet += n
        print(f"  B2: {n} von {int(ok2.sum())} allein gebliebenen tauglichen Funden "
              f"nachtraeglich zugeordnet (Kosinus >= {s.zuordnung})")

    # --- C: untaugliche Funde, strenger, gegen alle Haeufchen ---------------
    schwach = ~ok2
    if len(g_ids) and schwach.any():
        wahl, wert = gruppieren.zuordnen(v2[schwach], g_mittel, s.zuordnung_streng)
        gruppen = np.where(wahl >= 0, g_ids[np.maximum(wahl, 0)], -1)
        n = _zuordnung_schreiben(conn, ids2[schwach], gruppen, wert)
        zugeordnet += n
        print(f"  C: {n} von {int(schwach.sum())} untauglichen Funden strenger zugeordnet "
              f"(Kosinus >= {s.zuordnung_streng}); der Rest bleibt ohne")

    _gruppen_nachfuehren(conn)
    with conn.cursor() as cur:
        cur.execute("SELECT count(*) FROM gesicht g JOIN bild b ON b.id=g.bild_id "
                    "WHERE b.geloescht_am IS NULL")
        gesamt = cur.fetchone()[0]
        cur.execute(
            """SELECT count(*) FROM gesicht g JOIN bild b ON b.id=g.bild_id
                WHERE b.geloescht_am IS NULL
                  AND g.guete >= %s AND g.groesse >= %s
                  AND (g.schaerfe IS NULL OR g.schaerfe >= %s)
                  AND (g.gier IS NULL OR abs(g.gier) <= %s)
                  AND (g.nick IS NULL OR abs(g.nick) <= %s)""",
            (s.guete, s.groesse, s.schaerfe, s.gier, s.nick),
        )
        tauglich_gesamt = cur.fetchone()[0]
    print(f"  Bestand: {gesamt} Funde, {tauglich_gesamt} tauglich")
    return tauglich_gesamt, gruppen_neu, zugeordnet


# ---------------------------------------------------------------------------
# Bericht und Bildbelege
# ---------------------------------------------------------------------------

def bericht(conn, lauf_id: int | None, belege: int = 20) -> str:
    zeilen: list[str] = []
    p = zeilen.append
    with conn.cursor() as cur:
        cur.execute("""SELECT count(*) FILTER (WHERE gesichter_am IS NOT NULL),
                              count(*) FILTER (WHERE typ='bild' AND geloescht_am IS NULL AND vorschau_erzeugt)
                         FROM bild""")
        bearbeitet, gesamt_bilder = cur.fetchone()
        cur.execute("""SELECT count(*), count(*) FILTER (WHERE gruppe_id IS NOT NULL),
                              count(DISTINCT bild_id)
                         FROM gesicht g JOIN bild b ON b.id=g.bild_id WHERE b.geloescht_am IS NULL""")
        funde, in_gruppe, bilder_mit = cur.fetchone()
        s = SCHWELLEN
        cur.execute("""SELECT count(*) FROM gesicht g JOIN bild b ON b.id=g.bild_id
                        WHERE b.geloescht_am IS NULL AND g.guete >= %s AND g.groesse >= %s
                          AND (g.schaerfe IS NULL OR g.schaerfe >= %s)
                          AND (g.gier IS NULL OR abs(g.gier) <= %s)
                          AND (g.nick IS NULL OR abs(g.nick) <= %s)""",
                    (s.guete, s.groesse, s.schaerfe, s.gier, s.nick))
        tauglich_n = cur.fetchone()[0]
        cur.execute("SELECT count(*), coalesce(sum(groesse),0), coalesce(max(groesse),0) FROM gruppe")
        gruppen, in_gruppen_summe, groesste = cur.fetchone()
        cur.execute("""SELECT CASE WHEN groesse < 3 THEN '2'
                                   WHEN groesse < 6 THEN '3-5'
                                   WHEN groesse < 11 THEN '6-10'
                                   WHEN groesse < 26 THEN '11-25'
                                   WHEN groesse < 101 THEN '26-100'
                                   ELSE '>100' END AS klasse, count(*)
                         FROM gruppe GROUP BY 1 ORDER BY min(groesse)""")
        verteilung = cur.fetchall()
        cur.execute("""SELECT g.id::int, g.groesse,
                              min(b.aufnahme_lokal)::date, max(b.aufnahme_lokal)::date,
                              count(DISTINCT b.id),
                              round(avg(f.gruppe_aehnlichkeit)::numeric, 3)
                         FROM gruppe g JOIN gesicht f ON f.gruppe_id = g.id
                         JOIN bild b ON b.id = f.bild_id
                        GROUP BY g.id, g.groesse ORDER BY g.groesse DESC LIMIT %s""", (belege,))
        top = cur.fetchall()
        cur.execute("SELECT bilder, gesichter, sekunden_je_bild, temperatur_max, "
                    "extract(epoch FROM (coalesce(beendet_am, now()) - begonnen_am)) "
                    "FROM gesichtslauf WHERE id = %s", (lauf_id,))
        lauf = cur.fetchone() if lauf_id else None

    p("=== Gesichter – Bericht ===")
    p(f"Bilder bearbeitet:           {bearbeitet:7d} von {gesamt_bilder} sichtbaren Bildern")
    p(f"Bilder mit Gesicht:          {bilder_mit:7d}")
    p(f"Gesichter gefunden:          {funde:7d}")
    p(f"  davon tauglich:            {tauglich_n:7d}  ({100*tauglich_n/max(1,funde):.1f} %)")
    p(f"  in einem Haeufchen:        {in_gruppe:7d}  ({100*in_gruppe/max(1,funde):.1f} %)")
    p(f"  allein geblieben:          {funde-in_gruppe:7d}")
    p(f"Haeufchen gesamt:            {gruppen:7d}   groesstes {groesste}")
    p("Groessenverteilung:")
    for klasse, n in verteilung:
        p(f"  {klasse:>7s} Funde: {n:5d} Haeufchen")
    p(f"Schwellen: {SCHWELLEN}")
    if lauf:
        b_, g_, je, temp, sek = lauf
        p(f"Dieser Lauf: {b_} Bilder, {g_} Gesichter, {je*1000 if je else 0:.0f} ms/Bild, "
          f"max {temp if temp is not None else '?'} °C, {sek/60:.1f} min")
        if je:
            offen = gesamt_bilder - bearbeitet
            p(f"Hochrechnung auf die {offen} noch offenen Bilder: {offen*je/3600:.1f} h")
    p("")
    p(f"Die {len(top)} groessten Haeufchen:")
    p(f"  {'Nr.':>6s} {'Funde':>6s} {'Bilder':>6s} {'von':>10s} {'bis':>10s} {'Kosinus':>8s}")
    for gid, groesse, von, bis, bilder_n, aehn in top:
        p(f"  {gid:6d} {groesse:6d} {bilder_n:6d} {str(von):>10s} {str(bis):>10s} {aehn!s:>8s}")

    text = "\n".join(zeilen)
    BELEGE.mkdir(parents=True, exist_ok=True)
    (BELEGE / "bericht.txt").write_text(text + "\n", encoding="utf-8")
    return text


def blaetter(conn, belege: int = 20, je_blatt: int = 24) -> int:
    """Je Haeufchen ein Blatt mit Beispielausschnitten."""
    from PIL import Image, ImageDraw, ImageFont
    BELEGE.mkdir(parents=True, exist_ok=True)
    for alt in BELEGE.glob("gruppe-*.jpg"):
        alt.unlink()
    with conn.cursor() as cur:
        cur.execute("SELECT id::int, groesse FROM gruppe ORDER BY groesse DESC LIMIT %s", (belege,))
        gruppen = cur.fetchall()
    kachel, spalten = 160, 6
    try:
        schrift = ImageFont.load_default(size=16)
    except TypeError:
        schrift = ImageFont.load_default()
    for gid, groesse in gruppen:
        with conn.cursor() as cur:
            # Quer durch das Haeufchen, nicht nur die aehnlichsten: sonst sieht
            # das Blatt besser aus, als das Haeufchen ist.
            cur.execute(
                """SELECT f.kasten, b.jahr, b.monat, b.sha256, f.gruppe_aehnlichkeit,
                          f.guete, f.groesse, b.aufnahme_lokal::date
                     FROM gesicht f JOIN bild b ON b.id = f.bild_id
                    WHERE f.gruppe_id = %s AND f.ausgenommen_am IS NULL
                    ORDER BY f.gruppe_aehnlichkeit DESC""", (gid,))
            alle = cur.fetchall()
        schritt = max(1, len(alle) // je_blatt)
        auswahl = alle[::schritt][:je_blatt]
        zeilen_n = (len(auswahl) + spalten - 1) // spalten
        blatt = Image.new("RGB", (spalten * kachel, 40 + zeilen_n * (kachel + 18)), (250, 248, 245))
        d = ImageDraw.Draw(blatt)
        d.text((8, 10), f"Haeufchen {gid}: {groesse} Funde, {len(auswahl)} gezeigt "
                        f"(quer durch die Aehnlichkeit)", fill=(30, 30, 30), font=schrift)
        for n, (kasten, jahr, monat, sha, aehn, guete, gr, datum) in enumerate(auswahl):
            try:
                im = Image.open(ansichtspfad(jahr, monat, sha)).convert("RGB")
            except OSError:
                continue
            x1, y1, x2, y2 = kasten
            rand = int(0.3 * max(x2 - x1, y2 - y1))
            aus = im.crop((max(0, x1 - rand), max(0, y1 - rand),
                           min(im.width, x2 + rand), min(im.height, y2 + rand)))
            aus = aus.resize((kachel, kachel))
            sp, ze = n % spalten, n // spalten
            blatt.paste(aus, (sp * kachel, 40 + ze * (kachel + 18)))
            d.text((sp * kachel + 4, 40 + ze * (kachel + 18) + kachel + 1),
                   f"{aehn:.2f} {datum}", fill=(80, 80, 80), font=schrift)
        blatt.save(BELEGE / f"gruppe-{gid}.jpg", quality=85)
    return len(gruppen)


# ---------------------------------------------------------------------------
# Lauf
# ---------------------------------------------------------------------------

def main() -> int:
    p = argparse.ArgumentParser(description="Gesichter finden und gruppieren")
    p.add_argument("--grenze", type=int, default=0, help="hoechstens so viele Bilder (0 = alle)")
    p.add_argument("--nur-gruppieren", action="store_true")
    p.add_argument("--neu-gruppieren", action="store_true",
                   help="ALLE Haeufchen verwerfen und neu bilden (person_id bleibt)")
    p.add_argument("--nur-bericht", action="store_true")
    p.add_argument("--belege", type=int, default=20)
    args = p.parse_args()

    with verbindung(autocommit=True) as conn:
        if args.nur_bericht:
            print(bericht(conn, None, args.belege))
            print(f"\n{blaetter(conn, args.belege)} Blatt/Blaetter in {BELEGE}")
            return 0

        with conn.cursor() as cur:
            cur.execute("SELECT id::int FROM gesichtslauf WHERE zustand = 'laeuft' "
                        "AND boot_kennung = %s AND pid IS NOT NULL", (boot_kennung(),))
            for (alt,) in cur.fetchall():
                cur.execute("SELECT pid FROM gesichtslauf WHERE id = %s", (alt,))
                pid = cur.fetchone()[0]
                try:
                    os.kill(pid, 0)
                except ProcessLookupError:
                    cur.execute("UPDATE gesichtslauf SET zustand='abgebrochen', beendet_am=now(), "
                                "bemerkung='Prozess nicht mehr vorhanden' WHERE id=%s", (alt,))
            cur.execute("UPDATE gesichtslauf SET zustand='abgebrochen', beendet_am=now(), "
                        "bemerkung='Neustart dazwischen' WHERE zustand='laeuft' "
                        "AND boot_kennung IS DISTINCT FROM %s", (boot_kennung(),))
            cur.execute(
                "INSERT INTO gesichtslauf (modell, pid, boot_kennung) VALUES (%s, %s, %s) "
                "RETURNING id::int",
                (MODELL, os.getpid(), boot_kennung()),
            )
            lauf_id = cur.fetchone()[0]
        print(f"Lauf Nr. {lauf_id} auf {socket.gethostname()}, {MODELL}")

        try:
            temp = None
            if not args.nur_gruppieren and not args.neu_gruppieren:
                t0 = time.time()
                app = modell_laden()
                print(f"Modell geladen in {time.time()-t0:.1f} s, RSS {rss_mb():.0f} MB")
                n_bilder, n_gesichter, je, temp = erkennen(conn, app, lauf_id, args.grenze)
                print(f"erkannt: {n_bilder} Bilder, {n_gesichter} Gesichter, "
                      f"{je*1000:.0f} ms/Bild, max {temp} °C")

            print("\ngruppieren:")
            tauglich_n, gruppen_neu, zugeordnet = gruppieren_lauf(conn, lauf_id, args.neu_gruppieren)

            with conn.cursor() as cur:
                cur.execute(
                    """UPDATE gesichtslauf
                          SET zustand='fertig', beendet_am=now(), tauglich=%s,
                              gruppen_neu=%s, zugeordnet=%s, aktualisiert_am=now()
                        WHERE id=%s""",
                    (tauglich_n, gruppen_neu, zugeordnet, lauf_id),
                )
            print()
            print(bericht(conn, lauf_id, args.belege))
            print(f"\n{blaetter(conn, args.belege)} Blatt/Blaetter in {BELEGE}")
            print(f"RSS max {rss_mb():.0f} MB")
        except BaseException as fehler:
            with conn.cursor() as cur:
                cur.execute("UPDATE gesichtslauf SET zustand='abgebrochen', beendet_am=now(), "
                            "bemerkung=%s WHERE id=%s",
                            (f"{type(fehler).__name__}: {str(fehler)[:200]}", lauf_id))
            raise
    return 0


if __name__ == "__main__":
    sys.exit(main())
