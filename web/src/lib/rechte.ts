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
/**
 * `gesichter` ist aus demselben Grund ein Recht wie `karte`.
 *
 * Wer die Personensuche hat, kann fragen "zeig mir alle Aufnahmen von X" – ueber
 * elf Jahrgaenge, auch die, in denen X ein Kind war. Das ist etwas anderes als
 * Bilder ansehen, und es soll getrennt vergeben werden koennen: jemand bekommt
 * fuer den Kalender einen Jahrgang frei, ohne damit das Archiv nach Personen
 * durchsuchen zu koennen. Vorgabe ist deshalb aus.
 *
 * **Ansehen ist ein Recht, Benennen ist es nicht.** Namen vergeben darf nur ein
 * Verwalter, und dafuer gibt es bewusst KEINE Kennung in dieser Liste – sonst
 * liesse sich das Recht einzeln verteilen, und genau das soll nicht gehen. Wer
 * benennt, legt fest, wer im Archiv namentlich auffindbar ist; das beruehrt
 * Rechte Dritter, und darueber entscheidet nicht jeder fuer sich.
 */
export const RECHTE = ["loeschen", "karte", "gesichter"] as const;

export type Recht = (typeof RECHTE)[number];

export const RECHT_TEXT: Record<Recht, string> = {
  loeschen: "Bilder zum Löschen vormerken",
  karte: "Aufnahmeorte auf der Karte sehen",
  gesichter: "Erkannte Personen sehen und nach ihnen suchen",
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
