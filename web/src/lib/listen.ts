/**
 * Auswahllisten.
 *
 * **Gefiltert wird in der Abfrage, nicht in der Anzeige.** Die Kennung des
 * Besitzers kommt aus der Sitzung, nie aus der Adresse. Auch ein Verwalter
 * sieht fremde Listen nicht, ausser sie sind freigegeben – eine Auswahlliste
 * ist etwas Privates, keine Verwaltungssache.
 *
 * `freigegeben` heisst **sehen, nicht aendern**. Deshalb gibt es zwei
 * Zugaenge: `listeZumSehen()` und `listeZumAendern()`. Wer aendern will,
 * bekommt die Liste nur, wenn sie ihm gehoert – und zwar in derselben
 * Abfrage, nicht als zweite Pruefung danach.
 */

import "server-only";

import { abfrage, eineZeile } from "./db";
import { HOECHSTENS_JE_LISTE, HOECHSTENS_LISTEN } from "./rechte";
import { nurJahre, sichtbar, type Sicht } from "./sichtbar";

export interface Liste {
  id: number;
  besitzer_id: number;
  besitzer: string;
  name: string;
  freigegeben: boolean;
  angelegt_am: Date;
  geaendert_am: Date;
  /** Alles, was in der Liste steht und nicht zum Loeschen vorgemerkt ist. */
  anzahl: number;
  /** Davon das, was diese Person gerade sehen darf. */
  verfuegbar: number;
}

/**
 * Die Felder einer Liste, samt beider Zahlen.
 *
 * **Die Bilder bleiben in der Liste, auch wenn ihr Jahrgang gesperrt ist.**
 * Nichts wird entfernt; nach einer Freischaltung sind sie wieder da. Deshalb
 * stehen hier zwei Zahlen: `anzahl` ist alles, `verfuegbar` das, was diese
 * Person davon sehen darf. Nur die zweite zu zeigen waere das Schlimmste –
 * man laedt ein Paket herunter und baut einen Kalender mit Luecken, ohne zu
 * wissen, dass welche fehlen.
 *
 * `ab` ist die Nummer des ersten freien Platzhalters.
 */
function auswahlFelder(sicht: Sicht, ab: number): { text: string; werte: unknown[] } {
  const j = nurJahre(sicht, { ab, praefix: "bi." });
  return {
    text: `
  a.id::int          AS id,
  a.besitzer_id::int AS besitzer_id,
  b.benutzername     AS besitzer,
  a.name,
  a.freigegeben,
  a.angelegt_am,
  a.geaendert_am,
  (SELECT count(*) FROM auswahl_bild ab
     JOIN bild bi ON bi.id = ab.bild_id
    WHERE ab.auswahl_id = a.id AND bi.geloescht_am IS NULL) AS anzahl,
  (SELECT count(*) FROM auswahl_bild ab
     JOIN bild bi ON bi.id = ab.bild_id
    WHERE ab.auswahl_id = a.id AND bi.geloescht_am IS NULL AND ${j.text}) AS verfuegbar`,
    werte: j.werte,
  };
}

function zu(zeile: Record<string, unknown>): Liste {
  return {
    id: Number(zeile.id),
    besitzer_id: Number(zeile.besitzer_id),
    besitzer: String(zeile.besitzer),
    name: String(zeile.name),
    freigegeben: Boolean(zeile.freigegeben),
    angelegt_am: zeile.angelegt_am as Date,
    geaendert_am: zeile.geaendert_am as Date,
    anzahl: Number(zeile.anzahl),
    verfuegbar: Number(zeile.verfuegbar),
  };
}

export async function eigeneListen(benutzerId: number, sicht: Sicht): Promise<Liste[]> {
  const f = auswahlFelder(sicht, 2);
  const zeilen = await abfrage(
    `SELECT ${f.text} FROM auswahl a JOIN benutzer b ON b.id = a.besitzer_id
      WHERE a.besitzer_id = $1 ORDER BY a.geaendert_am DESC`,
    [benutzerId, ...f.werte],
  );
  return zeilen.map(zu);
}

export async function freigegebeneListen(benutzerId: number, sicht: Sicht): Promise<Liste[]> {
  const f = auswahlFelder(sicht, 2);
  const zeilen = await abfrage(
    `SELECT ${f.text} FROM auswahl a JOIN benutzer b ON b.id = a.besitzer_id
      WHERE a.freigegeben AND a.besitzer_id <> $1 ORDER BY b.benutzername, a.name`,
    [benutzerId, ...f.werte],
  );
  return zeilen.map(zu);
}

