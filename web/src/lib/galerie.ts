/**
 * Filter, Abfragen und Blaettern der Galerie.
 *
 * Alles an einer Stelle, damit Gitter, Trefferzahlen und das Blaettern in der
 * Einzelansicht garantiert dieselbe Menge meinen. Zwei Fassungen derselben
 * Bedingung laufen frueher oder spaeter auseinander, und dann springt man
 * beim Blaettern aus der Auswahl heraus, in der man gerade sucht.
 */

import "server-only";

import { abfrage, eineZeile } from "./db";
import { HOECHSTENS_JE_VORGANG } from "./rechte";
import { NICHT_GELOESCHT } from "./sichtbar";

/** Seitengroesse an EINER Stelle. Bei 922 Zeilen faellt sie nicht auf, bei 14.000 schon. */
export const SEITENGROESSE = 60;

export const HERKUENFTE = ["iphone", "apple_sonstig", "fremd", "ohne_exif"] as const;
export const TYPEN = ["bild", "video"] as const;

export interface Filter {
  jahr: number | null;
  monat: number | null;
  /** eine Herkunft oder "alle" */
  herkunft: string;
  /** "bild", "video" oder "alle" */
  typ: string;
  /** "mit", "ohne" oder "alle" */
  ort: string;
  seite: number;
}

/**
 * Vorgabe ist `iphone` – so steht es in CLAUDE.md. Damit das kein stiller
 * Filter ist, zeigt die Galerie immer beide Zahlen: gefiltert und gesamt.
 */
export const VORGABE: Filter = {
  jahr: null, monat: null, herkunft: "iphone", typ: "alle", ort: "alle", seite: 1,
};

type Suchwerte = Record<string, string | string[] | undefined>;

function eins(wert: string | string[] | undefined): string | null {
  if (Array.isArray(wert)) return wert[0] ?? null;
  return wert ?? null;
}

function zahl(wert: string | null, von: number, bis: number): number | null {
  if (wert === null || wert === "") return null;
  const n = Number(wert);
  return Number.isInteger(n) && n >= von && n <= bis ? n : null;
}

export function filterAusSuche(suche: Suchwerte): Filter {
  const herkunft = eins(suche.herkunft);
  const typ = eins(suche.typ);
  const ort = eins(suche.ort);
  return {
    jahr: zahl(eins(suche.jahr), 1900, 2999),
    monat: zahl(eins(suche.monat), 1, 12),
    herkunft:
      herkunft === "alle" || (HERKUENFTE as readonly string[]).includes(herkunft ?? "")
        ? (herkunft as string)
        : VORGABE.herkunft,
    typ: (TYPEN as readonly string[]).includes(typ ?? "") ? (typ as string) : "alle",
    ort: ort === "mit" || ort === "ohne" ? ort : "alle",
    seite: zahl(eins(suche.seite), 1, 100000) ?? 1,
  };
}

/**
 * Der Filterzustand gehoert in die Adresse, nicht nur in den Browser: sonst
 * laesst sich eine Ansicht nicht wiederfinden und der Zurueck-Knopf tut nicht,
 * was er soll.
 */
export function suchtext(
  filter: Filter,
  aenderung: Partial<Filter> = {},
  zusatz: string[] = [],
): string {
  const f = { ...filter, ...aenderung };
  // Seite 1 nur weglassen, wenn nicht ausdruecklich gesetzt.
  const teile: string[] = [];
  if (f.jahr !== null) teile.push(`jahr=${f.jahr}`);
  if (f.monat !== null) teile.push(`monat=${f.monat}`);
  if (f.herkunft !== VORGABE.herkunft) teile.push(`herkunft=${f.herkunft}`);
  if (f.typ !== "alle") teile.push(`typ=${f.typ}`);
  if (f.ort !== "alle") teile.push(`ort=${f.ort}`);
  if (f.seite > 1) teile.push(`seite=${f.seite}`);
  teile.push(...zusatz);
  return teile.length ? `?${teile.join("&")}` : "";
}

/**
 * Verweis auf eine Seite, die diese Filter versteht – Galerie oder Karte.
 *
 * Der Pfad ist ein Parameter, weil die Filterleiste auf beiden Seiten steht.
 * Zwei Fassungen der Adressbildung liefen frueher oder spaeter auseinander,
 * und dann verliert ein Filterklick auf der Karte den Ausschnitt oder in der
 * Galerie die Seitenzahl.
 */
export function filterlink(
  pfad: string,
  filter: Filter,
  aenderung: Partial<Filter> = {},
  zusatz: string[] = [],
): string {
  // Jede Filteraenderung faengt wieder auf Seite 1 an – sonst landet man auf
  // Seite 7 einer Menge, die nur noch drei Seiten hat.
  return `${pfad}${suchtext(filter, { seite: 1, ...aenderung }, zusatz)}`;
}

