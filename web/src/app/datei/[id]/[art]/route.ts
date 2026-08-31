/**
 * Ableitungen ausliefern – Vorschau, Ansicht, Wiedergabefassung.
 *
 * Die Anmeldung wird bei JEDER Anfrage geprueft, nicht nur beim Aufbau der
 * Galerie: ein Bild ist eine Adresse wie jede andere, und ein Lesezeichen
 * ueberlebt das Abmelden.
 *
 * **Das ist der wichtigste Ort fuer die Jahresfreischaltung.** Alles andere
 * verbirgt Bilder in einer Anzeige; hier gehen sie ueber die Leitung. Eine
 * geratene oder gemerkte Kennung darf kein Vorschaubild aus einem gesperrten
 * Jahrgang liefern – und ein Vorschaubild ist das Bild.
 */

import { eineZeile } from "@/lib/db";
import { ARTEN, ableitungspfad, ausliefern, istArt } from "@/lib/dateien";
import { sichtVon, sichtbar } from "@/lib/sichtbar";
import { angemeldet } from "@/lib/sitzung";

// Ein Jahr. Der Dateiname ist der sha256 des Inhalts – die Datei aendert sich nie.
const LEBENSDAUER = 60 * 60 * 24 * 365;

export async function GET(
  anfrage: Request,
  { params }: { params: Promise<{ id: string; art: string }> },
): Promise<Response> {
  const wer = await angemeldet();
  if (!wer) return new Response("nicht angemeldet", { status: 401 });

  const { id, art } = await params;

  // Nur die drei bekannten Arten. Alles andere – auch "original" – gibt es hier
  // nicht, und zwar bevor ueberhaupt in die Datenbank gesehen wird.
  if (!istArt(art)) return new Response("nicht gefunden", { status: 404 });

  const nummer = Number(id);
  if (!Number.isInteger(nummer) || nummer < 1) {
    return new Response("nicht gefunden", { status: 404 });
  }

  // Vorgemerkt geloescht ODER gesperrter Jahrgang: dieselbe Bedingung, dieselbe
  // Antwort. 404 und nicht 403 – wer ein Jahr nicht sehen darf, soll auch nicht
  // erfahren, welche Kennungen es darin gibt.
  const s = sichtbar(sichtVon(wer), { ab: 2 });
  const zeile = await eineZeile<{
    sha256: string; jahr: number; monat: number; typ: string;
    vorschau_erzeugt: boolean; wiedergabe_erzeugt: boolean;
  }>(
    `SELECT sha256, jahr, monat, typ, vorschau_erzeugt, wiedergabe_erzeugt
       FROM bild WHERE id = $1 AND ${s.text}`,
    [nummer, ...s.werte],
  );

  // Ein Pfad ohne Zeile in `bild` wird nicht ausgeliefert.
  if (!zeile) return new Response("nicht gefunden", { status: 404 });
  if (art !== "wiedergabe" && !zeile.vorschau_erzeugt) {
    return new Response("noch keine Ableitung", { status: 404 });
  }
  if (art === "wiedergabe" && (zeile.typ !== "video" || !zeile.wiedergabe_erzeugt)) {
    return new Response("noch keine Wiedergabefassung", { status: 404 });
  }

  return ausliefern(
    ableitungspfad(zeile.jahr, zeile.monat, zeile.sha256, art),
    ARTEN[art].typ,
    anfrage.headers.get("range"),
    LEBENSDAUER,
  );
}
