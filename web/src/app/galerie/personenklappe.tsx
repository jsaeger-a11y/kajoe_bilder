"use client";

import Link from "next/link";
import { useState } from "react";

/**
 * Die Personenliste in der Klappe – mit Eingabefeld zum Einschränken.
 *
 * Vierzig Namen sind zu viele zum Durchsehen, besonders auf dem Telefon.
 * Deshalb ein Feld, das die Liste kürzt, während man tippt.
 *
 * **Das Feld ist der einzige Grund, warum das hier ein Client-Bauteil ist.**
 * Die Auswahl selbst bleibt ein VERWEIS: der Filterzustand gehört in die
 * Adresse, damit eine Ansicht wiederzufinden ist und der Zurück-Knopf tut, was
 * er soll. Die Ziele sind deshalb schon auf dem Server ausgerechnet und werden
 * hier nur noch angezeigt – `filterlink()` liegt in einem `server-only`-Modul
 * und hat im Browser nichts zu suchen.
 *
 * Das Feld selbst ist ein gesteuertes Eingabefeld (`value` + `onChange`), kein
 * `defaultValue`. Die `defaultChecked`-Falle greift hier deshalb nicht.
 */
export default function Personenklappe({
  eintraege,
  gewaehlt,
}: {
  eintraege: { id: number; name: string; anzahl: number; ziel: string }[];
  gewaehlt: number | null;
}) {
  const [suche, setSuche] = useState("");

  const gesucht = suche.trim().toLowerCase();
  const gezeigt = gesucht
    ? eintraege.filter((e) => e.name.toLowerCase().includes(gesucht))
    : eintraege;

  return (
    <>
      {eintraege.length > 8 ? (
        <input
          className="klappe-suche"
          type="search"
          value={suche}
          onChange={(e) => setSuche(e.target.value)}
          placeholder={`Name suchen (${eintraege.length})`}
          aria-label="Personen nach Namen einschränken"
          autoComplete="off"
        />
      ) : null}

      <div className="filterzeile">
        {gezeigt.map((e) => (
          <Link
            key={e.id}
            href={e.ziel}
            className={`marke-filter${gewaehlt === e.id ? " gewaehlt" : ""}`}
          >
            {e.name}
            <span className="zahl"> {e.anzahl}</span>
          </Link>
        ))}
        {gezeigt.length === 0 ? (
          <span className="leise">Kein Name enthält „{suche.trim()}".</span>
        ) : null}
      </div>
    </>
  );
}
