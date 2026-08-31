"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import {
  anlegen, bilderEntfernen, entfernen, freigabeSetzen, umbenennen,
} from "@/lib/listen";
import { sichtVon } from "@/lib/sichtbar";
import { aktionAngemeldet } from "@/lib/zugriff";

export interface Zustand {
  fehler?: string;
  erledigt?: string;
}

/**
 * JEDE dieser Aktionen holt die Kennung des Besitzers aus der SITZUNG und
 * reicht sie in die Abfrage. Dass die Seite davor nur eigene Listen zeigt,
 * ist keine Pruefung: eine Server Action ist eine Adresse wie jede andere.
 */

export async function listeAnlegen(_v: Zustand, formular: FormData): Promise<Zustand> {
  const wer = await aktionAngemeldet();
  const ergebnis = await anlegen(wer.benutzerId, String(formular.get("name") ?? ""));
  if (!ergebnis.ok) return { fehler: ergebnis.fehler };
  revalidatePath("/listen");
  return { erledigt: "Liste angelegt." };
}

export async function listeUmbenennen(_v: Zustand, formular: FormData): Promise<Zustand> {
  const wer = await aktionAngemeldet();
  const id = Number(formular.get("id"));
  if (!Number.isInteger(id)) return { fehler: "Unbrauchbare Angabe." };

  const fehler = await umbenennen(id, wer.benutzerId, String(formular.get("name") ?? ""));
  if (fehler) return { fehler };
  revalidatePath("/listen");
  revalidatePath(`/listen/${id}`);
  return { erledigt: "Neuer Name gespeichert." };
}

export async function listeLoeschen(formular: FormData): Promise<void> {
  const wer = await aktionAngemeldet();
  const id = Number(formular.get("id"));
  if (!Number.isInteger(id)) throw new Error("Unbrauchbare Angabe.");

  const fehler = await entfernen(id, wer.benutzerId);
  if (fehler) throw new Error(fehler);
  revalidatePath("/listen");
  redirect("/listen");
}

export async function freigabeUmschalten(formular: FormData): Promise<void> {
  const wer = await aktionAngemeldet();
  const id = Number(formular.get("id"));
  const frei = String(formular.get("freigegeben")) === "1";
  if (!Number.isInteger(id)) throw new Error("Unbrauchbare Angabe.");

  const fehler = await freigabeSetzen(id, wer.benutzerId, frei);
  if (fehler) throw new Error(fehler);
  revalidatePath("/listen");
  revalidatePath(`/listen/${id}`);
}

export async function bildAusListe(formular: FormData): Promise<void> {
  const wer = await aktionAngemeldet();
  const listeId = Number(formular.get("liste"));
  const bildId = Number(formular.get("bild"));
  if (!Number.isInteger(listeId) || !Number.isInteger(bildId)) {
    throw new Error("Unbrauchbare Angabe.");
  }

  const ergebnis = await bilderEntfernen(listeId, wer.benutzerId, [bildId], sichtVon(wer));
  if (!ergebnis.ok) throw new Error(ergebnis.fehler);
  revalidatePath(`/listen/${listeId}`);
}
