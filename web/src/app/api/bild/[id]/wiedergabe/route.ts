/**
 * Erzeugt die Wiedergabefassung eines Videos und meldet, wie es lief.
 *
 * Wird von der Einzelansicht beim ersten Aufruf angestossen. Die Antwort
 * kommt erst, wenn ffmpeg fertig ist – gemessen rund sechs Sekunden je Minute
 * Video ueber VAAPI.
 */

import { eineZeile } from "@/lib/db";
import { sichtVon, sichtbar } from "@/lib/sichtbar";
import { angemeldet } from "@/lib/sitzung";
import { wiedergabeErzeugen } from "@/lib/wiedergabe";

export async function POST(
  _anfrage: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const wer = await angemeldet();
  if (!wer) {
    return Response.json({ ok: false, fehler: "nicht angemeldet" }, { status: 401 });
  }

  const nummer = Number((await params).id);
  if (!Number.isInteger(nummer) || nummer < 1) {
    return Response.json({ ok: false, fehler: "unbekannt" }, { status: 404 });
  }

  // Erst pruefen, dann rechnen: ohne diese Abfrage liesse sich ueber eine
  // geratene Kennung eine ffmpeg-Umwandlung in einem gesperrten Jahrgang
  // anstossen – und die Datei laege danach da.
  const s = sichtbar(sichtVon(wer), { ab: 2 });
  const darf = await eineZeile(
    `SELECT 1 FROM bild WHERE id = $1 AND ${s.text}`,
    [nummer, ...s.werte],
  );
  if (!darf) return Response.json({ ok: false, fehler: "unbekannt" }, { status: 404 });

  const ergebnis = await wiedergabeErzeugen(nummer);
  return Response.json(ergebnis, { status: ergebnis.ok ? 200 : 500 });
}
