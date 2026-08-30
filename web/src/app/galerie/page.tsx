import type { Metadata } from "next";
import Link from "next/link";

import {
  SEITENGROESSE, dauertext, filterAusSuche, monatstext, seite, suchtext,
  trefferzahlen, zeitraeume, type Kachel,
} from "@/lib/galerie";
import { verlangeAnmeldung } from "@/lib/zugriff";
import Kopf from "../kopf";
import Filterleiste from "./filterleiste";

export const metadata: Metadata = { title: "Galerie" };

function datum(d: Date): string {
  const t = new Date(d);
  return `${String(t.getUTCDate()).padStart(2, "0")}.${String(t.getUTCMonth() + 1).padStart(2, "0")}.`;
}

function uhrzeit(d: Date): string {
  const t = new Date(d);
  return `${String(t.getUTCHours()).padStart(2, "0")}:${String(t.getUTCMinutes()).padStart(2, "0")}`;
}

export default async function Galerie({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const wer = await verlangeAnmeldung();
  const filter = filterAusSuche(await searchParams);

  const [{ kacheln, treffer }, zahlen, raeume] = await Promise.all([
    seite(filter),
    trefferzahlen(filter),
    zeitraeume(filter),
  ]);

  const seiten = Math.max(1, Math.ceil(treffer / SEITENGROESSE));

  // Nach Monat gruppieren. Die Seite kann ueber einen Monatswechsel laufen –
  // die Ueberschrift entsteht deshalb beim Durchgehen, nicht aus dem Filter.
  const gruppen: { jahr: number; monat: number; stuecke: Kachel[] }[] = [];
  for (const k of kacheln) {
    const letzte = gruppen.at(-1);
    if (letzte && letzte.jahr === k.jahr && letzte.monat === k.monat) letzte.stuecke.push(k);
    else gruppen.push({ jahr: k.jahr, monat: k.monat, stuecke: [k] });
  }

  const anhang = suchtext(filter);

  return (
    <main>
      <Kopf wer={wer} />
      <h1>Galerie</h1>

      <Filterleiste filter={filter} zahlen={zahlen} treffer={treffer} zeitraeume={raeume} />

      {kacheln.length === 0 ? (
        <p className="hinweis">Zu diesen Filtern gibt es nichts.</p>
      ) : null}

      {gruppen.map((g) => (
        <section key={`${g.jahr}-${g.monat}`}>
          <h2 className="monatskopf">
            {monatstext(g.jahr, g.monat)} <span>{g.stuecke.length} auf dieser Seite</span>
          </h2>
          <div className="gitter">
            {g.stuecke.map((k) => {
              const laenge = dauertext(k.dauer_sekunden);
              return (
                <Link
                  key={k.id}
                  href={`/bild/${k.id}${anhang}`}
                  className="kachel"
                  title={`${datum(k.aufnahme_lokal)} ${uhrzeit(k.aufnahme_lokal)}`}
                >
                  {/*
                    Bewusst <img> und nicht next/image: der Bildzuschnitt von
                    Next holt die Datei serverseitig OHNE das Sitzungscookie und
                    liefe damit gegen unsere 401. Die Vorschau ist ohnehin schon
                    auf 300 px gerechnet.
                  */}
                  <img
                    src={`/datei/${k.id}/vorschau`}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    width={300}
                    height={300}
                  />
                  <span className="marke">
                    {datum(k.aufnahme_lokal)} {uhrzeit(k.aufnahme_lokal)}
                  </span>
                  {k.typ === "video" ? (
                    <span className="tag">▶ Video{laenge ? ` ${laenge}` : ""}</span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        </section>
      ))}

      {seiten > 1 ? (
        <nav className="blaettern">
          {filter.seite > 1 ? (
            <Link href={`/galerie${suchtext(filter, { seite: filter.seite - 1 })}`}>
              ← neuere
            </Link>
          ) : (
            <span>← neuere</span>
          )}
          <span>
            Seite {filter.seite} von {seiten} · {treffer} Aufnahmen
          </span>
          {filter.seite < seiten ? (
            <Link href={`/galerie${suchtext(filter, { seite: filter.seite + 1 })}`}>
              ältere →
            </Link>
          ) : (
            <span>ältere →</span>
          )}
        </nav>
      ) : null}
    </main>
  );
}
