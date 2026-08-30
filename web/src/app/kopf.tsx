import Link from "next/link";

import { abmeldenAktion } from "./anmelden/aktionen";
import type { Angemeldet } from "@/lib/sitzung";

/**
 * Die Leiste zeigt den Verwaltungspunkt nur Verwaltern. Das ist Bequemlichkeit,
 * KEINE Pruefung – die steht in der Seite, der Action und der Route selbst.
 */
export default function Kopf({ wer }: { wer: Angemeldet }) {
  return (
    <div className="leiste">
      <nav>
        <Link href="/">Übersicht</Link>
        <Link href="/konto">Mein Konto</Link>
        {wer.rolle === "verwalter" ? <Link href="/verwaltung/benutzer">Benutzer</Link> : null}
      </nav>
      <form action={abmeldenAktion}>
        <span className="leise">
          {wer.benutzername} ({wer.rolle}){" "}
        </span>
        <button className="klein" type="submit">
          Abmelden
        </button>
      </form>
    </div>
  );
}
