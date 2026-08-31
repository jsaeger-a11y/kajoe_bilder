/**
 * Sitzungsverwaltung – eigene Tabelle, kein JWT.
 *
 * Begruendung in web/LIESMICH.md und in db/migrations/003-sitzungen.sql.
 * Kurz: ein JWT laesst sich nicht zurueckziehen, und ein abgeschaltetes Konto
 * soll draussen sein.
 */

import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";

import { abfrage, eineZeile } from "./db";
import { COOKIE_SICHER } from "./umgebung";
import { pruefeTunnelOhneSecure } from "./warnung";

export const COOKIE_NAME = "sitzung";

/** Absolute Laufzeit. Kein Nachschieben: ein Ablauf, der nie eintritt, ist keiner. */
const LAUFZEIT_TAGE = 30;

/** Hoechstens einmal je Stunde `zuletzt_gesehen` nachfuehren. */
const NACHFUEHREN_AB_MS = 60 * 60 * 1000;

export type Rolle = "verwalter" | "betrachter";

export interface Angemeldet {
  benutzerId: number;
  benutzername: string;
  rolle: Rolle;
  /** Einzelne Rechte zusaetzlich zur Rolle. Ein Verwalter darf ohnehin alles. */
  rechte: string[];
  /**
   * Freigeschaltete Jahrgaenge. `null` heisst alle, auch kuenftige – das ist
   * die Vorgabe. Durchgesetzt wird es ueber `sichtVon()` in `sichtbar.ts`,
   * das bei einem Verwalter ohnehin `null` daraus macht.
   */
  jahre: number[] | null;
  sitzungId: number;
}

function hashe(kennung: string): string {
  return createHash("sha256").update(kennung).digest("hex");
}

export async function sitzungAnlegen(
  benutzerId: number,
  ip: string | null,
  browser: string | null,
): Promise<void> {
  const kennung = randomBytes(32).toString("base64url");
  const laeuftAb = new Date(Date.now() + LAUFZEIT_TAGE * 86_400_000);

  await abfrage(
    `INSERT INTO sitzung (kennung_hash, benutzer_id, laeuft_ab_am, ip, browser)
     VALUES ($1, $2, $3, $4, $5)`,
    [hashe(kennung), benutzerId, laeuftAb, ip, browser],
  );

  const kiste = await cookies();
  kiste.set(COOKIE_NAME, kennung, {
    httpOnly: true,
    sameSite: "lax",
    secure: COOKIE_SICHER,
    path: "/",
    expires: laeuftAb,
  });
}

/**
 * Die angemeldete Person, oder null.
 *
 * Es wird bei JEDEM Aufruf in der Datenbank nachgesehen, ob das Konto noch
 * aktiv ist. Genau darum geht es bei einer Sitzungstabelle: `aktiv = FALSE`
 * wirkt sofort und nicht erst, wenn irgendwann ein Wertpapier ablaeuft.
 */
export async function angemeldet(): Promise<Angemeldet | null> {
  // Hier laeuft jede Seite, jede Action und jede Route vorbei – die Stelle,
  // an der die Warnung vor "Tunnel ohne Secure" den echten Fall sieht.
  pruefeTunnelOhneSecure((await headers()).get("x-forwarded-proto"));

  const kiste = await cookies();
  const kennung = kiste.get(COOKIE_NAME)?.value;
  if (!kennung) return null;

  const zeile = await eineZeile<{
    sitzung_id: string;
    benutzer_id: number;
    benutzername: string;
    rolle: Rolle;
    rechte: string[] | null;
    jahre: number[] | null;
    nachfuehren: boolean;
  }>(
    `SELECT s.id::int  AS sitzung_id,
            b.id::int  AS benutzer_id,
            b.benutzername,
            b.rolle,
            b.rechte,
            b.jahre,
            (s.zuletzt_gesehen < now() - $2::interval) AS nachfuehren
       FROM sitzung s
       JOIN benutzer b ON b.id = s.benutzer_id
      WHERE s.kennung_hash = $1
        AND s.laeuft_ab_am > now()
        AND b.aktiv`,
    [hashe(kennung), `${NACHFUEHREN_AB_MS} milliseconds`],
  );

  if (!zeile) return null;

  if (zeile.nachfuehren) {
    await abfrage(`UPDATE sitzung SET zuletzt_gesehen = now() WHERE id = $1`, [
      zeile.sitzung_id,
    ]);
  }

  return {
    // BIGINT liefert der Postgres-Treiber als Zeichenkette, ganz gleich, was
    // der TypeScript-Typ behauptet. In der Abfrage steht deshalb ::int – wer
    // "1908" mit 1908 vergleicht, bekommt immer false.
    sitzungId: Number(zeile.sitzung_id),
    benutzerId: Number(zeile.benutzer_id),
    benutzername: zeile.benutzername,
    rolle: zeile.rolle,
    // Die Rechte kommen bei JEDEM Aufruf frisch aus der Datenbank, nicht aus
    // dem Cookie: ein entzogenes Recht wirkt sofort, so wie ein
    // abgeschaltetes Konto.
    rechte: zeile.rechte ?? [],
    // Dasselbe fuer die Jahrgaenge: eine Freischaltung wirkt beim naechsten
    // Seitenaufruf, ohne dass jemand sich neu anmelden muss. NULL bleibt NULL
    // (alle Jahre) – hier darf kein `?? []` stehen, das waere "keines".
    jahre: zeile.jahre === null ? null : zeile.jahre.map(Number),
  };
}

export async function abmelden(): Promise<void> {
  const kiste = await cookies();
  const kennung = kiste.get(COOKIE_NAME)?.value;
  if (kennung) {
    await abfrage(`DELETE FROM sitzung WHERE kennung_hash = $1`, [hashe(kennung)]);
  }
  kiste.delete(COOKIE_NAME);
}

/** Alle Sitzungen eines Kontos beenden – beim Abschalten und beim Passwortwechsel. */
export async function alleSitzungenBeenden(benutzerId: number): Promise<number> {
  const zeilen = await abfrage<{ id: string }>(
    `DELETE FROM sitzung WHERE benutzer_id = $1 RETURNING id`,
    [benutzerId],
  );
  return zeilen.length;
}

/** Zeitkonstanter Vergleich, damit die Laufzeit nichts verraet. */
export function gleich(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  if (x.length !== y.length) return false;
  return timingSafeEqual(x, y);
}
