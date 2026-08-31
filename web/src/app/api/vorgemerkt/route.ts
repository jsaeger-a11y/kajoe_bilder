/**
 * Die vorgemerkten Bilder als JSON – nur mit dem Recht `loeschen`.
 *
 * Die Route prueft das Recht SELBST. Dass der Menuepunkt fehlt, sagt nichts
 * darueber, wer diese Adresse aufruft.
 */

import { vorgemerkte } from "@/lib/loeschen";
import { sichtVon } from "@/lib/sichtbar";
import { routeRecht } from "@/lib/zugriff";

export async function GET(): Promise<Response> {
  const pruefung = await routeRecht("loeschen");
  if (!pruefung.ok) return pruefung.antwort;

  const zeilen = await vorgemerkte(sichtVon(pruefung.wer));
  return Response.json({
    anzahl: zeilen.length,
    bilder: zeilen.map((z) => ({
      id: z.id, sha256: z.sha256, geloescht_am: z.geloescht_am,
      resttage: z.resttage, dateien_weg: z.dateien_weg,
    })),
  });
}
