/**
 * Ein Paket herunterladen – aus einer Auswahlliste oder aus der Sammelauswahl.
 *
 * POST, weil bei zweihundert Kennungen keine Adresse mehr reicht. Ein
 * Formular mit `method="POST"` loest den Download im Browser genauso aus wie
 * ein Verweis; JavaScript braucht es dafuer nicht.
 *
 * Felder:
 *   art    "jpeg" | "original"
 *   liste  Nummer einer Auswahlliste   – oder –
 *   ids    "1,2,3" aus der Sammelauswahl
 *   teil   1-basiert, wenn die Liste groesser ist als ein Paket fasst
 */

import { abfrage } from "@/lib/db";
import {
  HOECHSTENS_JE_PAKET, anhangKopfzeile, istArt, sauberer, strom,
} from "@/lib/herunterladen";
import { bilderDerListe, listeZumSehen } from "@/lib/listen";
import { idsAusFeld } from "@/lib/markierung";
import { NICHT_GELOESCHT } from "@/lib/sichtbar";
import { angemeldet } from "@/lib/sitzung";

export async function POST(anfrage: Request): Promise<Response> {
  const wer = await angemeldet();
  if (!wer) return new Response("nicht angemeldet", { status: 401 });

  const formular = await anfrage.formData();
  const rohArt = String(formular.get("art") ?? "jpeg");
  const art = istArt(rohArt) ? rohArt : "jpeg";
  const teil = Math.max(1, Number(formular.get("teil") ?? 1) || 1);

  let ids: number[];
  let ordner: string;
  let dateiname: string;

  const listenNummer = Number(formular.get("liste"));
  if (Number.isInteger(listenNummer) && listenNummer > 0) {
    // Aus einer fremden, FREIGEGEBENEN Liste darf heruntergeladen werden –
    // sehen und herunterladen gehoeren zusammen, geaendert wird sie dadurch
    // nicht. Aus einer nicht freigegebenen nicht: listeZumSehen() prueft das
    // in der Abfrage, mit der Kennung aus der Sitzung.
    const liste = await listeZumSehen(listenNummer, wer.benutzerId);
    if (!liste) return new Response("nicht gefunden", { status: 404 });

    const bilder = await bilderDerListe(listenNummer);
    ids = bilder.map((b) => b.id);
    ordner = sauberer(liste.name);
    dateiname = `${sauberer(liste.name)}.zip`;
  } else {
    ids = idsAusFeld(String(formular.get("ids") ?? ""));
    if (!ids.length) return new Response("nichts ausgewählt", { status: 400 });

    // Was aus der Sammelauswahl kommt, ist ungeprueft: nur Zeilen nehmen, die
    // es gibt und die nicht vorgemerkt sind.
    const vorhanden = await abfrage<{ id: number }>(
      `SELECT id::int AS id FROM bild WHERE id = ANY($1::bigint[]) AND ${NICHT_GELOESCHT}`,
      [ids],
    );
    const erlaubt = new Set(vorhanden.map((z) => Number(z.id)));
    ids = ids.filter((i) => erlaubt.has(i));
    ordner = "Auswahl";
    dateiname = `Auswahl-${new Date().toISOString().slice(0, 10)}.zip`;
  }

  if (!ids.length) return new Response("nichts auszuliefern", { status: 404 });

  const teile = Math.ceil(ids.length / HOECHSTENS_JE_PAKET);
  if (teile > 1) {
    const von = (teil - 1) * HOECHSTENS_JE_PAKET;
    if (von >= ids.length) return new Response("diesen Teil gibt es nicht", { status: 404 });
    ids = ids.slice(von, von + HOECHSTENS_JE_PAKET);
    dateiname = dateiname.replace(/\.zip$/, `-Teil-${teil}-von-${teile}.zip`);
  }

  return new Response(
    strom(["paket", "--art", art, "--ordner", ordner], ids.join("\n"), anfrage.signal),
    {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": anhangKopfzeile(dateiname),
        "Cache-Control": "private, no-store",
        // Keine Content-Length: die Groesse steht erst fest, wenn das letzte
        // Bild umgewandelt ist. Der Browser zeigt dann keinen Fortschritt in
        // Prozent, dafuer laeuft der Strom sofort los.
        "X-Accel-Buffering": "no",
      },
    },
  );
}
