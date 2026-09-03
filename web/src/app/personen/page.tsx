import type { Metadata } from "next";
import Link from "next/link";

import { beispieleDerPerson, personen, personenOhneFunde, zahlen } from "@/lib/personen";
import { sichtVon } from "@/lib/sichtbar";
import { verlangeRecht } from "@/lib/zugriff";
import Kopf from "../kopf";
import KeinJahr from "../keinjahr";
import { aufloesenAktion } from "./aktionen";
import { Gesicht, Unterleiste, zeitraum } from "./teile";

export const metadata: Metadata = { title: "Personen" };

export default async function Personen() {
  // Ansehen braucht das Recht `gesichter` – ein Verwalter hat es ohnehin.
  // Abgewiesen wird mit 404: wer die Personensuche nicht haben soll, muss auch
  // nicht erfahren, dass es sie gibt.
  const wer = await verlangeRecht("gesichter");
  const sicht = sichtVon(wer);
  const darfBenennen = wer.rolle === "verwalter";

  const [liste, z] = await Promise.all([personen(sicht), zahlen(sicht)]);
  const beispiele = await Promise.all(
    liste.map((p) => beispieleDerPerson(p.id, sicht, 6)),
  );
  // Namen ohne einen einzigen sichtbaren Fund. Sie stehen nur da, damit sie
  // sich auflösen lassen – sonst bliebe ein Name für immer stehen, dessen
  // Aufnahmen alle zum Löschen vorgemerkt wurden.
  const verwaist = darfBenennen ? await personenOhneFunde(sicht) : [];

  return (
    <main className="weit">
      <Kopf wer={wer} />
      <h1>Personen</h1>
      <Unterleiste hier="personen" zahlen={z} />

      {sicht.jahre?.length === 0 ? <KeinJahr /> : null}

      {liste.length === 0 ? (
        <p className="hinweis-filter">
          Noch ist keine Person benannt.{" "}
          <Link href="/haeufchen">Bei den offenen Häufchen anfangen</Link> – die grössten
          zuerst, die lohnen sich am meisten.
        </p>
      ) : (
        <div className="personenliste">
          {liste.map((p, i) => (
            <div className="karte personenkarte" key={p.id}>
              <div className="personenkopf">
                <h2>
                  <Link href={`/personen/${p.id}`}>{p.name}</Link>
                </h2>
                <span className="leise">
                  {p.aufnahmen.toLocaleString("de-DE")} Aufnahmen · {p.funde} Funde in{" "}
                  {p.haeufchen} Häufchen · {zeitraum(p.von, p.bis)}
                </span>
              </div>
              <div className="gesichtszeile">
                {beispiele[i].map((g) => (
                  <Gesicht key={g.id} fund={g} />
                ))}
              </div>
              <div className="filterzeile">
                {/* Der Weg in die Galerie – dort gelten Jahresfreischaltung,
                    Löschvormerkung und alle übrigen Filter automatisch mit. */}
                <Link className="marke-filter" href={`/galerie?herkunft=alle&person=${p.id}`}>
                  Alle Aufnahmen in der Galerie
                </Link>
                <Link className="marke-filter" href={`/personen/${p.id}`}>
                  Häufchen und Nachbessern
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {verwaist.length ? (
        <div className="karte">
          <h2>Namen ohne sichtbare Aufnahmen</h2>
          <p className="leise">
            Zu diesen Namen gibt es derzeit keinen einzigen sichtbaren Fund – etwa weil
            alle zugehörigen Aufnahmen zum Löschen vorgemerkt sind. Sie stehen hier, damit
            sie sich auflösen lassen.
          </p>
          {verwaist.map((p) => (
            <form action={aufloesenAktion} className="nebeneinander" key={p.id}>
              <input type="hidden" name="person" value={p.id} />
              <span>{p.name}</span>
              <button className="klein" type="submit">
                Auflösen
              </button>
            </form>
          ))}
        </div>
      ) : null}

      {!darfBenennen ? (
        <p className="leise">
          Benennen darf nur ein Verwalter. Wer Namen vergibt, legt fest, wer im Archiv
          namentlich auffindbar ist – das berührt Rechte Dritter.
        </p>
      ) : null}
    </main>
  );
}
