/**
 * Stand der Verarbeitung als JSON – nur fuer Verwalter.
 *
 * Die Route prueft die Rolle SELBST. Dass der Menuepunkt fehlt, sagt nichts
 * darueber, wer diese Adresse aufruft.
 */

import { eingangZustand, laufend, letzteLaeufe, tempo, wartetAufStart } from "@/lib/verarbeitung";
import { routeVerwalter } from "@/lib/zugriff";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const pruefung = await routeVerwalter();
  if (!pruefung.ok) return pruefung.antwort;

  const [eingang, aktiv, wartet, laeufe] = await Promise.all([
    eingangZustand(), laufend(), wartetAufStart(), letzteLaeufe(5),
  ]);

  return Response.json({
    eingang,
    wartet,
    laeuft: aktiv
      ? { ...aktiv, tempo: await tempo(aktiv.id, aktiv.gesamt, aktiv.erledigt) }
      : null,
    letzte: laeufe,
  });
}
