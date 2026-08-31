"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";

import { verarbeitungAnstossen, type Zustand } from "./aktionen";

/**
 * Haelt die Seite aktuell, solange etwas laeuft.
 *
 * **Keine offene Anfrage.** Alle paar Sekunden ein `router.refresh()` – das
 * holt die Seite neu und ist danach fertig. Der Lauf haengt nicht daran:
 * Browser schliessen, Telefon weglegen, spaeter nachsehen.
 */
export function Selbstauffrischung({ takt }: { takt: number }) {
  const router = useRouter();
  const [seit, setzeSeit] = useState(0);

  useEffect(() => {
    const uhr = setInterval(() => {
      setzeSeit((s) => s + takt);
      router.refresh();
    }, takt * 1000);
    return () => clearInterval(uhr);
  }, [router, takt]);

  return (
    <p className="leise">
      Die Seite frischt sich alle {takt} Sekunden selbst auf (seit {seit} s offen).
      Sie hält dabei keine Verbindung offen – der Lauf hängt nicht an ihr.
    </p>
  );
}

export function Anstossknopf({ anzahl, warnung }: { anzahl: number; warnung: string | null }) {
  const [zustand, absenden, laeuft] = useActionState<Zustand, FormData>(
    verarbeitungAnstossen, {},
  );
  const [sicher, setzeSicher] = useState(false);

  return (
    <form action={absenden}>
      {warnung ? (
        <p className="fehler">
          <strong>Sieht nach einer laufenden Übertragung aus.</strong> {warnung} Das ist
          ein Hinweis, keine Sperre – wenn du weißt, dass alles da ist, stoße an.
        </p>
      ) : null}

      {sicher ? (
        <div className="nebeneinander">
          <button className="haupt" type="submit" disabled={laeuft}>
            {laeuft ? "…" : `Ja, ${anzahl} Datei(en) verarbeiten`}
          </button>
          <button type="button" onClick={() => setzeSicher(false)}>
            Abbrechen
          </button>
        </div>
      ) : (
        <button className="haupt" type="button" onClick={() => setzeSicher(true)}>
          Verarbeitung starten …
        </button>
      )}

      {zustand.fehler ? <p className="fehler">{zustand.fehler}</p> : null}
      {zustand.erledigt ? <p className="hinweis">{zustand.erledigt}</p> : null}
    </form>
  );
}
