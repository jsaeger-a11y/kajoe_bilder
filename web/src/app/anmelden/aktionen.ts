"use server";

import { redirect } from "next/navigation";

import { adresse, browserkennung } from "@/lib/anfrage";
import { anmeldenVersuchen } from "@/lib/anmeldung";
import { abmelden } from "@/lib/sitzung";

export interface Zustand {
  fehler?: string;
}

export async function anmelden(_vorher: Zustand, formular: FormData): Promise<Zustand> {
  const benutzername = String(formular.get("benutzername") ?? "");
  const passwort = String(formular.get("passwort") ?? "");

  if (!benutzername || !passwort) {
    return { fehler: "Bitte beides ausfuellen." };
  }

  const ergebnis = await anmeldenVersuchen(
    benutzername,
    passwort,
    await adresse(),
    await browserkennung(),
  );

  // Das Passwort wird ab hier nirgends mehr angefasst – nicht protokolliert,
  // nicht zurueckgegeben, nicht im Formular gehalten.
  if (!ergebnis.ok) return { fehler: ergebnis.meldung };

  redirect("/");
}

export async function abmeldenAktion(): Promise<void> {
  await abmelden();
  redirect("/anmelden");
}
