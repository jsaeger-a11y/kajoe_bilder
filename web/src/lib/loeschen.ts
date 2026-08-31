/**
 * Zweistufiges Loeschen.
 *
 * **Vormerken** setzt `geloescht_am`. Das Bild verschwindet aus der Galerie
 * und aus den Listen, die Datei bleibt liegen. Erst nach dreissig Tagen
 * entfernt der Aufraeumlauf Original und Ableitungen.
 *
 * Ein Stapellauf ueber hunderte Bilder, der sofort Dateien entfernt, ist nicht
 * umkehrbar und wird es auch nicht durch eine Rueckfrage.
 *
 * **Die Zeile in `bild` bleibt stehen, auch nach dem Aufraeumen.** Sie ist der
 * Grabstein, an dem der naechste Ingest erkennt, dass diese Datei schon einmal
 * da war. Ohne ihn liest er sie aus OneDrive wieder ein, und alles, was gerade
 * aussortiert wurde, ist beim naechsten Kopieren zurueck.
 */

import "server-only";

import { abfrage } from "./db";
import { inListen } from "./listen";
import { LOESCHFRIST_TAGE } from "./rechte";
import { sichtbar, vorgemerktSichtbar, type Sicht } from "./sichtbar";

export interface Vormerkbericht {
  vorgemerkt: number;
  wegenListe: number[];
  schonWeg: number;
}

/**
 * Sammelloeschung: Bilder in einer Auswahlliste bleiben verschont.
 *
 * Was jemand ausdruecklich gesammelt hat, darf kein Stapellauf stillschweigend
 * mitnehmen – und "stillschweigend" ist hier das Wort: deshalb kommt zurueck,
 * welche uebersprungen wurden, und nicht nur wie viele.
 */
export async function vormerkenSammel(ids: number[], sicht: Sicht): Promise<Vormerkbericht> {
  if (!ids.length) return { vorgemerkt: 0, wegenListe: [], schonWeg: 0 };

  const geschuetzt = await inListen(ids);
  const zuTun = ids.filter((id) => !geschuetzt.has(id));

  // Was jemand nicht sehen darf, darf er auch nicht loeschen. Die Bedingung
  // steht IN der Abfrage – eine Kennung aus einem gesperrten Jahrgang laesst
  // sich in ein Formular schreiben, in die Abfrage nicht.
  const s = sichtbar(sicht, { ab: 2 });
  const zeilen = zuTun.length
    ? await abfrage<{ id: number }>(
        `UPDATE bild SET geloescht_am = now()
          WHERE id = ANY($1::bigint[]) AND ${s.text}
          RETURNING id::int AS id`,
        [zuTun, ...s.werte],
      )
    : [];

  return {
    vorgemerkt: zeilen.length,
    wegenListe: [...geschuetzt],
    schonWeg: zuTun.length - zeilen.length,
  };
}

/**
 * Einzelloeschung: auch ein Bild aus einer Liste laesst sich vormerken – die
 * Person hat es vor sich und entscheidet. Der Hinweis, in wie vielen Listen es
 * steht, gehoert in die Anzeige davor.
 */
export async function vormerkenEinzeln(id: number, sicht: Sicht): Promise<boolean> {
  const s = sichtbar(sicht, { ab: 2 });
  const zeilen = await abfrage(
    `UPDATE bild SET geloescht_am = now() WHERE id = $1 AND ${s.text} RETURNING id`,
    [id, ...s.werte],
  );
  return zeilen.length > 0;
}

/** Zurueckholen, solange die Frist laeuft. */
export async function zurueckholen(ids: number[], sicht: Sicht): Promise<number> {
  if (!ids.length) return 0;
  const s = vorgemerktSichtbar(sicht, { ab: 2 });
  const zeilen = await abfrage(
    `UPDATE bild SET geloescht_am = NULL
      WHERE id = ANY($1::bigint[]) AND ${s.text}
      RETURNING id`,
    [ids, ...s.werte],
  );
  return zeilen.length;
}

export interface Vorgemerkt {
  id: number;
  sha256: string;
  typ: string;
  jahr: number;
  monat: number;
  aufnahme_lokal: Date;
  geloescht_am: Date;
  resttage: number;
  dateien_weg: boolean;
}

export async function vorgemerkte(sicht: Sicht): Promise<Vorgemerkt[]> {
  const s = vorgemerktSichtbar(sicht, { ab: 2 });
  const zeilen = await abfrage<Vorgemerkt & { resttage: string }>(
    `SELECT id::int AS id, sha256, typ, jahr, monat, aufnahme_lokal, geloescht_am,
            ceil(extract(epoch FROM (geloescht_am + $1 * interval '1 day' - now())) / 86400)
              AS resttage,
            NOT vorschau_erzeugt AS dateien_weg
       FROM bild WHERE ${s.text}
      ORDER BY geloescht_am DESC, id DESC`,
    [LOESCHFRIST_TAGE, ...s.werte],
  );
  return zeilen.map((z) => ({ ...z, resttage: Number(z.resttage) }));
}
