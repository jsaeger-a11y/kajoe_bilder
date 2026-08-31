/**
 * Die eine Bedingung, die sagt, welche Aufnahmen jemand sehen darf.
 *
 * Sie steht hier und wird nirgends neu formuliert – nicht in der Galerie,
 * nicht auf der Karte, nicht in den Listen, nicht beim Ausliefern einer Datei,
 * nicht beim Zaehlen. Eine Abfrage, die sie vergisst, zeigt vorgemerkte Bilder
 * wieder an oder gibt einen gesperrten Jahrgang heraus, und das faellt genau
 * dort nicht auf, wo man nicht hinsieht.
 *
 * Zwei Teile:
 *
 * **Vorgemerkt geloescht.** Geloescht wird zweistufig: `geloescht_am` blendet
 * aus, die Dateien fallen erst nach dreissig Tagen im Aufraeumlauf. Die Zeile
 * selbst bleibt fuer immer stehen – sie ist der Grabstein, an dem der naechste
 * Ingest erkennt, dass diese Datei schon einmal da war.
 *
 * **Freigeschaltete Jahrgaenge** (`benutzer.jahre`, Migration 006). `NULL`
 * heisst alle Jahre, auch kuenftige, und ist die Vorgabe. Eine Liste heisst
 * genau diese Jahre, eine leere Liste keines. Ein Verwalter ist nie
 * eingeschraenkt – das entscheidet `sichtVon()` und niemand sonst.
 *
 * Warum die beiden Konstanten nicht mehr exportiert werden: solange
 * `NICHT_GELOESCHT` frei herumlag, konnte jede neue Abfrage sie einsetzen und
 * dabei die Jahresfreischaltung vergessen. Jetzt gibt es nur den Weg ueber
 * `sichtbar()`, und der verlangt eine `Sicht` als Argument. Wer eine baut,
 * muss sich ueberlegt haben, fuer wen die Abfrage laeuft.
 */

const NICHT_GELOESCHT = "geloescht_am IS NULL";
const VORGEMERKT = "geloescht_am IS NOT NULL";

/** Was diese Person sehen darf. `jahre === null` heisst: alles. */
export interface Sicht {
  jahre: number[] | null;
}

/** Sieht alles – fuer Aufrufe ausserhalb einer Anmeldung (Werkzeuge, Ingest). */
export const ALLES: Sicht = { jahre: null };

/**
 * Die Sicht einer angemeldeten Person.
 *
 * **Ein Verwalter ist nie eingeschraenkt**, unabhaengig davon, was in seinem
 * Feld steht. Diese Ausnahme steht hier vorn und nicht als Sonderfall an
 * fuenfzehn Aufrufstellen.
 */
export function sichtVon(wer: { rolle: string; jahre: number[] | null }): Sicht {
  return { jahre: wer.rolle === "verwalter" ? null : wer.jahre };
}

/** Ist ueberhaupt etwas eingeschraenkt? Nur fuer Texte in der Anzeige. */
export function eingeschraenkt(sicht: Sicht): boolean {
  return sicht.jahre !== null;
}

export interface Bedingung {
  /** SQL fuer den WHERE-Teil, ohne das fuehrende WHERE. */
  text: string;
  /** Die Werte zu den Platzhaltern, in dieser Reihenfolge. */
  werte: unknown[];
}

interface Wahl {
  /** Nummer des ERSTEN freien Platzhalters. Vorgabe 1. */
  ab?: number;
  /** Tabellenalias mit Punkt, z.B. `"b."`, wenn die Abfrage verbindet. */
  praefix?: string;
}

/**
 * Nur der Jahresteil.
 *
 * Gebraucht an genau einer Stelle: um zu zaehlen, wie viele Bilder einer
 * Auswahlliste wegen eines gesperrten Jahrgangs gerade nicht verfuegbar sind.
 * Dafuer braucht es beide Zahlen – mit und ohne Jahresteil – in derselben
 * Abfrage. Ueberall sonst ist `sichtbar()` das Richtige.
 */
export function nurJahre(sicht: Sicht, { ab = 1, praefix = "" }: Wahl = {}): Bedingung {
  if (sicht.jahre === null) return { text: "TRUE", werte: [] };
  // Eine leere Liste ergibt `jahr = ANY('{}')` und damit falsch – genau das
  // ist gemeint und braucht keinen Sonderfall.
  return { text: `${praefix}jahr = ANY($${ab}::smallint[])`, werte: [sicht.jahre] };
}

/**
 * Was diese Person sehen darf: nicht vorgemerkt und im freigeschalteten Jahr.
 *
 * Das ist die Bedingung fuer alles, was ein Bild zeigt, zaehlt oder ausliefert.
 */
export function sichtbar(sicht: Sicht, wahl: Wahl = {}): Bedingung {
  const p = wahl.praefix ?? "";
  const j = nurJahre(sicht, wahl);
  return {
    text: j.text === "TRUE" ? `${p}${NICHT_GELOESCHT}` : `${p}${NICHT_GELOESCHT} AND ${j.text}`,
    werte: j.werte,
  };
}

/**
 * Die vorgemerkten Aufnahmen – ebenfalls nur aus freigeschalteten Jahren.
 *
 * Ein gesperrter Jahrgang bleibt auch dann gesperrt, wenn seine Bilder zum
 * Loeschen vorgemerkt sind: die Liste der Vorgemerkten zeigt Vorschaubilder.
 */
export function vorgemerktSichtbar(sicht: Sicht, wahl: Wahl = {}): Bedingung {
  const p = wahl.praefix ?? "";
  const j = nurJahre(sicht, wahl);
  return {
    text: j.text === "TRUE" ? `${p}${VORGEMERKT}` : `${p}${VORGEMERKT} AND ${j.text}`,
    werte: j.werte,
  };
}
