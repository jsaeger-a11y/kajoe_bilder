/**
 * Die Wiedergabefassung eines Videos erzeugen lassen.
 *
 * Gerechnet wird NICHT hier, sondern in `ingest/ableitung.py` aus Phase 1b –
 * ueber `tools/wiedergeben.sh`. Zwei Fassungen derselben ffmpeg-Zeile laufen
 * frueher oder spaeter auseinander, und die eine ist gemessen und geprueft.
 *
 * Erzeugt wird erst beim ersten Abspielen. H.264 ist bei gleicher Qualitaet
 * rund doppelt so gross wie HEVC, und die meisten Videos sieht ohnehin nie
 * jemand an.
 */

import "server-only";

import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";

import { vergissAbgeleitetGroesse } from "./bestand";
import { abfrage, eineZeile } from "./db";
import { ableitungspfad, originalpfad } from "./dateien";
import { NICHT_GELOESCHT } from "./sichtbar";
import { PROJEKTWURZEL } from "./umgebung";

const ausfuehren = promisify(execFile);

export interface Ergebnis {
  ok: boolean;
  weg?: string;
  sekunden?: number;
  groesse?: number;
  fehler?: string;
}

// Zwei Betrachter, die dasselbe Video oeffnen, sollen nicht zwei ffmpeg-Laeufe
// ausloesen. Der zweite haengt sich an den ersten.
const laufend = new Map<number, Promise<Ergebnis>>();

export async function wiedergabeErzeugen(bildId: number): Promise<Ergebnis> {
  const schon = laufend.get(bildId);
  if (schon) return schon;

  const versprechen = erzeugen(bildId).finally(() => laufend.delete(bildId));
  laufend.set(bildId, versprechen);
  return versprechen;
}

async function erzeugen(bildId: number): Promise<Ergebnis> {
  const zeile = await eineZeile<{
    pfad: string; sha256: string; jahr: number; monat: number;
    typ: string; hdr: boolean; wiedergabe_erzeugt: boolean;
  }>(
    `SELECT pfad, sha256, jahr, monat, typ, hdr, wiedergabe_erzeugt
       FROM bild WHERE id = $1 AND ${NICHT_GELOESCHT}`,
    [bildId],
  );

  if (!zeile) return { ok: false, fehler: "Zeile nicht gefunden." };
  if (zeile.typ !== "video") return { ok: false, fehler: "Kein Video." };
  if (zeile.wiedergabe_erzeugt) return { ok: true, weg: "war schon da" };

  const ziel = ableitungspfad(zeile.jahr, zeile.monat, zeile.sha256, "wiedergabe");

  let ausgabe: string;
  try {
    const lauf = await ausfuehren(
      join(PROJEKTWURZEL, "tools", "wiedergeben.sh"),
      ["--quelle", originalpfad(zeile.pfad), "--ziel", ziel],
      // Ein langes Video darf nicht am Zeitlimit scheitern: gemessen sind rund
      // sechs Sekunden je Minute Video ueber VAAPI, sechzehn ueber den
      // Prozessor. Eine halbe Stunde reicht auch fuer den langsamen Weg.
      { timeout: 30 * 60 * 1000, maxBuffer: 1 << 20 },
    );
    ausgabe = lauf.stdout;
  } catch (fehler) {
    const f = fehler as { stdout?: string; message?: string };
    ausgabe = f.stdout ?? "";
    if (!ausgabe.trim()) {
      return { ok: false, fehler: f.message ?? "Umwandlung gescheitert." };
    }
  }

  let ergebnis: Ergebnis;
  try {
    ergebnis = JSON.parse(ausgabe.trim().split("\n").pop() ?? "{}") as Ergebnis;
  } catch {
    return { ok: false, fehler: "Antwort der Umwandlung nicht lesbar." };
  }

  // Erst die Datei, dann das Merkmal – wie beim Ingest. Andersherum stuende ein
  // Video als fertig in der Datenbank, dessen Fassung nie geschrieben wurde.
  if (ergebnis.ok) {
    await abfrage(`UPDATE bild SET wiedergabe_erzeugt = TRUE WHERE id = $1`, [bildId]);
    // Eine Wiedergabefassung ist gross genug, dass die Uebersicht sonst eine
    // ueberholte Zahl zeigt.
    vergissAbgeleitetGroesse();
  }
  return ergebnis;
}
