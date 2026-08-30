/**
 * Erzeugt die Wiedergabefassung eines Videos und meldet, wie es lief.
 *
 * Wird von der Einzelansicht beim ersten Aufruf angestossen. Die Antwort
 * kommt erst, wenn ffmpeg fertig ist – gemessen rund sechs Sekunden je Minute
 * Video ueber VAAPI.
 */

import { wiedergabeErzeugen } from "@/lib/wiedergabe";
import { angemeldet } from "@/lib/sitzung";

export async function POST(
  _anfrage: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!(await angemeldet())) {
    return Response.json({ ok: false, fehler: "nicht angemeldet" }, { status: 401 });
  }

  const nummer = Number((await params).id);
  if (!Number.isInteger(nummer) || nummer < 1) {
    return Response.json({ ok: false, fehler: "unbekannt" }, { status: 404 });
  }

  const ergebnis = await wiedergabeErzeugen(nummer);
  return Response.json(ergebnis, { status: ergebnis.ok ? 200 : 500 });
}
