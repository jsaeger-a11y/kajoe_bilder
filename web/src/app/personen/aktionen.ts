"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  gesichtHerausnehmen, gesichtZurueckholen, haeufchenAblegen, haeufchenLoesen,
  haeufchenZuweisen, haeufchenZurueckholen, neueUebernehmen, personAnlegen,
  personAufloesen, personUmbenennen,
} from "@/lib/personen";
import { aktionVerwalter } from "@/lib/zugriff";

export interface Zustand {
  fehler?: string;
  erledigt?: string;
}

/*
  JEDE Aktion hier verlangt `aktionVerwalter()`.

  Ansehen ist ein Recht (`gesichter`), Benennen ist es nicht: wer Namen
  vergibt, legt fest, wer im Archiv namentlich auffindbar ist, und das berührt
  Rechte Dritter. Ein Betrachter MIT dem Recht `gesichter` sieht die Personen
  und kommt hier trotzdem nicht durch – auch dann nicht, wenn er die Action
  direkt anspricht. Dass die Knöpfe in seiner Anzeige fehlen, ist keine
  Prüfung; eine Server Action ist eine Adresse wie jede andere.
*/

function nummer(formular: FormData, feld: string): number | null {
  const n = Number(formular.get(feld));
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Alles, was sich durch eine Entscheidung ändern kann. */
function alleAuffrischen(): void {
  revalidatePath("/personen");
  revalidatePath("/haeufchen");
  revalidatePath("/haeufchen/benannt");
  revalidatePath("/haeufchen/abgelegt");
}

/** Neue Person anlegen und das Häufchen gleich zuordnen. */
export async function neuePersonAktion(_v: Zustand, formular: FormData): Promise<Zustand> {
  const wer = await aktionVerwalter();
  const gruppe = nummer(formular, "gruppe");
  if (gruppe === null) return { fehler: "Unbrauchbare Angabe." };

  const angelegt = await personAnlegen(String(formular.get("name") ?? ""), wer.benutzerId);
  if (!angelegt.ok) return { fehler: angelegt.fehler };

  const zugewiesen = await haeufchenZuweisen(gruppe, angelegt.id as number, wer.benutzerId);
  if (!zugewiesen.ok) return { fehler: zugewiesen.fehler };

  alleAuffrischen();
  revalidatePath(`/haeufchen/${gruppe}`);
  return { erledigt: `Angelegt und ${zugewiesen.anzahl} Fund(e) zugeordnet.` };
}

/** Einer bestehenden Person zuordnen – der häufigste Fall. */
export async function zuordnenAktion(_v: Zustand, formular: FormData): Promise<Zustand> {
  const wer = await aktionVerwalter();
  const gruppe = nummer(formular, "gruppe");
  const person = nummer(formular, "person");
  if (gruppe === null) return { fehler: "Unbrauchbare Angabe." };
  if (person === null) return { fehler: "Bitte eine Person auswählen." };

  const ergebnis = await haeufchenZuweisen(gruppe, person, wer.benutzerId);
  if (!ergebnis.ok) return { fehler: ergebnis.fehler };

  alleAuffrischen();
  revalidatePath(`/haeufchen/${gruppe}`);
  revalidatePath(`/personen/${person}`);
  return { erledigt: `${ergebnis.anzahl} Fund(e) zugeordnet.` };
}

/** Die Zuordnung dieses einen Häufchens lösen – die Person selbst bleibt. */
export async function loesenAktion(formular: FormData): Promise<void> {
  const wer = await aktionVerwalter();
  const gruppe = nummer(formular, "gruppe");
  if (gruppe === null) throw new Error("Unbrauchbare Angabe.");

  const ergebnis = await haeufchenLoesen(gruppe, wer.benutzerId);
  if (!ergebnis.ok) throw new Error(ergebnis.fehler);
  alleAuffrischen();
  revalidatePath(`/haeufchen/${gruppe}`);
}

/** Als unwichtig ablegen. Kein Löschen – das Häufchen bleibt vollständig. */
export async function ablegenAktion(formular: FormData): Promise<void> {
  const wer = await aktionVerwalter();
  const gruppe = nummer(formular, "gruppe");
  if (gruppe === null) throw new Error("Unbrauchbare Angabe.");

  const ergebnis = await haeufchenAblegen(gruppe, wer.benutzerId);
  if (!ergebnis.ok) throw new Error(ergebnis.fehler);
  alleAuffrischen();
  revalidatePath(`/haeufchen/${gruppe}`);
}

export async function zurueckholenAktion(formular: FormData): Promise<void> {
  const wer = await aktionVerwalter();
  const gruppe = nummer(formular, "gruppe");
  if (gruppe === null) throw new Error("Unbrauchbare Angabe.");

  await haeufchenZurueckholen(gruppe, wer.benutzerId);
  alleAuffrischen();
  revalidatePath(`/haeufchen/${gruppe}`);
}

/** Die nach einem Lauf dazugekommenen Funde übernehmen. */
export async function uebernehmenAktion(formular: FormData): Promise<void> {
  const wer = await aktionVerwalter();
  const gruppe = nummer(formular, "gruppe");
  if (gruppe === null) throw new Error("Unbrauchbare Angabe.");

  const ergebnis = await neueUebernehmen(gruppe, wer.benutzerId);
  if (!ergebnis.ok) throw new Error(ergebnis.fehler);
  alleAuffrischen();
  revalidatePath(`/haeufchen/${gruppe}`);
}

/** Ein einzelnes fremdes Gesicht aus dem Häufchen nehmen. */
export async function herausnehmenAktion(formular: FormData): Promise<void> {
  const wer = await aktionVerwalter();
  const id = nummer(formular, "gesicht");
  if (id === null) throw new Error("Unbrauchbare Angabe.");

  const ergebnis = await gesichtHerausnehmen(id, wer.benutzerId);
  if (!ergebnis.ok) throw new Error(ergebnis.fehler);
  alleAuffrischen();
  if (ergebnis.id !== undefined) revalidatePath(`/haeufchen/${ergebnis.id}`);
}

export async function gesichtZurueckAktion(formular: FormData): Promise<void> {
  await aktionVerwalter();
  const id = nummer(formular, "gesicht");
  const gruppe = nummer(formular, "gruppe");
  if (id === null) throw new Error("Unbrauchbare Angabe.");

  await gesichtZurueckholen(id);
  alleAuffrischen();
  if (gruppe !== null) revalidatePath(`/haeufchen/${gruppe}`);
}

export async function umbenennenAktion(_v: Zustand, formular: FormData): Promise<Zustand> {
  await aktionVerwalter();
  const id = nummer(formular, "person");
  if (id === null) return { fehler: "Unbrauchbare Angabe." };

  const ergebnis = await personUmbenennen(id, String(formular.get("name") ?? ""));
  if (!ergebnis.ok) return { fehler: ergebnis.fehler };
  alleAuffrischen();
  revalidatePath(`/personen/${id}`);
  return { erledigt: "Neuer Name gespeichert." };
}

/** Auflösen: die Funde bleiben, die Zuordnung fällt weg, die Bilder bleiben. */
export async function aufloesenAktion(formular: FormData): Promise<void> {
  await aktionVerwalter();
  const id = nummer(formular, "person");
  if (id === null) throw new Error("Unbrauchbare Angabe.");

  await personAufloesen(id);
  alleAuffrischen();
  redirect("/personen");
}
