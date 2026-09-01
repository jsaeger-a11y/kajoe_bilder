"""Fortschritt eines Verarbeitungslaufs mitschreiben.

Beide Schritte – Einlesen und Ableiten – benutzen dieselben vier Aufrufe:
`beginne`, `takt`, `fehler`, `beende`. Damit steht der Stand waehrend der
Arbeit in der Datenbank und nicht erst danach; eine Anzeige, die nur das
Ergebnis kennt, kann bei siebzehntausend Dateien nichts zeigen.

Die Verbindung bekommt **autocommit** (das ist in datenbank.verbindung()
voreingestellt): ohne ihn stuende der Fortschritt in einer offenen Transaktion
und waere fuer die Anzeige unsichtbar – genau der Fehler, vor dem CLAUDE.md
warnt.
"""

from __future__ import annotations

import os
import socket
from pathlib import Path
from dataclasses import dataclass, field

from datenbank import verbindung

# Alle so viele Dateien wird der Stand fortgeschrieben. Haeufiger kostet
# Schreibvorgaenge ohne Gewinn, seltener laesst die Anzeige zu lange stehen.
TAKT = 100

# Mehr Namen als das bringt keinem etwas und blaeht die Tabelle.
HOECHSTENS_FEHLER = 500


@dataclass
class Lauf:
    """Ein laufender Schritt. Ohne Datenbankzeile, wenn `id` None ist."""

    id: int | None = None
    schritt: str = ""
    gesamt: int = 0
    erledigt: int = 0
    fehler_gezaehlt: int = 0
    _conn: object | None = field(default=None, repr=False)

    # -- Schreiben ---------------------------------------------------------

    def takt(self, erledigt: int, *, erzwingen: bool = False) -> None:
        """Stand fortschreiben – hoechstens alle TAKT Dateien."""
        self.erledigt = erledigt
        if self.id is None:
            return
        if not erzwingen and erledigt % TAKT != 0:
            return
        with self._conn.cursor() as cur:  # type: ignore[union-attr]
            cur.execute(
                """UPDATE verarbeitung
                      SET erledigt = %s, gesamt = %s, aktualisiert_am = now()
                    WHERE id = %s""",
                (erledigt, self.gesamt, self.id),
            )
            # Der Verlauf, nicht nur der Stand: aus einem einzelnen Wert
            # laesst sich keine Restzeit rechnen.
            cur.execute(
                "INSERT INTO verarbeitung_takt (verarbeitung_id, erledigt) VALUES (%s, %s)"
                " ON CONFLICT DO NOTHING",
                (self.id, erledigt),
            )

    def fehler(self, pfad: str, grund: str, bild_id: int | None = None) -> None:
        """Einen Fehlschlag namentlich festhalten."""
        if self.id is None or self.fehler_gezaehlt >= HOECHSTENS_FEHLER:
            self.fehler_gezaehlt += 1
            return
        self.fehler_gezaehlt += 1
        with self._conn.cursor() as cur:  # type: ignore[union-attr]
            cur.execute(
                """INSERT INTO verarbeitung_fehler (verarbeitung_id, bild_id, pfad, grund)
                   VALUES (%s, %s, %s, %s)""",
                (self.id, bild_id, pfad[:500], grund[:500]),
            )

    def verknuepfe_ingest(self, ingest_lauf_id: int) -> None:
        if self.id is None:
            return
        with self._conn.cursor() as cur:  # type: ignore[union-attr]
            cur.execute(
                "UPDATE verarbeitung SET ingest_lauf_id = %s WHERE id = %s",
                (ingest_lauf_id, self.id),
            )

    def beende(self, zustand: str, bemerkung: str | None = None, **zahlen: int) -> None:
        if self.id is None:
            return
        felder = ["zustand = %s", "beendet_am = now()", "aktualisiert_am = now()",
                  "erledigt = %s", "gesamt = %s", "bemerkung = %s"]
        werte: list[object] = [zustand, self.erledigt, self.gesamt, bemerkung]
        for name in ("erzeugt", "uebersprungen", "fehlgeschlagen"):
            if name in zahlen:
                felder.append(f"{name} = %s")
                werte.append(zahlen[name])
        werte.append(self.id)
        with self._conn.cursor() as cur:  # type: ignore[union-attr]
            cur.execute(f"UPDATE verarbeitung SET {', '.join(felder)} WHERE id = %s", werte)


