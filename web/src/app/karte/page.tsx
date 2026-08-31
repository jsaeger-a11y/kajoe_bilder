import type { Metadata } from "next";
import Link from "next/link";

import { filterAusSuche, suchtext, trefferzahlen, zeitraeume } from "@/lib/galerie";
import { ZOOM_MAX, ZOOM_MIN, mitteAusSuche, ortszahlen, startbereich } from "@/lib/karte";
import { sichtVon } from "@/lib/sichtbar";
import { verlangeRecht } from "@/lib/zugriff";
import Filterleiste from "../galerie/filterleiste";
import Kopf from "../kopf";
import KeinJahr from "../keinjahr";
import Ausschnittverweise from "./ausschnittverweise";
import Kartenfeld from "./kartenfeld";

export const metadata: Metadata = { title: "Karte" };

export default async function Karte({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Nur mit dem Recht `karte` – ein Verwalter hat es ohnehin. Abgewiesen wird
  // mit 404: wer die Aufnahmeorte nicht sehen darf, soll auch nicht erfahren,
  // dass es die Seite gibt.
  const wer = await verlangeRecht("karte");
  const suche = await searchParams;

  // Der Ortsfilter der Galerie faellt hier weg – die Karte zeigt immer und nur
  // Aufnahmen mit Ort. Ohne dieses Zuruecksetzen schleppte ein `ort=ohne` aus
  // der Galerie sich in die Kartenadressen und in die Verweise zurueck.
  const filter = { ...filterAusSuche(suche), ort: "alle", seite: 1 };

  const sicht = sichtVon(wer);
  const [zahlen, raeume, orte, bereich] = await Promise.all([
    trefferzahlen(filter, sicht),
    zeitraeume(filter, sicht),
    ortszahlen(filter, sicht),
    startbereich(filter, sicht),
  ]);

  // Genau der Teil der Adresse, den die Karte an ihre Abfragen anhaengt:
  // dieselben Filter, die die Galerie versteht, ohne Ausschnitt.
  const filterabfrage = suchtext(filter).replace(/^\?/, "");
  const anteilOhne = orte.gesamt ? Math.round((orte.ohneOrt / orte.gesamt) * 100) : 0;

  return (
    <main className="weit">
      <Kopf wer={wer} />
      <h1>Karte</h1>

      <Ausschnittverweise>
        <details className="filterklappe">
          <summary>
            Filter · {filter.herkunft === "alle" ? "alle Herkünfte" : filter.herkunft}
            {filter.jahr !== null ? ` · ${filter.jahr}` : ""}
            {filter.typ !== "alle" ? ` · ${filter.typ}` : ""}
          </summary>
          <Filterleiste
            filter={filter}
            zahlen={zahlen}
            treffer={orte.gesamt}
            zeitraeume={raeume}
            pfad="/karte"
            ortszeile={false}
            was="Aufnahmen im Filter"
          />
        </details>
      </Ausschnittverweise>

      {sicht.jahre?.length === 0 ? <KeinJahr /> : null}

      <Kartenfeld
        filterabfrage={filterabfrage}
        start={{ mitte: mitteAusSuche(suche), bereich }}
        zoomMin={ZOOM_MIN}
        zoomMax={ZOOM_MAX}
      />

      {/*
        Muss dastehen, und zwar sichtbar: wer nicht weiss, dass ein Teil des
        Bestands gar keine Koordinate hat, haelt die Karte fuer vollstaendig
        und sucht ein Bild, das dort nie erscheinen wird.
      */}
      <p className="hinweis-filter">
        <strong>{orte.mitOrt.toLocaleString("de-DE")}</strong> von{" "}
        <strong>{orte.gesamt.toLocaleString("de-DE")}</strong> Aufnahmen dieses Filters
        haben einen Ort. Die übrigen{" "}
        <strong>{orte.ohneOrt.toLocaleString("de-DE")}</strong> ({anteilOhne} %) stehen
        nicht auf der Karte – bei ausgeschalteter Ortung schreibt das Telefon keine
        Koordinate, und unplausible Werte werden beim Einlesen verworfen.{" "}
        <Link href={`/galerie${suchtext({ ...filter, ort: "ohne" })}`}>
          in der Galerie ansehen
        </Link>
      </p>

      <p className="leise">
        Ein Klick auf eine Gruppe zoomt so weit hinein, dass sie zerfällt. Ist der
        Ausschnitt klein genug, steht jede Aufnahme einzeln.
      </p>
    </main>
  );
}
