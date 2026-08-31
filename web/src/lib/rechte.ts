/**
 * Einzelne Rechte je Benutzer – die Kennungen stehen hier und nirgends sonst.
 *
 * Ein Verwalter darf ohnehin alles; diese Liste ist fuer Betrachter gedacht,
 * die etwas Bestimmtes duerfen sollen, ohne gleich Verwalter zu werden.
 */

/**
 * `karte` ist bewusst ein Recht und keine Selbstverstaendlichkeit.
 *
 * In CLAUDE.md steht: GPS auf privaten Fotos hinter einem oeffentlich
 * erreichbaren Tunnel heisst, dass die Wohnadresse in den Daten steht – die
 * Karte sei deshalb "im Zweifel nur fuer Verwalter". Das ist hier woertlich
 * umgesetzt: ein Verwalter darf ohnehin alles, ein Betrachter sieht die Karte
 * erst, wenn jemand ihm dieses Recht ausdruecklich gibt. Der Zweifel bleibt
 * damit die Vorgabe, ohne dass eine Aenderung der Meinung eine Codeaenderung
 * braucht.
 *
 * Wie berechtigt der Zweifel ist, zeigt der Bestand: 5.247 der 15.083
 * verorteten Aufnahmen liegen in einem Umkreis von fuenfzig Metern um
 * denselben Punkt. Wer die Karte aufmacht, sieht sofort, wo gewohnt wird.
 */
export const RECHTE = ["loeschen", "karte"] as const;

export type Recht = (typeof RECHTE)[number];

export const RECHT_TEXT: Record<Recht, string> = {
  loeschen: "Bilder zum Löschen vormerken",
  karte: "Aufnahmeorte auf der Karte sehen",
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
