"use server";

import { revalidatePath } from "next/cache";

import { abfrage, eineZeile } from "@/lib/db";
import { hashe, passwortBeanstandung } from "@/lib/passwort";
import { alleSitzungenBeenden } from "@/lib/sitzung";
import { aktionVerwalter } from "@/lib/zugriff";

export interface Zustand {
  fehler?: string;
  erledigt?: string;
}

const ROLLEN = ["verwalter", "betrachter"] as const;
type Rolle = (typeof ROLLEN)[number];

function istRolle(wert: string): wert is Rolle {
  return (ROLLEN as readonly string[]).includes(wert);
}

/**
 * JEDE dieser Aktionen prueft die Rolle selbst.
 *
 * Dass die Seite davor nur Verwaltern angezeigt wird, ist keine Pruefung: eine
 * Server Action ist eine Adresse wie jede andere und laesst sich von aussen
 * direkt ansprechen.
 */

export async function benutzerAnlegen(_v: Zustand, formular: FormData): Promise<Zustand> {
  await aktionVerwalter();

  const name = String(formular.get("benutzername") ?? "").trim();
  const passwort = String(formular.get("passwort") ?? "");
  const rolle = String(formular.get("rolle") ?? "betrachter");

  if (!/^[a-z0-9._-]{3,40}$/i.test(name)) {
    return { fehler: "Benutzername: 3 bis 40 Zeichen, nur Buchstaben, Ziffern, . _ -" };
  }
  if (!istRolle(rolle)) return { fehler: "Unbekannte Rolle." };
  const beanstandung = passwortBeanstandung(passwort);
  if (beanstandung) return { fehler: beanstandung };

  const schon = await eineZeile(
    `SELECT 1 FROM benutzer WHERE lower(benutzername) = lower($1)`,
    [name],
  );
  if (schon) return { fehler: "Den Benutzernamen gibt es schon." };

  await abfrage(
    `INSERT INTO benutzer (benutzername, passwort_hash, rolle) VALUES ($1, $2, $3)`,
    [name, await hashe(passwort), rolle],
  );
  revalidatePath("/verwaltung/benutzer");
  return { erledigt: `Konto ${name} angelegt.` };
}

export async function rolleAendern(formular: FormData): Promise<void> {
  const wer = await aktionVerwalter();
  const id = Number(formular.get("id"));
  const rolle = String(formular.get("rolle") ?? "");
  if (!Number.isInteger(id) || !istRolle(rolle)) throw new Error("Ungueltige Eingabe.");

  // Wer sich selbst die Verwalterrolle nimmt, sperrt womoeglich den letzten
  // Verwalter aus. Beides wird verhindert.
  if (id === wer.benutzerId && rolle !== "verwalter") {
    throw new Error("Die eigene Verwalterrolle laesst sich hier nicht abgeben.");
  }
  await sicherstellenVerwalterBleibt(id, rolle, null);

  await abfrage(`UPDATE benutzer SET rolle = $2 WHERE id = $1`, [id, rolle]);
  revalidatePath("/verwaltung/benutzer");
}

export async function aktivSetzen(formular: FormData): Promise<void> {
  const wer = await aktionVerwalter();
  const id = Number(formular.get("id"));
  const aktiv = String(formular.get("aktiv")) === "1";
  if (!Number.isInteger(id)) throw new Error("Ungueltige Eingabe.");

  if (id === wer.benutzerId && !aktiv) {
    throw new Error("Das eigene Konto laesst sich hier nicht abschalten.");
  }
  await sicherstellenVerwalterBleibt(id, null, aktiv);

  // Abgeschaltet statt geloescht: sonst verwaisen spaeter die Auswahllisten.
  await abfrage(`UPDATE benutzer SET aktiv = $2 WHERE id = $1`, [id, aktiv]);

  // Ein abgeschaltetes Konto soll sofort draussen sein, nicht erst, wenn
  // irgendwann eine Sitzung ablaeuft.
  if (!aktiv) await alleSitzungenBeenden(id);
  revalidatePath("/verwaltung/benutzer");
}

export async function fehlversucheZuruecksetzen(formular: FormData): Promise<void> {
  await aktionVerwalter();
  const id = Number(formular.get("id"));
  if (!Number.isInteger(id)) throw new Error("Ungueltige Eingabe.");
  await abfrage(`UPDATE benutzer SET fehlversuche = 0 WHERE id = $1`, [id]);
  revalidatePath("/verwaltung/benutzer");
}

export async function passwortZuruecksetzen(_v: Zustand, formular: FormData): Promise<Zustand> {
  await aktionVerwalter();
  const id = Number(formular.get("id"));
  const passwort = String(formular.get("passwort") ?? "");
  if (!Number.isInteger(id)) return { fehler: "Ungueltige Eingabe." };

  const beanstandung = passwortBeanstandung(passwort);
  if (beanstandung) return { fehler: beanstandung };

  await abfrage(
    `UPDATE benutzer SET passwort_hash = $2, fehlversuche = 0 WHERE id = $1`,
    [id, await hashe(passwort)],
  );
  // Ein zurueckgesetztes Passwort beendet alle Sitzungen des Kontos – sonst
  // bliebe angemeldet, wer den Grund fuer das Zuruecksetzen war.
  await alleSitzungenBeenden(id);
  revalidatePath("/verwaltung/benutzer");
  return { erledigt: "Passwort gesetzt, alle Sitzungen des Kontos beendet." };
}

/** Es muss immer mindestens ein aktiver Verwalter uebrig bleiben. */
async function sicherstellenVerwalterBleibt(
  id: number,
  neueRolle: string | null,
  neuAktiv: boolean | null,
): Promise<void> {
  const bleibtVerwalter =
    (neueRolle === null || neueRolle === "verwalter") && (neuAktiv === null || neuAktiv);
  if (bleibtVerwalter) return;

  const zeile = await eineZeile<{ anzahl: string }>(
    `SELECT count(*) AS anzahl FROM benutzer
      WHERE rolle = 'verwalter' AND aktiv AND id <> $1`,
    [id],
  );
  if (Number(zeile?.anzahl ?? 0) === 0) {
    throw new Error("Es muss mindestens ein aktiver Verwalter uebrig bleiben.");
  }
}
