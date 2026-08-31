/**
 * Eine einzelne Aufnahme herunterladen.
 *
 *   /herunterladen/bild/42?art=jpeg      vollaufloesendes JPEG (Vorgabe)
 *   /herunterladen/bild/42?art=original  die Datei, wie sie hereinkam
 *
 * Die Anmeldung wird bei JEDER Anfrage geprueft. Ein Lesezeichen ueberlebt
 * das Abmelden.
 */

import { eineZeile } from "@/lib/db";
import {
  anhangKopfzeile, istArt, strom, zieldateiname, zielendung,
} from "@/lib/herunterladen";
import { NICHT_GELOESCHT } from "@/lib/sichtbar";
import { angemeldet } from "@/lib/sitzung";

interface Zeile {
  id: number;
  pfad: string;
  dateityp: string;
  typ: string;
  aufnahme_lokal: Date;
  dateigroesse: string;
  breite: number | null;
  hoehe: number | null;
}

export async function GET(
  anfrage: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!(await angemeldet())) {
    return new Response("nicht angemeldet", { status: 401 });
  }

  const nummer = Number((await params).id);
  if (!Number.isInteger(nummer) || nummer < 1) {
    return new Response("nicht gefunden", { status: 404 });
  }

  const roh = new URL(anfrage.url).searchParams.get("art") ?? "jpeg";
  const art = istArt(roh) ? roh : "jpeg";

  // Vorgemerkte Aufnahmen werden nicht ausgeliefert – NICHT_GELOESCHT steht an
  // einer Stelle und wird auch hier von dort geholt.
  const zeile = await eineZeile<Zeile>(
    `SELECT id::int AS id, pfad, dateityp, typ, aufnahme_lokal, dateigroesse,
            breite, hoehe
       FROM bild WHERE id = $1 AND ${NICHT_GELOESCHT}`,
    [nummer],
  );
  if (!zeile) return new Response("nicht gefunden", { status: 404 });

  const endung = zielendung(zeile.pfad, zeile, art);
  const name = zieldateiname(zeile.aufnahme_lokal, endung);

  return new Response(
    strom(["einzeln", "--id", String(nummer), "--art", art], null, anfrage.signal),
    {
      headers: {
        "Content-Type": endung === "jpg" ? "image/jpeg" : "application/octet-stream",
        "Content-Disposition": anhangKopfzeile(name),
        // Eine Ableitung, die gerade erst entsteht, gehoert in keinen
        // gemeinsamen Zwischenspeicher.
        "Cache-Control": "private, no-store",
      },
    },
  );
}
