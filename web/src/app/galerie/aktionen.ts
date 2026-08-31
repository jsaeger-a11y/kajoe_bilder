"use server";

import { revalidatePath } from "next/cache";

import { anlegen, bilderHinzufuegen } from "@/lib/listen";
import { vormerkenSammel } from "@/lib/loeschen";
import { idsAusFeld, pruefeVollstaendig } from "@/lib/markierung";
import { LOESCHFRIST_TAGE } from "@/lib/rechte";
import { sichtVon } from "@/lib/sichtbar";
import { aktionAngemeldet, aktionRecht } from "@/lib/zugriff";

export interface Zustand {
  fehler?: string;
  erledigt?: string;
}

/**
 * Die markierten Bilder in eine Liste legen.
 *
 * Wieviel gemeint war, reist als eigenes Feld mit. Kommt weniger an, wird das
 * gesagt, statt stillschweigend weniger zu verarbeiten – bei fuenfhundert
 * Kennungen zaehlt das niemand nach.
 */
export async function inListeLegen(_v: Zustand, formular: FormData): Promise<Zustand> {
  const wer = await aktionAngemeldet();

  const ids = idsAusFeld(String(formular.get("ids") ?? ""));
  const beanstandung = pruefeVollstaendig(ids, Number(formular.get("anzahl")));
  if (beanstandung) return { fehler: beanstandung };

  const ziel = String(formular.get("liste") ?? "");
  let listeId: number;

  if (ziel === "neu") {
    const name = String(formular.get("name") ?? "");
    const neu = await anlegen(wer.benutzerId, name);
    if (!neu.ok) return { fehler: neu.fehler };
    listeId = neu.id;
  } else {
    listeId = Number(ziel);
    if (!Number.isInteger(listeId)) return { fehler: "Keine Liste gewählt." };
  }

  // bilderHinzufuegen prueft den Besitzer noch einmal, in der Abfrage.
  const ergebnis = await bilderHinzufuegen(listeId, wer.benutzerId, ids, sichtVon(wer));
  if (!ergebnis.ok) return { fehler: ergebnis.fehler };

  revalidatePath("/listen");
  revalidatePath("/galerie");
  return {
    erledigt:
      `${ergebnis.neu} Bild(er) hinzugefügt` +
      (ergebnis.schon ? `, ${ergebnis.schon} waren schon drin.` : "."),
  };
}

/**
 * Die markierten Bilder zum Loeschen vormerken.
 *
 * Bilder, die in einer Auswahlliste stehen, bleiben verschont: was jemand
 * ausdruecklich gesammelt hat, darf kein Stapellauf stillschweigend mitnehmen.
 */
export async function sammelVormerken(_v: Zustand, formular: FormData): Promise<Zustand> {
  // Die Pruefung steht HIER, nicht nur im Menue: eine Server Action ist eine
  // Adresse wie jede andere und laesst sich direkt ansprechen.
  const wer = await aktionRecht("loeschen");

  const ids = idsAusFeld(String(formular.get("ids") ?? ""));
  const beanstandung = pruefeVollstaendig(ids, Number(formular.get("anzahl")));
  if (beanstandung) return { fehler: beanstandung };

  const bericht = await vormerkenSammel(ids, sichtVon(wer));

  revalidatePath("/galerie");
  revalidatePath("/vorgemerkt");

  const teile = [`${bericht.vorgemerkt} Bild(er) vorgemerkt.`];
  if (bericht.wegenListe.length) {
    teile.push(
      `${bericht.wegenListe.length} übersprungen, weil sie in einer Auswahlliste stehen.`,
    );
  }
  if (bericht.schonWeg) teile.push(`${bericht.schonWeg} waren schon vorgemerkt.`);
  teile.push(`Die Dateien bleiben ${LOESCHFRIST_TAGE} Tage liegen.`);
  return { erledigt: teile.join(" ") };
}
