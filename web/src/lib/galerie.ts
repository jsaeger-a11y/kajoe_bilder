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
import { sichtbar, type Bedingung, type Sicht } from "./sichtbar";
import { zelleAusText, zelleText, zellbedingung, type Zelle } from "./zelle";

/** Seitengroesse an EINER Stelle. Bei 922 Zeilen faellt sie nicht auf, bei 14.000 schon. */
export const SEITENGROESSE = 60;

/**
 * Die Herkunftswerte in der Reihenfolge, in der sie in der Filterleiste
 * stehen. `screenshot` steht neben `ohne_exif`, weil es aus ihm herausgeloest
 * wurde: bis dahin lagen Bildschirmfotos dort mit drin.
 *
 * Die VORGABE bleibt `iphone` (siehe VORGABE weiter unten und CLAUDE.md) –
 * ein neuer Wert im Filter aendert nicht, was die Galerie ungefragt zeigt.
 */
export const HERKUENFTE = [
  "iphone", "apple_sonstig", "fremd", "ohne_exif", "screenshot",
] as const;
export const TYPEN = ["bild", "video"] as const;

export interface Filter {
  /**
   * Mehrere Jahre gleichzeitig, aufsteigend und ohne Doppel. Leer heisst
   * "alle" – nicht "keines". In der Adresse als `jahr=2022,2023,2025`; eine
   * alte Adresse mit `jahr=2026` bleibt gueltig und ergibt `[2026]`.
   */
  jahr: number[];
  monat: number | null;
  /** eine Herkunft oder "alle" */
  herkunft: string;
  /** "bild", "video" oder "alle" */
  typ: string;
  /** "mit", "ohne" oder "alle" */
  ort: string;
  /** Eine Gitterzelle der Karte, aus `zelle=<stufe>:<zeile>:<spalte>`. */
  zelle: Zelle | null;
  seite: number;
}

/**
 * Vorgabe ist `iphone` – so steht es in CLAUDE.md. Damit das kein stiller
 * Filter ist, zeigt die Galerie immer beide Zahlen: gefiltert und gesamt.
 */
