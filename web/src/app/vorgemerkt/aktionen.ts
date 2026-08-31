"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { vormerkenEinzeln, zurueckholen } from "@/lib/loeschen";
import { idsAusFeld } from "@/lib/markierung";
import { sichtVon } from "@/lib/sichtbar";
import { aktionRecht } from "@/lib/zugriff";

/** Zurueckholen, solange die Frist laeuft. Nur mit dem Recht `loeschen`. */
export async function zurueckholenAktion(formular: FormData): Promise<void> {
  const wer = await aktionRecht("loeschen");
  const ids = idsAusFeld(String(formular.get("ids") ?? ""));
  if (!ids.length) throw new Error("Es ist nichts ausgewählt.");
  // Die Sicht steht auch hier in der Abfrage: eine Kennung aus einem
  // gesperrten Jahrgang laesst sich in ein Formular schreiben.
  await zurueckholen(ids, sichtVon(wer));
  revalidatePath("/vorgemerkt");
  revalidatePath("/galerie");
}

/**
 * Einzelnes Bild vormerken – aus der Einzelansicht heraus.
 *
 * Danach wird weitergeleitet, und zwar zwingend: das Bild hat die Seite, auf
 * der man gerade steht, soeben verlassen. Ohne die Weiterleitung baut Next
 * dieselbe Einzelansicht neu auf, findet das Bild nicht mehr und zeigt eine
 * 404 – als waere etwas schiefgegangen, obwohl alles richtig lief.
 */
export async function einzelVormerken(formular: FormData): Promise<void> {
  const wer = await aktionRecht("loeschen");
  const id = Number(formular.get("bild"));
  if (!Number.isInteger(id)) throw new Error("Unbrauchbare Angabe.");

  await vormerkenEinzeln(id, sichtVon(wer));
  revalidatePath("/galerie");
  revalidatePath("/vorgemerkt");
  revalidatePath(`/bild/${id}`);

  // Zurueck dorthin, wo man war – mit Filter und Markierungen. Nur eigene
  // Pfade, damit die Angabe aus dem Formular niemanden nach draussen schickt.
  const zurueck = String(formular.get("zurueck") ?? "");
  redirect(zurueck.startsWith("/galerie") ? zurueck : "/galerie");
}