def boot_kennung() -> str | None:
    """Kennung des laufenden Systemstarts.

    Der Kern vergibt sie bei jedem Start neu. Sie ist der einzige zuverlaessige
    Weg, eine Zeile aus einem frueheren Start zu erkennen: nach einem Neustart
    faengt die Vergabe der Prozessnummern wieder von vorn an, und `pid` kann
    dann auf einen voellig anderen, lebenden Prozess zeigen.
    """
    try:
        return Path("/proc/sys/kernel/random/boot_id").read_text().strip() or None
    except OSError:
        return None


def beginne(schritt: str, gesamt: int, angestossen_von: int | None,
            conn) -> Lauf:
    """Zeile anlegen und den Lauf zurueckgeben."""
    with conn.cursor() as cur:
        cur.execute(
            """INSERT INTO verarbeitung
                   (schritt, gesamt, angestossen_von, pid, rechner, boot_kennung)
               VALUES (%s, %s, %s, %s, %s, %s) RETURNING id::int""",
            (schritt, gesamt, angestossen_von, os.getpid(),
             socket.gethostname(), boot_kennung()),
        )
        neu = cur.fetchone()[0]
    return Lauf(id=int(neu), schritt=schritt, gesamt=gesamt, _conn=conn)


def verwaiste_aufraeumen(conn) -> int:
    """Zeilen, deren Prozess es nicht mehr gibt, auf 'abgebrochen' setzen.

    Eine Zeile, die auf `laeuft` stehenbleibt, blockiert sonst jeden weiteren
    Anstoss – dieselbe Falle wie eine Sperrdatei, die niemand aufraeumt.
    """
    with conn.cursor() as cur:
        cur.execute(
            """SELECT id::int, pid, rechner, boot_kennung FROM verarbeitung
                WHERE beendet_am IS NULL""",
        )
        offen = cur.fetchall()

    hier = socket.gethostname()
    jetziger_start = boot_kennung()
    aufgeraeumt = 0
    for lauf_id, pid, rechner, kennung in offen:
        if rechner != hier:
            continue  # ein anderer Rechner – hier nicht zu beurteilen

        # Ein anderer Systemstart: der Prozess ist mit Sicherheit weg, und die
        # Prozessnummer darf gar nicht erst befragt werden – nach einem
        # Neustart kann sie auf einen fremden, lebenden Prozess zeigen.
        aus_altem_start = (
            kennung is not None and jetziger_start is not None
            and kennung != jetziger_start
        )

        lebt = False
        if pid and not aus_altem_start:
            try:
                os.kill(pid, 0)
                lebt = True
            except ProcessLookupError:
                lebt = False
            except PermissionError:
                lebt = True  # gibt es, gehoert nur jemand anderem
        if lebt:
            continue
        with conn.cursor() as cur:
            cur.execute(
                """UPDATE verarbeitung
                      SET zustand = 'abgebrochen', beendet_am = now(),
                          bemerkung = coalesce(bemerkung || ' | ', '') || %s
                    WHERE id = %s AND beendet_am IS NULL""",
                ("Neustart dazwischen" if aus_altem_start
                 else "Prozess nicht mehr vorhanden", lauf_id),
            )
        aufgeraeumt += 1
    return aufgeraeumt


def laeuft_schon(conn) -> tuple[int, str] | None:
    """(id, schritt) eines wirklich laufenden Vorgangs, sonst None."""
    verwaiste_aufraeumen(conn)
    with conn.cursor() as cur:
        cur.execute(
            """SELECT id::int, schritt FROM verarbeitung
                WHERE beendet_am IS NULL ORDER BY begonnen_am LIMIT 1""",
        )
        zeile = cur.fetchone()
    return (int(zeile[0]), zeile[1]) if zeile else None


__all__ = ["Lauf", "TAKT", "beginne", "laeuft_schon", "verwaiste_aufraeumen"]
