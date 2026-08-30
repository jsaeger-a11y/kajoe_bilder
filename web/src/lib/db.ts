/** Verbindungsvorrat zur Datenbank. */

import { Pool } from "pg";
import { DATENBANK } from "./umgebung";

// Next baut im Betrieb mehrfach neu; ohne diese Zwischenlage entsteht bei
// jedem Neuladen ein zweiter Vorrat und die Verbindungen laufen voll.
const global_ = globalThis as unknown as { kajoeVorrat?: Pool };

export const vorrat: Pool =
  global_.kajoeVorrat ??
  new Pool({
    ...DATENBANK,
    max: 8,
    idleTimeoutMillis: 30_000,
    // Betriebszeitstempel sind UTC. Die Ortszeit der Aufnahme steckt in
    // aufnahme_lokal und ist bewusst zeitzonenlos.
    options: "-c TimeZone=UTC",
  });

if (process.env.NODE_ENV !== "production") global_.kajoeVorrat = vorrat;

export async function abfrage<Z extends object = Record<string, unknown>>(
  text: string,
  werte: unknown[] = [],
): Promise<Z[]> {
  const ergebnis = await vorrat.query(text, werte);
  return ergebnis.rows as Z[];
}

export async function eineZeile<Z extends object = Record<string, unknown>>(
  text: string,
  werte: unknown[] = [],
): Promise<Z | null> {
  const zeilen = await abfrage<Z>(text, werte);
  return zeilen[0] ?? null;
}
