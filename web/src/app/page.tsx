import type { Metadata } from "next";

import { verlangeAnmeldung } from "@/lib/zugriff";
import Kopf from "./kopf";

export const metadata: Metadata = { title: "Übersicht" };

export default async function Uebersicht() {
  const wer = await verlangeAnmeldung();

  return (
    <main>
      <Kopf wer={wer} />
      <h1>Übersicht</h1>
      <div className="karte">
        <p>
          Angemeldet als <strong>{wer.benutzername}</strong>, Rolle{" "}
          <strong>{wer.rolle}</strong>.
        </p>
        <p className="leise">
          Galerie, Auswahllisten und Download folgen in Phase 2b und 3.
        </p>
      </div>
    </main>
  );
}
