"""Gesichter zu Haeufchen zusammenfassen – reine Rechnung, keine Datenbank.

Getrennt von gesichter.py, damit es sich ohne Modell und ohne Datenbank
pruefen laesst: Speicherverbrauch, Kettenbildung, Wiederholbarkeit.

Alle Vektoren sind L2-normiert; der Kosinus ist deshalb das Skalarprodukt.

**Nicht die vollstaendige Abstandsmatrix aufbauen.** Bei 50.000 Funden waeren
das 2,5 Milliarden Werte. Gerechnet wird in Bloecken von Zeilen gegen alle
Spalten, und behalten werden nur die Paare oberhalb der Schwelle. Der Speicher
waechst damit mit Blockgroesse mal Fundzahl, nicht mit dem Quadrat.

**Ein Haeufchen braucht mehrere sich gegenseitig stuetzende Funde.** Eine
Kette aus Einzelverbindungen zoege sonst ueber eine schlechte Aufnahme zwei
Personen zusammen. Deshalb: ein Fund ist ein KERN, wenn er mindestens
`mindest_stuetzen` Nachbarn oberhalb der Schwelle hat. Nur Kerne verbinden
sich zu Haeufchen; ein Fund, der kein Kern ist, haengt sich an das Haeufchen
seines aehnlichsten Kern-Nachbarn – er verbindet aber nichts. (Das ist die
Idee von DBSCAN, hier ausgeschrieben, weil die Schwellen sichtbar sein
sollen.)
"""

from __future__ import annotations

from collections import defaultdict
from typing import Iterator

import numpy as np


def aehnliche_paare(
    v: np.ndarray, schwelle: float, block: int = 1000,
) -> Iterator[tuple[int, int, float]]:
    """Alle Paare (i, j, kosinus) mit i < j und kosinus >= schwelle.

    Blockweise: `block` Zeilen gegen alle Spalten. Bei block = 1000 und
    50.000 Vektoren ist die Zwischenmatrix 1000 x 50.000 x 4 Byte = 200 MB,
    ganz gleich, wie viele Funde es sind.
    """
    n = len(v)
    for i0 in range(0, n, block):
        i1 = min(i0 + block, n)
        s = v[i0:i1] @ v.T                       # (block, n)
        # Nur j > i, damit jedes Paar einmal vorkommt.
        zeilen, spalten = np.nonzero(s >= schwelle)
        for zi, sp in zip(zeilen, spalten):
            i = i0 + int(zi)
            j = int(sp)
            if j > i:
                yield i, j, float(s[zi, sp])


def haeufchen(
    n: int,
    paare: Iterator[tuple[int, int, float]],
    mindest_stuetzen: int,
) -> np.ndarray:
    """Kennzeichen je Fund; -1 heisst: keinem Haeufchen zugeordnet.

    `mindest_stuetzen` ist die Zahl der Nachbarn, die ein Fund braucht, um
    ein Kern zu sein. Mit 2 besteht das kleinste Haeufchen aus drei Funden,
    die sich gegenseitig stuetzen.
    """
    nachbarn: dict[int, dict[int, float]] = defaultdict(dict)
    for i, j, s in paare:
        nachbarn[i][j] = s
        nachbarn[j][i] = s

    kern = np.zeros(n, dtype=bool)
    for i, nb in nachbarn.items():
        if len(nb) >= mindest_stuetzen:
            kern[i] = True

    kennzeichen = np.full(n, -1, dtype=np.int64)
    naechstes = 0

    # Zusammenhang nur ueber Kerne.
    for start in range(n):
        if not kern[start] or kennzeichen[start] >= 0:
            continue
        kennzeichen[start] = naechstes
        stapel = [start]
        while stapel:
            i = stapel.pop()
            for j in nachbarn[i]:
                if kern[j] and kennzeichen[j] < 0:
                    kennzeichen[j] = naechstes
                    stapel.append(j)
        naechstes += 1

    # Rand: kein Kern, aber neben einem – haengt sich an, verbindet nichts.
    for i in range(n):
        if kennzeichen[i] >= 0 or i not in nachbarn:
            continue
        bester, beste = -1, -1.0
        for j, s in nachbarn[i].items():
            if kern[j] and s > beste:
                bester, beste = j, s
        if bester >= 0:
            kennzeichen[i] = kennzeichen[bester]

    return kennzeichen


def mittelvektor(v: np.ndarray) -> np.ndarray:
    """Normiertes Mittel – so bleibt der Kosinus zu ihm vergleichbar."""
    m = v.mean(axis=0)
    norm = np.linalg.norm(m)
    return m / norm if norm > 0 else m


def zuordnen(
    v: np.ndarray, mittel: np.ndarray, schwelle: float, block: int = 1000,
) -> tuple[np.ndarray, np.ndarray]:
    """Je Vektor: Index des aehnlichsten Mittelvektors und der Kosinus dazu.

    Index -1, wenn kein Mittelvektor die Schwelle erreicht. Ebenfalls in
    Bloecken, aus demselben Grund wie oben.
    """
    n = len(v)
    wahl = np.full(n, -1, dtype=np.int64)
    wert = np.zeros(n, dtype=np.float32)
    if len(mittel) == 0 or n == 0:
        return wahl, wert
    for i0 in range(0, n, block):
        i1 = min(i0 + block, n)
        s = v[i0:i1] @ mittel.T                  # (block, gruppen)
        besten = s.argmax(axis=1)
        beste = s[np.arange(i1 - i0), besten]
        treffer = beste >= schwelle
        wahl[i0:i1][treffer] = besten[treffer]
        wert[i0:i1] = beste
    return wahl, wert


__all__ = ["aehnliche_paare", "haeufchen", "mittelvektor", "zuordnen"]
