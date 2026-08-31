/**
 * Gruppen fuer einen Kartenausschnitt – nur mit dem Recht `karte`.
 *
 * Die Route prueft das Recht SELBST. Dass der Menuepunkt fehlt und die Seite
 * mit 404 antwortet, sagt nichts darueber, wer diese Adresse aufruft; die
 * Aufnahmeorte sind der empfindlichste Teil des Bestands.
 */

import { filterAusSuche } from "@/lib/galerie";
import { ausschnitt, rahmenAusSuche, zoomAusSuche } from "@/lib/karte";
import { sichtVon } from "@/lib/sichtbar";
import { routeRecht } from "@/lib/zugriff";

export async function GET(anfrage: Request): Promise<Response> {
  const pruefung = await routeRecht("karte");
  if (!pruefung.ok) return pruefung.antwort;

  const suche = Object.fromEntries(new URL(anfrage.url).searchParams);
  const filter = filterAusSuche(suche);
  const antwort = await ausschnitt(
    filter,
    sichtVon(pruefung.wer),
    rahmenAusSuche(suche),
    zoomAusSuche(suche),
  );

  // Kein Zwischenspeicher: die Antwort haengt an der Anmeldung, und eine
  // Kartenantwort mit privaten Koordinaten hat in keinem Cache etwas verloren.
  return Response.json(antwort, {
    headers: { "Cache-Control": "no-store" },
  });
}
