/**
 * Zugriffspruefung – an EINER Stelle, benutzt in jeder Seite, jeder Server
 * Action und jeder Route.
 *
 * Ein ausgeblendeter Menuepunkt ist keine Pruefung. Ein altes Lesezeichen kaeme
 * sonst durch, und die Adresse einer Verwaltungsseite ist schnell geraten.
 *
 * Es gibt hier bewusst KEINE middleware.ts. Eine Middleware sieht aus wie
 * Schutz, laeuft aber nicht vor jeder Server Action und nicht vor jedem
 * Datenzugriff; wer sich auf sie verlaesst, prueft an der falschen Stelle.
 * Geprueft wird dort, wo die Daten herausgegeben werden.
 */

import "server-only";

import { notFound, redirect } from "next/navigation";

import type { Recht } from "./rechte";
import { angemeldet, type Angemeldet } from "./sitzung";

export class ZugriffFehler extends Error {
  constructor(text = "Dazu fehlt die Berechtigung.") {
    super(text);
    this.name = "ZugriffFehler";
  }
}

/**
 * Darf diese Person das?
 *
 * Ein Verwalter darf ohnehin alles – deshalb steht die Rolle hier vorn und
 * nicht als Sonderfall an fuenf Aufrufstellen.
 */
export function darf(wer: Angemeldet, recht: Recht): boolean {
  return wer.rolle === "verwalter" || wer.rechte.includes(recht);
}

// --- Seiten ---------------------------------------------------------------

/** Fuer Seiten: nicht angemeldet → zur Anmeldung. */
export async function verlangeAnmeldung(): Promise<Angemeldet> {
  const wer = await angemeldet();
  if (!wer) redirect("/anmelden");
  return wer;
}

/**
 * Fuer Seiten: nur Verwalter.
 *
 * Abgewiesen wird mit 404, nicht mit 403: wer nicht hineindarf, soll auch
 * nicht erfahren, dass es die Seite gibt.
 */
export async function verlangeVerwalter(): Promise<Angemeldet> {
  const wer = await verlangeAnmeldung();
  if (wer.rolle !== "verwalter") notFound();
  return wer;
}

/** Fuer Seiten: nur mit diesem Recht (oder als Verwalter). Sonst 404. */
export async function verlangeRecht(recht: Recht): Promise<Angemeldet> {
  const wer = await verlangeAnmeldung();
  if (!darf(wer, recht)) notFound();
  return wer;
}

// --- Server Actions -------------------------------------------------------

/**
 * Fuer Server Actions. Wirft statt weiterzuleiten – eine Action, die still
 * weiterleitet, sieht fuer den Aufrufer aus wie ein Erfolg.
 */
export async function aktionAngemeldet(): Promise<Angemeldet> {
  const wer = await angemeldet();
  if (!wer) throw new ZugriffFehler("Nicht angemeldet.");
  return wer;
}

export async function aktionVerwalter(): Promise<Angemeldet> {
  const wer = await aktionAngemeldet();
  if (wer.rolle !== "verwalter") throw new ZugriffFehler();
  return wer;
}

/**
 * Fuer Server Actions: nur mit diesem Recht.
 *
 * Dass der Knopf in der Anzeige fehlt, ist keine Pruefung. Eine Server Action
 * ist eine Adresse wie jede andere.
 */
export async function aktionRecht(recht: Recht): Promise<Angemeldet> {
  const wer = await aktionAngemeldet();
  if (!darf(wer, recht)) {
    throw new ZugriffFehler("Dazu fehlt die Berechtigung zum Löschen.");
  }
  return wer;
}

// --- Route Handler --------------------------------------------------------

/**
 * Fuer Routen. Gibt bei fehlender Berechtigung eine Antwort zurueck, sonst
 * die angemeldete Person. Der Aufrufer gibt die Antwort einfach weiter.
 */
export async function routeRecht(
  recht: Recht,
): Promise<{ ok: true; wer: Angemeldet } | { ok: false; antwort: Response }> {
  const wer = await angemeldet();
  if (!wer) {
    return { ok: false, antwort: Response.json({ fehler: "nicht angemeldet" }, { status: 401 }) };
  }
  if (!darf(wer, recht)) {
    return { ok: false, antwort: Response.json({ fehler: "keine Berechtigung" }, { status: 403 }) };
  }
  return { ok: true, wer };
}

export async function routeVerwalter(): Promise<
  { ok: true; wer: Angemeldet } | { ok: false; antwort: Response }
> {
  const wer = await angemeldet();
  if (!wer) {
    return { ok: false, antwort: Response.json({ fehler: "nicht angemeldet" }, { status: 401 }) };
  }
  if (wer.rolle !== "verwalter") {
    return { ok: false, antwort: Response.json({ fehler: "keine Berechtigung" }, { status: 403 }) };
  }
  return { ok: true, wer };
}
