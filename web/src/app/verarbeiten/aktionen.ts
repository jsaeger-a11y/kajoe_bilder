"use server";

import { revalidatePath } from "next/cache";

import {
  anstossen, anstossZuruecknehmen, eingangZustand, laufend, wartetAufStart,
} from "@/lib/verarbeitung";
import { aktionVerwalter } from "@/lib/zugriff";

export interface Zustand {
  fehler?: string;
  erledigt?: string;
}

/**
 * Verarbeitung anstossen.
 *
 * Nur fuer Verwalter – nicht wegen Missbrauch, sondern weil ein
 * versehentlicher Klick Stunden Rechenzeit ausloest. Die Pruefung steht HIER
 * und nicht nur in der Seite: eine Server Action ist eine Adresse wie jede
 * andere.
 */
export async function verarbeitungAnstossen(_v: Zustand, _f: FormData): Promise<Zustand> {
  const wer = await aktionVerwalter();

  if (await laufend()) {
    return { fehler: "Es läuft bereits ein Vorgang. Der zweite Anstoß wurde nicht angenommen." };
  }
  if (await wartetAufStart()) {
    return { fehler: "Es ist bereits angestoßen; der Dienst startet gleich." };
  }

  const eingang = await eingangZustand();
  if (eingang.anzahl === 0) {
    return { fehler: "In eingang/ liegt nichts. Es gibt nichts zu verarbeiten." };
  }

  await anstossen(wer.benutzerId);
  revalidatePath("/verarbeiten");
  return {
    erledigt:
      `Angestoßen: ${eingang.anzahl} Datei(en). Der Lauf gehört ab jetzt systemd – ` +
      `du kannst den Browser schließen.`,
  };
}

/** Falls der Dienst die Datei nicht abgeholt hat – etwa weil er nicht laeuft. */
export async function anstossAbbrechen(): Promise<void> {
  await aktionVerwalter();
  await anstossZuruecknehmen();
  revalidatePath("/verarbeiten");
}
