"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Die Wiedergabefassung entsteht beim ersten Aufruf.
 *
 * Solange gerechnet wird, sagt die Seite das auch. Bei drei Minuten Video sind
 * das rund achtzehn Sekunden – und eine Seite, die stillsteht, sieht kaputt
 * aus.
 */
export default function Abspieler({ id, fertig }: { id: number; fertig: boolean }) {
  const [zustand, setzeZustand] = useState<"da" | "rechnet" | "fehler">(
    fertig ? "da" : "rechnet",
  );
  const [meldung, setzeMeldung] = useState<string | null>(null);
  const [sekunden, setzeSekunden] = useState(0);
  const gestartet = useRef(false);

  useEffect(() => {
    if (fertig || gestartet.current) return;
    gestartet.current = true;

    const uhr = setInterval(() => setzeSekunden((s) => s + 1), 1000);

    fetch(`/api/bild/${id}/wiedergabe`, { method: "POST" })
      .then(async (a) => {
        const antwort = (await a.json()) as { ok: boolean; fehler?: string; weg?: string };
        if (antwort.ok) {
          setzeZustand("da");
          setzeMeldung(antwort.weg ? `erzeugt (${antwort.weg})` : null);
        } else {
          setzeZustand("fehler");
          setzeMeldung(antwort.fehler ?? "Die Umwandlung ist gescheitert.");
        }
      })
      .catch((f: unknown) => {
        setzeZustand("fehler");
        setzeMeldung(f instanceof Error ? f.message : "Die Umwandlung ist gescheitert.");
      })
      .finally(() => clearInterval(uhr));

    return () => clearInterval(uhr);
  }, [id, fertig]);

  if (zustand === "rechnet") {
    return (
      <p className="rechnet">
        Die abspielbare Fassung wird gerade erzeugt … {sekunden} s
        <br />
        <span className="leise">
          HEVC spielt kein Chrome und kein Firefox – das Original wird einmalig
          nach H.264 umgewandelt und danach gespeichert.
        </span>
      </p>
    );
  }

  if (zustand === "fehler") {
    return <p className="fehler">{meldung}</p>;
  }

  return (
    <>
      <video src={`/datei/${id}/wiedergabe`} controls preload="metadata" playsInline />
      {meldung ? <p className="leise">{meldung}</p> : null}
    </>
  );
}
