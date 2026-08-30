/**
 * Ableitungen von der Platte ausliefern.
 *
 * **Nicht aus `public/`.** Die Dateien liegen unter
 * `/data/kajoe_bilder/abgeleitet/` und duerfen nur an Angemeldete gehen; was
 * in `public/` liegt, liefert Next an jeden aus, der die Adresse kennt.
 *
 * **Der Pfad kommt nie aus der Adresse.** Aus der Adresse kommt eine Nummer;
 * den Pfad baut diese Datei aus Jahr, Monat und sha256 der zugehoerigen Zeile.
 * Damit gibt es keinen Weg, ueber `../..` irgendwohin zu zeigen, und keinen
 * Weg, das Original zu bekommen.
 */

import "server-only";

import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";

export const DATEN = "/data/kajoe_bilder";
export const ABGELEITET = join(DATEN, "abgeleitet");
export const ORIGINAL = join(DATEN, "original");

/** Die einzigen drei Arten, die je ausgeliefert werden. Das Original ist nicht dabei. */
export const ARTEN = {
  vorschau: { endung: "-vorschau.jpg", typ: "image/jpeg" },
  ansicht: { endung: "-ansicht.jpg", typ: "image/jpeg" },
  wiedergabe: { endung: "-wiedergabe.mp4", typ: "video/mp4" },
} as const;

export type Art = keyof typeof ARTEN;

export function istArt(wert: string): wert is Art {
  return Object.prototype.hasOwnProperty.call(ARTEN, wert);
}

export function ableitungspfad(jahr: number, monat: number, sha256: string, art: Art): string {
  const ordner = `${String(jahr).padStart(4, "0")}/${String(monat).padStart(2, "0")}`;
  return join(ABGELEITET, ordner, `${sha256}${ARTEN[art].endung}`);
}

export function originalpfad(pfad: string): string {
  return join(ORIGINAL, pfad);
}

/**
 * Datei ausliefern, mit Range-Unterstuetzung.
 *
 * Ohne Range springt ein Video im Browser nicht – der Betrachter fordert beim
 * Spulen einen Ausschnitt an, und wer immer die ganze Datei schickt, laesst
 * ihn von vorn laden.
 */
export async function ausliefern(
  pfad: string,
  inhaltstyp: string,
  bereich: string | null,
  lebensdauer: number,
): Promise<Response> {
  let angaben;
  try {
    angaben = await stat(pfad);
  } catch {
    return new Response("nicht gefunden", { status: 404 });
  }
  if (!angaben.isFile()) return new Response("nicht gefunden", { status: 404 });

  const groesse = angaben.size;
  // `private`: die Datei gehoert einer angemeldeten Person und darf in keinem
  // gemeinsamen Zwischenspeicher landen. `immutable`: der Dateiname ist der
  // sha256 des Inhalts, sie aendert sich nie.
  const kopf: Record<string, string> = {
    "Content-Type": inhaltstyp,
    "Cache-Control": `private, max-age=${lebensdauer}, immutable`,
    "Accept-Ranges": "bytes",
    "Content-Disposition": "inline",
  };

  const treffer = bereich?.match(/^bytes=(\d*)-(\d*)$/);
  if (treffer) {
    const von = treffer[1] === "" ? Math.max(0, groesse - Number(treffer[2])) : Number(treffer[1]);
    const bis = treffer[1] === "" ? groesse - 1 : treffer[2] === "" ? groesse - 1 : Math.min(Number(treffer[2]), groesse - 1);
    if (!Number.isFinite(von) || von > bis || von >= groesse) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${groesse}` } });
    }
    const strom = Readable.toWeb(createReadStream(pfad, { start: von, end: bis })) as ReadableStream;
    return new Response(strom, {
      status: 206,
      headers: {
        ...kopf,
        "Content-Range": `bytes ${von}-${bis}/${groesse}`,
        "Content-Length": String(bis - von + 1),
      },
    });
  }

  const strom = Readable.toWeb(createReadStream(pfad)) as ReadableStream;
  return new Response(strom, {
    status: 200,
    headers: { ...kopf, "Content-Length": String(groesse) },
  });
}
