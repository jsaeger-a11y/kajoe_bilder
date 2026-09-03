/**
 * Einen Gesichtsausschnitt ausliefern.
 *
 * **Aus der Ansichtsfassung, nicht aus dem Original.** Das Original ist HEIC;
 * es dafür zu dekodieren wäre je Kachel eine halbe Sekunde für ein Bild von
 * 200 Punkten Kantenlänge. Die Ansicht liegt als JPEG bereit, und der Kasten
 * in `gesicht.kasten` bezieht sich ohnehin auf sie.
 *
 * Wie bei `/datei/…`: Anmeldung bei JEDER Anfrage, Recht bei jeder Anfrage,
 * und der Pfad kommt nie aus der Adresse – aus der Adresse kommt eine Nummer,
 * den Pfad baut `ausschnitt()` aus Jahr, Monat und sha256 der zugehörigen
 * Zeile. Damit gibt es keinen Weg über `../..` und keinen zum Original.
 *
 * **Gesichter aus vorgemerkt gelöschten Bildern erscheinen nicht** – das
 * steckt in `sichtbar()` und damit in `ausschnitt()`, zusammen mit der
 * Jahresfreischaltung.
 */

import sharp from "sharp";

import { ableitungspfad } from "@/lib/dateien";
import { ausschnitt } from "@/lib/personen";
import { sichtVon } from "@/lib/sichtbar";
import { angemeldet } from "@/lib/sitzung";

/**
 * Ein Jahr. Der Ausschnitt hängt an der Kennung des Fundes, und die Kästen
 * ändert kein Lauf nachträglich – ein neuer Lauf legt neue Funde an.
 */
const LEBENSDAUER = 60 * 60 * 24 * 365;

/** Kantenlänge der ausgelieferten Kachel. */
const KANTE = 200;

/**
 * Der Kasten des Detektors sitzt eng am Gesicht – Stirn und Kinn sind oft
 * angeschnitten. Mit halber Kastenbreite Rand herum erkennt ein Mensch die
 * Person deutlich sicherer, und genau darum geht es auf diesen Seiten.
 */
const RAND = 1.5;

export async function GET(
  _anfrage: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const wer = await angemeldet();
  if (!wer) return new Response("nicht angemeldet", { status: 401 });

  const sicht = sichtVon(wer);
  // Ohne das Recht `gesichter` gibt es hier nichts – auch nicht mit einer
  // geratenen Kennung. Dass die Seiten dazu nicht verlinkt sind, ist keine
  // Prüfung.
  if (!sicht.gesichter) return new Response("keine Berechtigung", { status: 403 });

  const nummer = Number((await params).id);
  if (!Number.isInteger(nummer) || nummer < 1) {
    return new Response("nicht gefunden", { status: 404 });
  }

  const z = await ausschnitt(nummer, sicht);
  if (!z) return new Response("nicht gefunden", { status: 404 });

  const [x1, y1, x2, y2] = z.kasten;
  const pfad = ableitungspfad(z.jahr, z.monat, z.sha256, "ansicht");

  try {
    const bild = sharp(pfad, { failOn: "none" });
    const angaben = await bild.metadata();
    const breite = angaben.width ?? 0;
    const hoehe = angaben.height ?? 0;
    if (!breite || !hoehe) return new Response("nicht lesbar", { status: 404 });

    // Quadratisch um die Mitte des Kastens, dann in das Bild hineingeschoben.
    // Ein Rechteck wäre einfacher, aber die Kacheln sollen gleich gross sein –
    // ein Raster aus verschieden hohen Bildern ist auf dem Telefon unruhig.
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const seite = Math.min(
      Math.max(8, Math.round(Math.max(x2 - x1, y2 - y1) * RAND)),
      breite,
      hoehe,
    );
    const links = Math.min(Math.max(0, Math.round(mx - seite / 2)), breite - seite);
    const oben = Math.min(Math.max(0, Math.round(my - seite / 2)), hoehe - seite);

    const daten = await bild
      .extract({ left: links, top: oben, width: seite, height: seite })
      .resize(KANTE, KANTE, { fit: "cover" })
      .jpeg({ quality: 82 })
      .toBuffer();

    return new Response(new Uint8Array(daten), {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        // `private`: gehört einer angemeldeten Person und darf in keinem
        // gemeinsamen Zwischenspeicher landen.
        "Cache-Control": `private, max-age=${LEBENSDAUER}, immutable`,
        "Content-Length": String(daten.length),
      },
    });
  } catch {
    // Fehlende oder kaputte Ableitung: dieselbe Antwort wie eine unbekannte
    // Kennung. Ein Unterschied wäre eine Auskunft darüber, welche Kennungen es
    // gibt.
    return new Response("nicht gefunden", { status: 404 });
  }
}
