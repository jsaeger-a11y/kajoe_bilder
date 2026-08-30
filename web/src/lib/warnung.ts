/**
 * Warnung vor der gefaehrlichen Kombination: die Anwendung steht hinter einem
 * Tunnel (die Anfrage kam ueber HTTPS herein), das Sitzungscookie geht aber
 * ohne `Secure` hinaus.
 *
 * Der Kasten beim Start (src/instrumentation.ts) feuert bei jedem
 * COOKIE_SECURE=0 – auch im lokalen Netz, wo es richtig ist. Diese Warnung
 * erkennt den Fall selbst: sie sieht die tatsaechliche Anfrage.
 *
 * Einmal je Anwendungsstart, nicht bei jeder Anfrage. Eine Warnung, die in
 * jeder Zeile des Journals steht, liest niemand mehr.
 */

import "server-only";

import { COOKIE_SICHER } from "./umgebung";

let schongewarnt = false;

export function pruefeTunnelOhneSecure(weitergereichtesProtokoll: string | null): void {
  if (schongewarnt || COOKIE_SICHER) return;
  const protokoll = (weitergereichtesProtokoll ?? "").split(",")[0].trim().toLowerCase();
  if (protokoll !== "https") return;

  schongewarnt = true;
  console.error(
    "\n" +
      "[kajoe] ****************************************************************\n" +
      "[kajoe]  GEFAEHRLICH: Die Anfrage kam ueber HTTPS herein (also durch\n" +
      "[kajoe]  einen Tunnel oder Proxy), aber COOKIE_SECURE steht auf 0.\n" +
      "[kajoe]  Das Sitzungscookie geht damit OHNE Secure hinaus und faehrt\n" +
      "[kajoe]  auch ueber unverschluesseltes HTTP mit.\n" +
      "[kajoe]  COOKIE_SECURE=1 in die .env und den Dienst neu starten.\n" +
      "[kajoe] ****************************************************************\n",
  );
}