export function galerielink(
  filter: Filter,
  aenderung: Partial<Filter> = {},
  zusatz: string[] = [],
): string {
  return filterlink("/galerie", filter, aenderung, zusatz);
}

/** Ist ueberhaupt etwas eingeschraenkt? Ohne Filter gibt es keine Sammelauswahl. */
export function istEingeschraenkt(filter: Filter): boolean {
  return (
    filter.jahr !== null ||
    filter.monat !== null ||
    filter.herkunft !== "alle" ||
    filter.typ !== "alle" ||
    filter.ort !== "alle"
  );
}

interface Bedingung {
  text: string;
  werte: unknown[];
}

/** WHERE-Teil ohne das fuehrende WHERE. `ausser` laesst einen Filter weg. */
export function bedingung(filter: Filter, ausser?: keyof Filter): Bedingung {
  const teile = [NICHT_GELOESCHT];
  const werte: unknown[] = [];

  if (filter.jahr !== null && ausser !== "jahr") {
    werte.push(filter.jahr);
    teile.push(`jahr = $${werte.length}`);
  }
  if (filter.monat !== null && ausser !== "monat") {
    werte.push(filter.monat);
    teile.push(`monat = $${werte.length}`);
  }
  if (filter.herkunft !== "alle" && ausser !== "herkunft") {
    werte.push(filter.herkunft);
    teile.push(`herkunft = $${werte.length}`);
  }
  if (filter.typ !== "alle" && ausser !== "typ") {
    werte.push(filter.typ);
    teile.push(`typ = $${werte.length}`);
  }
  if (filter.ort !== "alle" && ausser !== "ort") {
    teile.push(filter.ort === "mit" ? "gps_status = 'ok'" : "gps_status <> 'ok'");
  }
  return { text: teile.join(" AND "), werte };
}

export interface Kachel {
  id: number;
  sha256: string;
  typ: string;
  dateityp: string;
  herkunft: string;
  aufnahme_lokal: Date;
  zeitquelle: string;
  jahr: number;
  monat: number;
  breite: number | null;
  hoehe: number | null;
  dauer_sekunden: string | null;
  gps_status: string;
  vorschau_erzeugt: boolean;
}

export async function seite(filter: Filter): Promise<{ kacheln: Kachel[]; treffer: number }> {
  const b = bedingung(filter);
  const versatz = (filter.seite - 1) * SEITENGROESSE;

  // id::int – BIGINT kommt sonst als Zeichenkette aus dem Treiber, und wer
  // "1908" mit 1908 vergleicht, bekommt immer false.
  const kacheln = await abfrage<Kachel>(
    `SELECT id::int AS id, sha256, typ, dateityp, herkunft, aufnahme_lokal,
            zeitquelle, jahr, monat, breite, hoehe, dauer_sekunden, gps_status,
            vorschau_erzeugt
       FROM bild
      WHERE ${b.text}
      ORDER BY aufnahme_lokal DESC, id DESC
      LIMIT ${SEITENGROESSE} OFFSET ${versatz}`,
    b.werte,
  );

  const zeile = await eineZeile<{ anzahl: string }>(
    `SELECT count(*) AS anzahl FROM bild WHERE ${b.text}`,
    b.werte,
  );
  return { kacheln, treffer: Number(zeile?.anzahl ?? 0) };
}

/**
 * Trefferzahlen je Filterwert – jeweils unter den ÜBRIGEN Filtern.
 *
 * Wer 665 von 922 sieht, versteht die Vorgabe; wer nur 665 sieht, haelt sie
 * fuer alles.
 */
export async function trefferzahlen(filter: Filter): Promise<{
  gesamt: number;
  jeHerkunft: Record<string, number>;
  jeTyp: Record<string, number>;
  jeOrt: Record<string, number>;
}> {
  const ohneHerkunft = bedingung(filter, "herkunft");
  const ohneTyp = bedingung(filter, "typ");
  const ohneOrt = bedingung(filter, "ort");

  const [h, t, o, g] = await Promise.all([
    abfrage<{ herkunft: string; anzahl: string }>(
      `SELECT herkunft, count(*) AS anzahl FROM bild WHERE ${ohneHerkunft.text} GROUP BY 1`,
      ohneHerkunft.werte,
    ),
    abfrage<{ typ: string; anzahl: string }>(
      `SELECT typ, count(*) AS anzahl FROM bild WHERE ${ohneTyp.text} GROUP BY 1`,
      ohneTyp.werte,
    ),
    abfrage<{ schluessel: string; anzahl: string }>(
      `SELECT CASE WHEN gps_status = 'ok' THEN 'mit' ELSE 'ohne' END AS schluessel,
              count(*) AS anzahl FROM bild WHERE ${ohneOrt.text} GROUP BY 1`,
      ohneOrt.werte,
    ),
    eineZeile<{ anzahl: string }>(`SELECT count(*) AS anzahl FROM bild WHERE ${NICHT_GELOESCHT}`),
  ]);

  const zu = <S extends string>(zeilen: { anzahl: string }[], schluessel: S) =>
    Object.fromEntries(
      zeilen.map((z) => [(z as unknown as Record<string, string>)[schluessel], Number(z.anzahl)]),
    ) as Record<string, number>;

  return {
    gesamt: Number(g?.anzahl ?? 0),
    jeHerkunft: zu(h, "herkunft"),
    jeTyp: zu(t, "typ"),
    jeOrt: zu(o, "schluessel"),
  };
}

