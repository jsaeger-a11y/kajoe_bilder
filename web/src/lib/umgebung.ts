/**
 * Einstellungen aus der .env der Projektwurzel – derselben Datei wie der
 * Ingest. Es gibt bewusst keine zweite .env unter web/: zwei Dateien mit
 * denselben Zugangsdaten laufen frueher oder spaeter auseinander.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

function projektwurzel(): string {
  // Der Pfad wird aus dem Ort dieser Datei abgeleitet, nie fest verdrahtet.
  const hier = dirname(fileURLToPath(import.meta.url));
  // Im Betrieb liegt die uebersetzte Datei tiefer unter .next/, deshalb wird
  // nach oben gesucht, bis eine .env neben einer docker-compose.yml steht.
  let pfad = hier;
  for (let i = 0; i < 10; i++) {
    try {
      readFileSync(join(pfad, "docker-compose.yml"));
      return pfad;
    } catch {
      const oben = dirname(pfad);
      if (oben === pfad) break;
      pfad = oben;
    }
  }
  throw new Error("Projektwurzel nicht gefunden (keine docker-compose.yml oberhalb)");
}

function liesEnv(): Record<string, string> {
  const werte: Record<string, string> = {};
  const roh = readFileSync(join(projektwurzel(), ".env"), "utf8");
  for (const zeile of roh.split("\n")) {
    const gestutzt = zeile.trim();
    if (!gestutzt || gestutzt.startsWith("#")) continue;
    const trenner = gestutzt.indexOf("=");
    if (trenner < 0) continue;
    werte[gestutzt.slice(0, trenner).trim()] =
      gestutzt.slice(trenner + 1).trim().replace(/^["']|["']$/g, "");
  }
  return werte;
}

const env = { ...liesEnv(), ...process.env } as Record<string, string>;

function pflicht(name: string): string {
  const wert = env[name];
  if (!wert) throw new Error(`${name} fehlt in .env`);
  return wert;
}

export const DATENBANK = {
  host: env.POSTGRES_HOST ?? "127.0.0.1",
  port: Number(env.POSTGRES_PORT ?? "5432"),
  database: pflicht("POSTGRES_DB"),
  user: pflicht("POSTGRES_USER"),
  password: pflicht("POSTGRES_PASSWORD"),
};

/**
 * `Secure` heisst: nur ueber HTTPS. Im lokalen Netz laeuft die Anwendung ueber
 * http://webspace:3000, und dann kommt das Cookie NIE an – die Anmeldung
 * schlaegt scheinbar grundlos fehl. `localhost` gilt als sicherer Kontext, ein
 * Hostname im LAN nicht.
 *
 * Die Vorgabe ist deshalb AN. Wer im LAN probiert, setzt COOKIE_SECURE=0 –
 * und die Anwendung schreibt beim Start eine deutliche Zeile ins Log, damit
 * die Einstellung nach dem Tunnel nicht still aus bleibt.
 */
export const COOKIE_SICHER = (env.COOKIE_SECURE ?? "1") !== "0";

export const PROJEKTWURZEL = projektwurzel();
