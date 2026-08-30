/**
 * Passwoerter mit argon2id.
 *
 * Nie im Klartext, nie umkehrbar gehasht, nie in ein Log. Auch nicht gekuerzt
 * und auch nicht in einer Fehlermeldung.
 */

import { hash, verify } from "@node-rs/argon2";

/**
 * `Algorithm.Argon2id`. Der Wert steht hier als Zahl, weil @node-rs/argon2 die
 * Aufzaehlung als `const enum` deklariert: TypeScript loescht sie beim
 * Uebersetzen, zur Laufzeit ist `Algorithm` ein leeres Objekt, und mit
 * `isolatedModules` – das Next voraussetzt – laesst sie sich gar nicht erst
 * lesen. Wer `Algorithm.Argon2id` schreibt, bekommt `undefined` und damit
 * still argon2d statt argon2id.
 */
const ARGON2ID = 2;

// Nach der OWASP-Empfehlung fuer argon2id: 19 MiB Speicher, zwei Durchgaenge,
// ein Strang. Auf dieser Maschine sind das rund 14 ms je Hash – langsam genug
// gegen Ausprobieren, schnell genug fuer eine Anmeldung.
const PARAMETER = {
  algorithm: ARGON2ID,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashe(passwort: string): Promise<string> {
  return hash(passwort, PARAMETER);
}

export async function stimmt(gespeichert: string, eingabe: string): Promise<boolean> {
  try {
    return await verify(gespeichert, eingabe);
  } catch {
    // Kaputter oder fremder Hash in der Spalte: das ist ein Nein, kein Absturz.
    return false;
  }
}

/** Mindestlaenge an EINER Stelle. */
export const PASSWORT_MINDESTLAENGE = 12;

export function passwortBeanstandung(passwort: string): string | null {
  if (passwort.length < PASSWORT_MINDESTLAENGE) {
    return `Das Passwort braucht mindestens ${PASSWORT_MINDESTLAENGE} Zeichen.`;
  }
  return null;
}