/** Jahre und Monate mit Anzahl – unter allen Filtern ausser Jahr und Monat. */
export async function zeitraeume(filter: Filter): Promise<
  { jahr: number; monat: number; anzahl: number }[]
> {
  const ohneJahr = bedingung({ ...filter, monat: null }, "jahr");
  const zeilen = await abfrage<{ jahr: number; monat: number; anzahl: string }>(
    `SELECT jahr, monat, count(*) AS anzahl FROM bild WHERE ${ohneJahr.text}
      GROUP BY 1, 2 ORDER BY 1 DESC, 2 DESC`,
    ohneJahr.werte,
  );
  return zeilen.map((z) => ({ jahr: z.jahr, monat: z.monat, anzahl: Number(z.anzahl) }));
}

/**
 * Voriges und naechstes Bild INNERHALB der gefilterten Menge.
 *
 * Ueber den Schluessel (aufnahme_lokal, id) statt ueber OFFSET: das bleibt
 * richtig, auch wenn zwei Aufnahmen dieselbe Sekunde tragen, und kostet keinen
 * vollen Durchlauf.
 */
export async function nachbarn(
  filter: Filter,
  aufnahme: Date,
  id: number,
): Promise<{ vorher: number | null; nachher: number | null; stelle: number; treffer: number }> {
  const b = bedingung(filter);
  const n = b.werte.length;

  const [neuer, aelter, davor, gesamt] = await Promise.all([
    eineZeile<{ id: number }>(
      `SELECT id::int AS id FROM bild WHERE ${b.text}
         AND (aufnahme_lokal, id) > ($${n + 1}, $${n + 2})
       ORDER BY aufnahme_lokal ASC, id ASC LIMIT 1`,
      [...b.werte, aufnahme, id],
    ),
    eineZeile<{ id: number }>(
      `SELECT id::int AS id FROM bild WHERE ${b.text}
         AND (aufnahme_lokal, id) < ($${n + 1}, $${n + 2})
       ORDER BY aufnahme_lokal DESC, id DESC LIMIT 1`,
      [...b.werte, aufnahme, id],
    ),
    eineZeile<{ anzahl: string }>(
      `SELECT count(*) AS anzahl FROM bild WHERE ${b.text}
         AND (aufnahme_lokal, id) > ($${n + 1}, $${n + 2})`,
      [...b.werte, aufnahme, id],
    ),
    eineZeile<{ anzahl: string }>(`SELECT count(*) AS anzahl FROM bild WHERE ${b.text}`, b.werte),
  ]);

  return {
    vorher: neuer ? Number(neuer.id) : null,
    nachher: aelter ? Number(aelter.id) : null,
    stelle: Number(davor?.anzahl ?? 0) + 1,
    treffer: Number(gesamt?.anzahl ?? 0),
  };
}

/**
 * Alle Kennungen der gefilterten Menge – fuer "alle Treffer waehlen".
 *
 * Hoechstens `HOECHSTENS_JE_VORGANG` Stueck. Die Grenze greift damit schon
 * beim Markieren und nicht erst beim Abschicken: wer zweihundert Bilder
 * auswaehlt und danach abgewiesen wird, hat die Arbeit umsonst gemacht.
 */
export async function alleIds(filter: Filter): Promise<number[]> {
  const b = bedingung(filter);
  const zeilen = await abfrage<{ id: number }>(
    `SELECT id::int AS id FROM bild WHERE ${b.text}
      ORDER BY aufnahme_lokal DESC, id DESC LIMIT ${HOECHSTENS_JE_VORGANG}`,
    b.werte,
  );
  return zeilen.map((z) => Number(z.id));
}

export const MONATE = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

export function monatstext(jahr: number, monat: number): string {
  return `${MONATE[monat - 1]} ${jahr}`;
}

export function dauertext(sekunden: string | number | null): string | null {
  if (sekunden === null) return null;
  const s = Math.round(Number(sekunden));
  if (!Number.isFinite(s) || s <= 0) return null;
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}
