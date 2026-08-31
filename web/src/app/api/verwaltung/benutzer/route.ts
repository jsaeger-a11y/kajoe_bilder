/**
 * Kontoliste als JSON – nur fuer Verwalter.
 *
 * Die Route prueft die Rolle SELBST. Dass die Verwaltungsseite nur Verwaltern
 * angezeigt wird, sagt nichts darueber, wer diese Adresse aufruft.
 */

import { abfrage } from "@/lib/db";
import { routeVerwalter } from "@/lib/zugriff";

export async function GET(): Promise<Response> {
  const pruefung = await routeVerwalter();
  if (!pruefung.ok) return pruefung.antwort;

  const zeilen = await abfrage(
    // `jahre` ist NULL, wenn alle Jahrgaenge freigeschaltet sind – auch
    // kuenftige. Das ist etwas anderes als eine Liste aller heutigen Jahre und
    // wird hier deshalb unveraendert durchgereicht, nicht zu [] geglaettet.
    `SELECT id::int AS id, benutzername, rolle, aktiv, rechte, jahre, fehlversuche
       FROM benutzer ORDER BY benutzername`,
  );
  return Response.json({ benutzer: zeilen });
}
