import type { Metadata } from "next";
import Link from "next/link";

import { vorgemerkte } from "@/lib/loeschen";
import { LOESCHFRIST_TAGE } from "@/lib/rechte";
import { sichtVon } from "@/lib/sichtbar";
import { verlangeRecht } from "@/lib/zugriff";
import Kopf from "../kopf";
import { zurueckholenAktion } from "./aktionen";

export const metadata: Metadata = { title: "Vorgemerkt" };

function zeit(d: Date): string {
  const t = new Date(d);
  const z = (n: number) => String(n).padStart(2, "0");
  return `${z(t.getUTCDate())}.${z(t.getUTCMonth() + 1)}.${t.getUTCFullYear()}`;
}

export default async function Vorgemerkt() {
  // Die Pruefung steht IN der Seite. Ein ausgeblendeter Menuepunkt ist keine
  // Pruefung – ein altes Lesezeichen kaeme sonst durch.
  const wer = await verlangeRecht("loeschen");
  const zeilen = await vorgemerkte(sichtVon(wer));

  const alleIds = zeilen.filter((z) => !z.dateien_weg).map((z) => z.id).join(",");

  return (
    <main>
      <Kopf wer={wer} />
      <h1>Vorgemerkt zum Löschen</h1>

      <p className="leise">
        Vormerken blendet aus, die Dateien bleiben <strong>{LOESCHFRIST_TAGE} Tage</strong>{" "}
        liegen. Erst danach entfernt <code>tools/aufraeumen.sh</code> Original und
        Ableitungen. Die Zeile in der Datenbank bleibt für immer stehen – sonst läse der
        nächste Ingest dieselbe Datei aus OneDrive wieder ein.
      </p>

      {zeilen.length === 0 ? (
        <p className="hinweis">Nichts vorgemerkt.</p>
      ) : (
        <>
          <form action={zurueckholenAktion} className="karte">
            <input type="hidden" name="ids" value={alleIds} />
            <p>
              <strong>{zeilen.length}</strong> vorgemerkt,{" "}
              {zeilen.filter((z) => z.dateien_weg).length} davon schon aufgeräumt.
            </p>
            {alleIds ? (
              <button className="haupt" type="submit">
                Alle {alleIds.split(",").length} mit Dateien zurückholen
              </button>
            ) : null}
          </form>

          <div className="gitter">
            {zeilen.map((z) => (
              <div key={z.id} className="kachel-rahmen">
                {z.dateien_weg ? (
                  <div className="kachel leer">
                    <span className="leise">Dateien entfernt</span>
                  </div>
                ) : (
                  <Link href={`/bild/${z.id}`} className="kachel">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/datei/${z.id}/vorschau`} alt="" loading="lazy"
                         decoding="async" width={300} height={300} />
                    <span className="marke">
                      noch {Math.max(0, z.resttage)} Tag(e)
                    </span>
                  </Link>
                )}
                <span className="leise">
                  vorgemerkt {zeit(z.geloescht_am)}
                </span>
                {!z.dateien_weg ? (
                  <form action={zurueckholenAktion}>
                    <input type="hidden" name="ids" value={z.id} />
                    <button className="klein" type="submit">zurückholen</button>
                  </form>
                ) : null}
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
