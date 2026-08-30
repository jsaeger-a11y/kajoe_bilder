/**
 * Einzelne Rechte je Benutzer – die Kennungen stehen hier und nirgends sonst.
 *
 * Ein Verwalter darf ohnehin alles; diese Liste ist fuer Betrachter gedacht,
 * die etwas Bestimmtes duerfen sollen, ohne gleich Verwalter zu werden.
 */

export const RECHTE = ["loeschen"] as const;

export type Recht = (typeof RECHTE)[number];

export const RECHT_TEXT: Record<Recht, string> = {
  loeschen: "Bilder zum Löschen vormerken",
};

export function istRecht(wert: string): wert is Recht {
  return (RECHTE as readonly string[]).includes(wert);
}

/**
 * Grenzen. Alle im Code, keine als Datenbankregel: eine Obergrenze, die sich
 * nur mit einer Migration verschieben laesst, verschiebt niemand.
 */

/** Hoechstens so viele Bilder je Sammelvorgang. */
export const HOECHSTENS_JE_VORGANG = 500;

/** Hoechstens so viele Bilder je Auswahlliste. */
export const HOECHSTENS_JE_LISTE = 500;

/** Hoechstens so viele Listen je Benutzer. */
export const HOECHSTENS_LISTEN = 50;

/** Frist zwischen Vormerken und Entfernen der Dateien. */
export const LOESCHFRIST_TAGE = 30;
