"use server";

import { revalidatePath } from "next/cache";

import { eineZeile } from "@/lib/db";
import { passwortSetzen } from "@/lib/anmeldung";
import { hashe, passwortBeanstandung, stimmt } from "@/lib/passwort";
import { aktionAngemeldet } from "@/lib/zugriff";

export interface Zustand {
  fehler?: string;
  erledigt?: string;
}

/** Jeder aendert sein eigenes Passwort selbst, dafuer braucht es keinen Verwalter. */
export async function eigenesPasswortAendern(
  _vorher: Zustand,
  formular: FormData,
): Promise<Zustand> {
  // Auch hier wird geprueft, nicht nur in der Seite: eine Server Action ist
  // von aussen direkt ansprechbar.
  const wer = await aktionAngemeldet();

  const alt = String(formular.get("alt") ?? "");
  const neu = String(formular.get("neu") ?? "");
  const wiederholung = String(formular.get("wiederholung") ?? "");

  if (neu !== wiederholung) return { fehler: "Die beiden neuen Passwoerter stimmen nicht ueberein." };

  const beanstandung = passwortBeanstandung(neu);
  if (beanstandung) return { fehler: beanstandung };

  const konto = await eineZeile<{ passwort_hash: string }>(
    `SELECT passwort_hash FROM benutzer WHERE id = $1`,
    [wer.benutzerId],
  );
  if (!konto || !(await stimmt(konto.passwort_hash, alt))) {
    return { fehler: "Das bisherige Passwort stimmt nicht." };
  }

  // Nicht abmelden: wer gerade sein eigenes Passwort aendert, sitzt davor und
  // soll nicht aus der eigenen Sitzung fliegen.
  await passwortSetzen(wer.benutzerId, await hashe(neu), false);
  revalidatePath("/konto");
  return { erledigt: "Passwort geaendert." };
}
