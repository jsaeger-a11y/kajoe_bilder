"use client";

import { useActionState } from "react";

import { inListeLegen, type Zustand } from "../../galerie/aktionen";

/** Ein einzelnes Bild in eine Liste legen – dieselbe Aktion wie bei der Sammelauswahl. */
export default function InListe({
  bildId, listen,
}: {
  bildId: number;
  listen: { id: number; name: string; anzahl: number }[];
}) {
  const [zustand, absenden, laeuft] = useActionState<Zustand, FormData>(inListeLegen, {});

  return (
    <form action={absenden} className="auswahlteil">
      <input type="hidden" name="ids" value={String(bildId)} />
      <input type="hidden" name="anzahl" value="1" />
      <label htmlFor="ziel-liste">In eine Auswahlliste legen</label>
      <div className="nebeneinander">
        <select id="ziel-liste" name="liste" defaultValue={listen.length ? String(listen[0].id) : "neu"}>
          {listen.map((l) => (
            <option key={l.id} value={l.id}>{l.name} ({l.anzahl})</option>
          ))}
          <option value="neu">neue Liste …</option>
        </select>
        <input name="name" type="text" placeholder="Name, falls neue Liste" />
        <button className="haupt" type="submit" disabled={laeuft}>Hinzufügen</button>
      </div>
      {zustand.fehler ? <p className="fehler">{zustand.fehler}</p> : null}
      {zustand.erledigt ? <p className="hinweis">{zustand.erledigt}</p> : null}
    </form>
  );
}
