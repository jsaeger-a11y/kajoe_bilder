/** Angaben aus der eingehenden Anfrage. */

import { headers } from "next/headers";

/**
 * Die Adresse des Aufrufers.
 *
 * Hinter dem Tunnel kommt sie aus `CF-Connecting-IP`. Ersatzweise aus dem
 * **ersten** Eintrag von `X-Forwarded-For` – dort haengt jeder Proxy hinten an,
 * der erste Eintrag ist der urspruengliche Aufrufer. Wer den letzten nimmt,
 * protokolliert die Adresse des eigenen Proxys.
 *
 * Alles davon ist faelschbar, solange kein Tunnel davorsteht. Es dient dem
 * Nachvollziehen, nicht der Zugangskontrolle.
 */
export async function adresse(): Promise<string | null> {
  const k = await headers();

  const cf = k.get("cf-connecting-ip");
  if (cf) return pruefe(cf);

  const weitergereicht = k.get("x-forwarded-for");
  if (weitergereicht) return pruefe(weitergereicht.split(",")[0]);

  return null;
}

function pruefe(roh: string): string | null {
  const wert = roh.trim();
  if (!wert) return null;
  // In die Spalte `ip` (INET) darf nur, was Postgres auch annimmt – sonst
  // scheitert das Protokollieren des Anmeldeversuchs und mit ihm die
  // Anmeldung selbst.
  const v4 = /^(\d{1,3}\.){3}\d{1,3}$/;
  const v6 = /^[0-9a-fA-F:]+$/;
  if (v4.test(wert) || (v6.test(wert) && wert.includes(":"))) return wert;
  return null;
}

export async function browserkennung(): Promise<string | null> {
  const k = await headers();
  return k.get("user-agent")?.slice(0, 300) ?? null;
}

/** Ob die Anfrage ueber HTTPS hereinkam – hinter dem Tunnel aus dem Header. */
export async function ueberHttps(): Promise<boolean> {
  const k = await headers();
  return (k.get("x-forwarded-proto") ?? "").split(",")[0].trim() === "https";
}