export const VORGABE: Filter = {
  jahr: [], monat: null, herkunft: "iphone", typ: "alle", ort: "alle",
  zelle: null, seite: 1,
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

/**
 * Jahre aus `jahr=2022,2023,2025` – oder aus `jahr=2026`.
 *
 * Was keine brauchbare Jahreszahl ist, faellt weg und fuehrt NICHT zu einer
 * Fehlerseite: `jahr=abc` und `jahr=2022,,` und `jahr=99999` ergeben eine
 * leere beziehungsweise gekuerzte Liste. Eine Adresse kommt aus einem
 * Lesezeichen oder aus einer Hand, die sie getippt hat.
 */
function jahre(wert: string | null): number[] {
  if (wert === null || wert === "") return [];
  const gefunden = wert
    .split(",")
    .map((t) => zahl(t.trim(), 1900, 2999))
    .filter((j): j is number => j !== null);
  return [...new Set(gefunden)].sort((a, b) => a - b);
}

export function filterAusSuche(suche: Suchwerte): Filter {
  const herkunft = eins(suche.herkunft);
  const typ = eins(suche.typ);
  const ort = eins(suche.ort);
  return {
    jahr: jahre(eins(suche.jahr)),
    monat: zahl(eins(suche.monat), 1, 12),
    herkunft:
      herkunft === "alle" || (HERKUENFTE as readonly string[]).includes(herkunft ?? "")
        ? (herkunft as string)
        : VORGABE.herkunft,
    typ: (TYPEN as readonly string[]).includes(typ ?? "") ? (typ as string) : "alle",
    ort: ort === "mit" || ort === "ohne" ? ort : "alle",
    zelle: zelleAusText(eins(suche.zelle)),
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
  if (f.jahr.length) teile.push(`jahr=${f.jahr.join(",")}`);
  if (f.monat !== null) teile.push(`monat=${f.monat}`);
  if (f.herkunft !== VORGABE.herkunft) teile.push(`herkunft=${f.herkunft}`);
  if (f.typ !== "alle") teile.push(`typ=${f.typ}`);
  if (f.ort !== "alle") teile.push(`ort=${f.ort}`);
  if (f.zelle !== null) teile.push(`zelle=${zelleText(f.zelle)}`);
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
    filter.jahr.length > 0 ||
    filter.monat !== null ||
    filter.herkunft !== "alle" ||
    filter.typ !== "alle" ||
    filter.ort !== "alle" ||
    filter.zelle !== null
  );
}

/**
 * WHERE-Teil ohne das fuehrende WHERE. `ausser` laesst einen Filter weg.
 *
 * `sicht` steht vorn und ist nicht wegzulassen: sie ist keine Einstellung des
 * Benutzers, sondern das, was er ueberhaupt sehen darf. Wer diese Funktion
 * aufruft, muss deshalb wissen, fuer wen die Abfrage laeuft – ein Aufruf ohne
 * diese Angabe uebersetzt gar nicht erst.
 */
export function bedingung(filter: Filter, sicht: Sicht, ausser?: keyof Filter): Bedingung {
  const s = sichtbar(sicht);
  const teile = [s.text];
  const werte: unknown[] = [...s.werte];

  /*
    DER FILTER ERWEITERT DEN ZUGRIFF NIE.

    `sichtbar(sicht)` hat, falls das Konto eingeschraenkt ist, bereits ein
    eigenes `jahr = ANY(...)` beigesteuert. Die Zeile hier kommt mit UND
    daneben, es entsteht also der Durchschnitt beider Mengen. Steht in der
    Adresse ein Jahr, das nicht freigeschaltet ist, kommt dafuer nichts – ohne
    Fehlerseite und ohne Sonderfall.

    Das ist die Stelle, an der eine Aufzaehlung gefaehrlich waere: bei einem
    einzelnen Jahr faellt eine fehlende Pruefung sofort auf, bei
    `jahr=2024,2025` mit nur einem erlaubten Eintrag nicht.
  */
  if (filter.jahr.length && ausser !== "jahr") {
    werte.push(filter.jahr);
    teile.push(`jahr = ANY($${werte.length}::smallint[])`);
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
  // Der Kartenausschnitt. Dieselbe Rechnung wie beim Gruppieren auf der Karte,
  // aus `zelle.ts` – nicht als Rechteck in Grad nachgebaut.
  if (filter.zelle !== null && ausser !== "zelle") {
    const z = zellbedingung(filter.zelle, werte.length + 1);
    werte.push(...z.werte);
    teile.push(z.text);
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

export async function seite(
  filter: Filter,
  sicht: Sicht,
): Promise<{ kacheln: Kachel[]; treffer: number }> {
  const b = bedingung(filter, sicht);
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
export async function trefferzahlen(filter: Filter, sicht: Sicht): Promise<{
  gesamt: number;
  jeHerkunft: Record<string, number>;
  jeTyp: Record<string, number>;
  jeOrt: Record<string, number>;
}> {
  const ohneHerkunft = bedingung(filter, sicht, "herkunft");
  const ohneTyp = bedingung(filter, sicht, "typ");
  const ohneOrt = bedingung(filter, sicht, "ort");

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
    // "gesamt" ist alles, was DIESE Person sehen darf – ohne Filter, aber
    // nicht ohne Sicht. Sonst stuende in der Galerie "607 von 16.232", und
    // die zweite Zahl waere ein Bestand, den es fuer sie nicht gibt.
    (async () => {
      const alles = sichtbar(sicht);
      return eineZeile<{ anzahl: string }>(
        `SELECT count(*) AS anzahl FROM bild WHERE ${alles.text}`,
        alles.werte,
      );
    })(),
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
export async function zeitraeume(
  filter: Filter,
  sicht: Sicht,
): Promise<{ jahr: number; monat: number; anzahl: number }[]> {
  const ohneJahr = bedingung({ ...filter, monat: null }, sicht, "jahr");
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
  sicht: Sicht,
  aufnahme: Date,
  id: number,
): Promise<{ vorher: number | null; nachher: number | null; stelle: number; treffer: number }> {
  const b = bedingung(filter, sicht);
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
export async function alleIds(filter: Filter, sicht: Sicht): Promise<number[]> {
  const b = bedingung(filter, sicht);
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
