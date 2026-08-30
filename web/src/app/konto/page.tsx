import type { Metadata } from "next";

import { PASSWORT_MINDESTLAENGE } from "@/lib/passwort";
import { verlangeAnmeldung } from "@/lib/zugriff";
import Kopf from "../kopf";
import Formular from "./formular";

export const metadata: Metadata = { title: "Mein Konto" };

export default async function Konto() {
  const wer = await verlangeAnmeldung();

  return (
    <main>
      <Kopf wer={wer} />
      <h1>Mein Konto</h1>
      <p className="leise">
        Angemeldet als {wer.benutzername}, Rolle {wer.rolle}.
      </p>
      <Formular mindestlaenge={PASSWORT_MINDESTLAENGE} />
    </main>
  );
}
