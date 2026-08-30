"use client";

import { useActionState, useState } from "react";

import { inListeLegen, sammelVormerken, type Zustand } from "./aktionen";

export interface ListenEintrag {
  id: number;
  name: string;
  anzahl: number;
}

export default function Auswahlleiste({
  ids, listen, darfLoeschen, grenze,
}: {
  ids: number[];
  listen: ListenEintrag[];
  darfLoeschen: boolean;
  grenze: number;
}) {
  const [inListe, listeAbsenden, listeLaeuft] = useActionState<Zustand, FormData>(
    inListeLegen, {},
  );
  const [gemerkt, merkenAbsenden, merkenLaeuft] = useActionState<Zustand, FormData>(
    sammelVormerken, {},
  );
  const [ziel, setzeZiel] = useState<string>(listen.length ? String(listen[0].id) : "neu");
  const [nachfrage, setzeNachfrage] = useState(false);

  const felder = (
    <>
      {/* Die Kennungen reisen im Formular, nicht aus den Kacheln – siehe
          src/lib/markierung.ts. `anzahl` reist getrennt daneben, damit
          auffaellt, wenn drueben weniger ankommt. */}
      <input type="hidden" name="ids" value={ids.join(",")} />
      <input type="hidden" name="anzahl" value={ids.length} />
    </>
  );

  return (
    <div className="auswahlleiste">
      <p className="auswahlzahl">
        <strong>{ids.length}</strong> markiert
        {ids.length >= grenze ? (
          <span className="leise"> – mehr als {grenze} auf einmal sind nicht vorgesehen</span>
        ) : null}
      </p>

      <form action={listeAbsenden} className="auswahlteil">
        {felder}
        <label htmlFor="liste">In eine Auswahlliste legen</label>
        <div className="nebeneinander">
          <select id="liste" name="liste" value={ziel} onChange={(e) => setzeZiel(e.target.value)}>
            {listen.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} ({l.anzahl})
              </option>
            ))}
            <option value="neu">neue Liste …</option>
          </select>
          {ziel === "neu" ? (
            <input name="name" type="text" placeholder="Name der neuen Liste" required />
          ) : null}
          <button className="haupt" type="submit" disabled={listeLaeuft || ids.length === 0}>
            Hinzufügen
          </button>
        </div>
        {inListe.fehler ? <p className="fehler">{inListe.fehler}</p> : null}
        {inListe.erledigt ? <p className="hinweis">{inListe.erledigt}</p> : null}
      </form>

      {darfLoeschen ? (
        <form action={merkenAbsenden} className="auswahlteil">
          {felder}
          {nachfrage ? (
            <>
              <p className="hinweis">
                <strong>{ids.length} Bild(er) zum Löschen vormerken?</strong> Sie
                verschwinden aus der Galerie, die Dateien bleiben 30 Tage liegen und
                lassen sich unter <em>Vorgemerkt</em> zurückholen. Bilder, die in einer
                Auswahlliste stehen, werden übersprungen.
              </p>
              <div className="nebeneinander">
                <button type="submit" disabled={merkenLaeuft}>
                  Ja, vormerken
                </button>
                <button type="button" onClick={() => setzeNachfrage(false)}>
                  Abbrechen
                </button>
              </div>
            </>
          ) : (
            <button type="button" onClick={() => setzeNachfrage(true)} disabled={ids.length === 0}>
              Zum Löschen vormerken …
            </button>
          )}
          {gemerkt.fehler ? <p className="fehler">{gemerkt.fehler}</p> : null}
          {gemerkt.erledigt ? <p className="hinweis">{gemerkt.erledigt}</p> : null}
        </form>
      ) : null}
    </div>
  );
}
