/**
 * Anmelden und Abmelden.
 *
 * Zwei Regeln, die hier tragen:
 *
 * 1. **Die Fehlermeldung unterscheidet nicht** zwischen "Benutzer gibt es
 *    nicht" und "Passwort falsch". Sonst laesst sich von aussen herausfinden,
 *    welche Konten existieren.
 * 2. **Passwoerter kommen nirgends hin** – nicht in die Tabelle
 *    `anmeldeversuch`, nicht gekuerzt, nicht gehasht, nicht in ein Log.
 */

import "server-only";

import { abfrage, eineZeile } from "./db";
import { stimmt } from "./passwort";
import { alleSitzungenBeenden, sitzungAnlegen } from "./sitzung";

/**
 * Nach so vielen Fehlversuchen in Folge ist Schluss. Die Schwelle steht an
 * dieser einen Stelle.
 */
export const FEHLVERSUCHE_BIS_SPERRE = 5;

/** Immer derselbe Satz, gleich was schiefging. */
export const ABWEISUNG = "Benutzername oder Passwort stimmt nicht.";

export const GESPERRT =
  "Das Konto ist nach zu vielen Fehlversuchen gesperrt. Bitte an einen Verwalter wenden.";

interface Konto {
  id: number;
  benutzername: string;
  passwort_hash: string;
  rolle: "verwalter" | "betrachter";
  aktiv: boolean;
  fehlversuche: number;
}

async function vermerke(
  benutzername: string,
  erfolgreich: boolean,
  ip: string | null,
): Promise<void> {
  // Festgehalten wird JEDER Ausgang, der erfolgreiche mit: sonst bliebe die
  // eine Frage offen, ob am Ende doch jemand durchkam. Der Benutzername auch
  // dann, wenn es ihn gar nicht gibt – sonst sieht man das Absuchen nicht.
  await abfrage(
    `INSERT INTO anmeldeversuch (benutzername, erfolgreich, ip)
     VALUES ($1, $2, $3)`,
    [benutzername.slice(0, 200), erfolgreich, ip],
  );
}

export async function anmeldenVersuchen(
  benutzername: string,
  passwort: string,
  ip: string | null,
  browser: string | null,
): Promise<{ ok: true } | { ok: false; meldung: string }> {
  const name = benutzername.trim();

  const konto = await eineZeile<Konto>(
    `SELECT id::int AS id, benutzername, passwort_hash, rolle, aktiv, fehlversuche
       FROM benutzer WHERE lower(benutzername) = lower($1)`,
    [name],
  );

  // Auch ohne Konto wird geprueft – gegen einen Hash, den es nicht gibt. So
  // dauert der Fehlschlag ungefaehr gleich lang, ob das Konto existiert oder
  // nicht; sonst verraet allein die Antwortzeit, welche Namen es gibt.
  const hashZumPruefen =
    konto?.passwort_hash ??
    "$argon2id$v=19$m=19456,t=2,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  const passt = await stimmt(hashZumPruefen, passwort);

  if (!konto || !konto.aktiv) {
    await vermerke(name, false, ip);
    return { ok: false, meldung: ABWEISUNG };
  }

  if (konto.fehlversuche >= FEHLVERSUCHE_BIS_SPERRE) {
    await vermerke(name, false, ip);
    return { ok: false, meldung: GESPERRT };
  }

  if (!passt) {
    await abfrage(
      `UPDATE benutzer SET fehlversuche = fehlversuche + 1 WHERE id = $1`,
      [konto.id],
    );
    await vermerke(name, false, ip);
    return { ok: false, meldung: ABWEISUNG };
  }

  // Erfolg: Zaehler zurueck auf null.
  await abfrage(
    `UPDATE benutzer SET fehlversuche = 0, letzte_anmeldung = now() WHERE id = $1`,
    [konto.id],
  );
  await vermerke(name, true, ip);
  await sitzungAnlegen(konto.id, ip, browser);
  return { ok: true };
}

/** Nach einem Passwortwechsel gelten alte Sitzungen nicht weiter. */
export async function passwortSetzen(
  benutzerId: number,
  hash: string,
  auchAbmelden: boolean,
): Promise<void> {
  await abfrage(
    `UPDATE benutzer SET passwort_hash = $2, fehlversuche = 0 WHERE id = $1`,
    [benutzerId, hash],
  );
  if (auchAbmelden) await alleSitzungenBeenden(benutzerId);
}
