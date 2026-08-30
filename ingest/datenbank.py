"""Verbindung zur Datenbank.

Die Zugangsdaten stehen in der .env der Projektwurzel; der Pfad dorthin wird
aus dem Ort dieser Datei abgeleitet, nie fest verdrahtet – sonst bricht ein
Verschieben des Ordners alles.
"""

from __future__ import annotations

import os
from pathlib import Path

import psycopg

PROJEKT = Path(__file__).resolve().parent.parent


def lies_env(pfad: Path | None = None) -> dict[str, str]:
    """Liest .env ein. Kein Fremdpaket dafuer – das Format ist trivial."""
    pfad = pfad or PROJEKT / ".env"
    if not pfad.is_file():
        raise SystemExit(f"{pfad} fehlt – siehe .env.beispiel")

    werte: dict[str, str] = {}
    for zeile in pfad.read_text(encoding="utf-8").splitlines():
        zeile = zeile.strip()
        if not zeile or zeile.startswith("#") or "=" not in zeile:
            continue
        schluessel, wert = zeile.split("=", 1)
        werte[schluessel.strip()] = wert.strip().strip('"').strip("'")
    return werte


def verbindung(*, autocommit: bool = True) -> psycopg.Connection:
    """Neue Verbindung.

    autocommit ist ABSICHTLICH voreingestellt und keine Bequemlichkeit: ohne
    ihn oeffnet schon die erste SELECT-Abfrage eine Transaktion und haelt sie
    offen. Ein spaeteres `with conn.transaction()` legt dann nur einen
    Savepoint darin an, committet wird nie, und beim Prozessende ist alles
    zurueckgerollt – ohne eine einzige Fehlermeldung.
    """
    env = lies_env()
    return psycopg.connect(
        host=env.get("POSTGRES_HOST", "127.0.0.1"),
        port=int(env.get("POSTGRES_PORT", "5432")),
        dbname=env["POSTGRES_DB"],
        user=env["POSTGRES_USER"],
        password=env["POSTGRES_PASSWORD"],
        autocommit=autocommit,
        # Betriebszeitstempel sind UTC. Die Ortszeit der Aufnahme steckt in
        # aufnahme_lokal und ist bewusst zeitzonenlos.
        options="-c TimeZone=UTC",
    )


def gegenprobe(sha256: str) -> int:
    """Zaehlt ueber eine ZWEITE Verbindung, ob eine Zeile wirklich steht.

    Die eigene Sitzung sieht auch das, was nur in ihrer offenen Transaktion
    steht. Nur eine zweite Verbindung beweist, dass tatsaechlich committet
    wurde.
    """
    with verbindung() as conn, conn.cursor() as cur:
        cur.execute("SELECT count(*) FROM bild WHERE sha256 = %s", (sha256,))
        return cur.fetchone()[0]


__all__ = ["PROJEKT", "gegenprobe", "lies_env", "verbindung"]
