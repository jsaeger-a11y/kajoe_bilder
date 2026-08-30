/**
 * Markierte Bilder – in der Adresse, nicht im Browser.
 *
 * Zwei Gruende:
 *
 * 1. Die Kennungen der Bilder, die gerade nicht auf dem Schirm stehen, kennt
 *    ohnehin nur der Server. Eine Sammelauswahl ueber 500 Treffer laesst sich
 *    aus den sichtbaren Kacheln gar nicht zusammensetzen.
 *
 * 2. **Die Falle, die man einmal baut und lange sucht:** Der naheliegende Weg
 *    waere ein angehaktes Kaestchen je Kachel. React setzt beim Aktualisieren
 *    aber nur das Attribut `defaultChecked` – die tatsaechliche Ankreuzung des
 *    Feldes, und nur die wird abgeschickt, entsteht allein beim ersten Aufbau.
 *    Nach einem vollen Seitenaufbau stimmt es, nach einem Klick auf einen
 *    Verweis nicht mehr: man blaettert auf Seite 2, kommt zurueck und schickt
 *    die Haelfte ab, ohne dass irgendwo etwas zu sehen waere.
 *
 *    Deshalb traegt jede Kachel im Auswahlmodus einen **Verweis**, der die
 *    Kennung der Adresse hinzufuegt oder aus ihr entfernt. Was in der Adresse
 *    steht, ueberlebt jedes Blaettern.
 */

import { HOECHSTENS_JE_VORGANG } from "./rechte";

export interface Auswahl {
  /** Auswahlmodus an (`w=1`). */
  aktiv: boolean;
  /** Markierte Kennungen (`m=1,2,3`). */
  ids: number[];
}

type Suchwerte = Record<string, string | string[] | undefined>;

function eins(wert: string | string[] | undefined): string | null {
  return Array.isArray(wert) ? (wert[0] ?? null) : (wert ?? null);
}

export function auswahlAusSuche(suche: Suchwerte): Auswahl {
  const roh = eins(suche.m) ?? "";
  const ids: number[] = [];
  const gesehen = new Set<number>();
  for (const stueck of roh.split(",")) {
    const n = Number(stueck);
    if (Number.isInteger(n) && n > 0 && !gesehen.has(n)) {
      gesehen.add(n);
      ids.push(n);
      if (ids.length >= HOECHSTENS_JE_VORGANG) break;
    }
  }
  return { aktiv: eins(suche.w) === "1" || ids.length > 0, ids };
}

/** Die Teile fuer die Adresse – wird an `suchtext()` angehaengt. */
export function auswahlteile(auswahl: Auswahl): string[] {
  const teile: string[] = [];
  if (auswahl.aktiv) teile.push("w=1");
  if (auswahl.ids.length) teile.push(`m=${auswahl.ids.join(",")}`);
  return teile;
}

export function umschalten(auswahl: Auswahl, id: number): Auswahl {
  const drin = auswahl.ids.includes(id);
  return {
    aktiv: true,
    ids: drin
      ? auswahl.ids.filter((x) => x !== id)
      : [...auswahl.ids, id].slice(0, HOECHSTENS_JE_VORGANG),
  };
}

export function istMarkiert(auswahl: Auswahl, id: number): boolean {
  return auswahl.ids.includes(id);
}

/** Aus dem Formularfeld zurueckgelesen, mit derselben Bereinigung wie oben. */
export function idsAusFeld(wert: string): number[] {
  const ids: number[] = [];
  const gesehen = new Set<number>();
  for (const stueck of String(wert).split(",")) {
    const n = Number(stueck);
    if (Number.isInteger(n) && n > 0 && !gesehen.has(n)) {
      gesehen.add(n);
      ids.push(n);
    }
  }
  return ids;
}

/**
 * Kommt weniger an, als gemeint war, wird das gesagt – nicht stillschweigend
 * weniger verarbeitet. Bei fuenfhundert Kennungen zaehlt das niemand nach.
 */
export function pruefeVollstaendig(
  ids: number[],
  gemeint: number,
): string | null {
  if (!Number.isInteger(gemeint) || gemeint < 0) {
    return "Die Angabe, wie viele Bilder gemeint waren, fehlt oder ist unbrauchbar.";
  }
  if (ids.length !== gemeint) {
    return `Es sollten ${gemeint} Bilder sein, angekommen sind ${ids.length}. ` +
      `Nichts geändert – bitte die Auswahl neu treffen.`;
  }
  if (ids.length === 0) return "Es ist nichts ausgewählt.";
  if (ids.length > HOECHSTENS_JE_VORGANG) {
    return `Höchstens ${HOECHSTENS_JE_VORGANG} Bilder auf einmal.`;
  }
  return null;
}
