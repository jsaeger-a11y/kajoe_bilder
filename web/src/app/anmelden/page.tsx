import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { angemeldet } from "@/lib/sitzung";
import Formular from "./formular";

/**
 * Diese Seite ist hinter dem Tunnel oeffentlich erreichbar. Auf ihr steht
 * nicht, worum es geht: keine Namen, keine Familie, keine Fotos – nicht im
 * Text, nicht im Titel, nicht in den Metaangaben, kein Impressum.
 */
export const metadata: Metadata = {
  title: "Anmeldung",
  robots: { index: false, follow: false, nocache: true },
};

export default async function Anmeldeseite() {
  if (await angemeldet()) redirect("/");

  return (
    <main className="schmal">
      <h1>Anmeldung</h1>
      <Formular />
    </main>
  );
}
