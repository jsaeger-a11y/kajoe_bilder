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
import { sichtVon, sichtbar } from "@/lib/sichtbar";
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
  const wer = await angemeldet();
  if (!wer) return new Response("nicht angemeldet", { status: 401 });

  const nummer = Number((await params).id);
  if (!Number.isInteger(nummer) || nummer < 1) {
    return new Response("nicht gefunden", { status: 404 });
  }

  const roh = new URL(anfrage.url).searchParams.get("art") ?? "jpeg";
  const art = istArt(roh) ? roh : "jpeg";

  // Vorgemerkte Aufnahmen und gesperrte Jahrgaenge werden nicht ausgeliefert –
  // die Bedingung steht an einer Stelle und wird auch hier von dort geholt.
  const s = sichtbar(sichtVon(wer), { ab: 2 });
  const zeile = await eineZeile<Zeile>(
    `SELECT id::int AS id, pfad, dateityp, typ, aufnahme_lokal, dateigroesse,
            breite, hoehe
       FROM bild WHERE id = $1 AND ${s.text}`,
    [nummer, ...s.werte],
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