/** Eigene Liste ODER eine freigegebene fremde. Zum Ansehen. */
export async function listeZumSehen(
  id: number, benutzerId: number, sicht: Sicht,
): Promise<Liste | null> {
  const f = auswahlFelder(sicht, 3);
  const zeile = await eineZeile(
    `SELECT ${f.text} FROM auswahl a JOIN benutzer b ON b.id = a.besitzer_id
      WHERE a.id = $1 AND (a.besitzer_id = $2 OR a.freigegeben)`,
    [id, benutzerId, ...f.werte],
  );
  return zeile ? zu(zeile) : null;
}

/**
 * Nur die eigene Liste. Zum Aendern.
 *
 * Die Besitzerpruefung steht IN der Abfrage. Dass die Seite davor nur eigene
 * Listen zeigt, ist keine Pruefung.
 */
export async function listeZumAendern(
  id: number, benutzerId: number, sicht: Sicht,
): Promise<Liste | null> {
  const f = auswahlFelder(sicht, 3);
  const zeile = await eineZeile(
    `SELECT ${f.text} FROM auswahl a JOIN benutzer b ON b.id = a.besitzer_id
      WHERE a.id = $1 AND a.besitzer_id = $2`,
    [id, benutzerId, ...f.werte],
  );
  return zeile ? zu(zeile) : null;
}

export async function anlegen(benutzerId: number, name: string): Promise<
  { ok: true; id: number } | { ok: false; fehler: string }
> {
  const sauber = name.trim();
  if (sauber.length < 1 || sauber.length > 80) {
    return { ok: false, fehler: "Der Name braucht 1 bis 80 Zeichen." };
  }

  const wieviele = await eineZeile<{ anzahl: string }>(
    `SELECT count(*) AS anzahl FROM auswahl WHERE besitzer_id = $1`,
    [benutzerId],
  );
  if (Number(wieviele?.anzahl ?? 0) >= HOECHSTENS_LISTEN) {
    return { ok: false, fehler: `Mehr als ${HOECHSTENS_LISTEN} Listen sind nicht vorgesehen.` };
  }

  const schon = await eineZeile(
    `SELECT 1 FROM auswahl WHERE besitzer_id = $1 AND lower(name) = lower($2)`,
    [benutzerId, sauber],
  );
  if (schon) return { ok: false, fehler: "So heißt schon eine deiner Listen." };

  const neu = await eineZeile<{ id: number }>(
    `INSERT INTO auswahl (besitzer_id, name) VALUES ($1, $2) RETURNING id::int AS id`,
    [benutzerId, sauber],
  );
  return { ok: true, id: Number(neu!.id) };
}

export async function umbenennen(
  id: number, benutzerId: number, name: string,
): Promise<string | null> {
  const sauber = name.trim();
  if (sauber.length < 1 || sauber.length > 80) return "Der Name braucht 1 bis 80 Zeichen.";

  const schon = await eineZeile(
    `SELECT 1 FROM auswahl WHERE besitzer_id = $1 AND lower(name) = lower($2) AND id <> $3`,
    [benutzerId, sauber, id],
  );
  if (schon) return "So heißt schon eine andere deiner Listen.";

  const zeilen = await abfrage(
    `UPDATE auswahl SET name = $3, geaendert_am = now()
      WHERE id = $1 AND besitzer_id = $2 RETURNING id`,
    [id, benutzerId, sauber],
  );
  return zeilen.length ? null : "Diese Liste gibt es nicht oder sie gehört dir nicht.";
}

export async function entfernen(id: number, benutzerId: number): Promise<string | null> {
  // ON DELETE CASCADE raeumt auswahl_bild mit ab. Die Bilder selbst bleiben.
  const zeilen = await abfrage(
    `DELETE FROM auswahl WHERE id = $1 AND besitzer_id = $2 RETURNING id`,
    [id, benutzerId],
  );
  return zeilen.length ? null : "Diese Liste gibt es nicht oder sie gehört dir nicht.";
}

export async function freigabeSetzen(
  id: number, benutzerId: number, freigegeben: boolean,
): Promise<string | null> {
  const zeilen = await abfrage(
    `UPDATE auswahl SET freigegeben = $3, geaendert_am = now()
      WHERE id = $1 AND besitzer_id = $2 RETURNING id`,
    [id, benutzerId, freigegeben],
  );
  return zeilen.length ? null : "Diese Liste gibt es nicht oder sie gehört dir nicht.";
}

/**
 * Bilder hinzufuegen. Gibt zurueck, wie viele wirklich dazukamen.
 *
 * Markierungen landen sofort in der Datenbank, nicht erst auf Knopfdruck –
 * einer, den jemand vergisst, waere eine verlorene Sitzung.
 */
export async function bilderHinzufuegen(
  listeId: number, benutzerId: number, ids: number[], sicht: Sicht,
): Promise<{ ok: true; neu: number; schon: number } | { ok: false; fehler: string }> {
  const liste = await listeZumAendern(listeId, benutzerId, sicht);
  if (!liste) return { ok: false, fehler: "Diese Liste gibt es nicht oder sie gehört dir nicht." };
  if (!ids.length) return { ok: false, fehler: "Es ist nichts ausgewählt." };

  if (liste.anzahl + ids.length > HOECHSTENS_JE_LISTE) {
    return {
      ok: false,
      fehler:
        `In der Liste sind ${liste.anzahl} Bilder; mit ${ids.length} weiteren wären es ` +
        `mehr als die vorgesehenen ${HOECHSTENS_JE_LISTE}.`,
    };
  }

  // Nur Bilder, die es gibt, die nicht vorgemerkt sind und die diese Person
  // ueberhaupt sehen darf. Was jemand nicht sieht, kann er auch nicht sammeln.
  const s = sichtbar(sicht, { ab: 3, praefix: "b." });
  const zeilen = await abfrage<{ id: number }>(
    `INSERT INTO auswahl_bild (auswahl_id, bild_id)
     SELECT $1, b.id FROM bild b WHERE b.id = ANY($2::bigint[]) AND ${s.text}
     ON CONFLICT DO NOTHING
     RETURNING bild_id::int AS id`,
    [listeId, ids, ...s.werte],
  );
  await abfrage(`UPDATE auswahl SET geaendert_am = now() WHERE id = $1`, [listeId]);
  return { ok: true, neu: zeilen.length, schon: ids.length - zeilen.length };
}

export async function bilderEntfernen(
  listeId: number, benutzerId: number, ids: number[], sicht: Sicht,
): Promise<{ ok: true; entfernt: number } | { ok: false; fehler: string }> {
  const liste = await listeZumAendern(listeId, benutzerId, sicht);
  if (!liste) return { ok: false, fehler: "Diese Liste gibt es nicht oder sie gehört dir nicht." };
  if (!ids.length) return { ok: false, fehler: "Es ist nichts ausgewählt." };

  const zeilen = await abfrage(
    `DELETE FROM auswahl_bild WHERE auswahl_id = $1 AND bild_id = ANY($2::bigint[])
     RETURNING bild_id`,
    [listeId, ids],
  );
  await abfrage(`UPDATE auswahl SET geaendert_am = now() WHERE id = $1`, [listeId]);
  return { ok: true, entfernt: zeilen.length };
}

export interface Listenbild {
  id: number;
  sha256: string;
  typ: string;
  dateityp: string;
  dateigroesse: string;
  breite: number | null;
  hoehe: number | null;
  aufnahme_lokal: Date;
  jahr: number;
  monat: number;
  dauer_sekunden: string | null;
  notiz: string | null;
}

/**
 * Die Bilder einer Liste – ohne die vorgemerkten, ohne gesperrte Jahrgaenge.
 *
 * Ein vorgemerkt geloeschtes Bild bleibt in `auswahl_bild` stehen, faellt aber
 * hier heraus. Damit erscheint es weder in der Ansicht noch im Paket, und wird
 * es zurueckgeholt, ist es wieder da. Fuer einen gesperrten Jahrgang gilt
 * dasselbe – wie viele dadurch fehlen, steht in `Liste.anzahl` gegen
 * `Liste.verfuegbar` und gehoert sichtbar auf die Seite.
 */
export async function bilderDerListe(listeId: number, sicht: Sicht): Promise<Listenbild[]> {
  const s = sichtbar(sicht, { ab: 2, praefix: "b." });
  return abfrage<Listenbild>(
    `SELECT b.id::int AS id, b.sha256, b.typ, b.dateityp, b.dateigroesse,
            b.breite, b.hoehe, b.aufnahme_lokal, b.jahr, b.monat,
            b.dauer_sekunden, ab.notiz
       FROM auswahl_bild ab JOIN bild b ON b.id = ab.bild_id
      WHERE ab.auswahl_id = $1 AND ${s.text}
      ORDER BY b.aufnahme_lokal DESC, b.id DESC`,
    [listeId, ...s.werte],
  );
}

/** In wie vielen Listen steht dieses Bild – gleich wem sie gehoeren. */
export async function inWievielenListen(bildId: number): Promise<number> {
  const zeile = await eineZeile<{ anzahl: string }>(
    `SELECT count(*) AS anzahl FROM auswahl_bild WHERE bild_id = $1`,
    [bildId],
  );
  return Number(zeile?.anzahl ?? 0);
}

/** Welche der uebergebenen Bilder stehen in irgendeiner Liste? */
export async function inListen(ids: number[]): Promise<Set<number>> {
  if (!ids.length) return new Set();
  const zeilen = await abfrage<{ id: number }>(
    `SELECT DISTINCT bild_id::int AS id FROM auswahl_bild WHERE bild_id = ANY($1::bigint[])`,
    [ids],
  );
  return new Set(zeilen.map((z) => Number(z.id)));
}
