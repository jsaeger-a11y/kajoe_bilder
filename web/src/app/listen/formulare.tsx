"use client";

import { useActionState } from "react";

import { listeAnlegen, listeUmbenennen, type Zustand } from "./aktionen";

export function AnlegenFormular() {
  const [zustand, absenden, laeuft] = useActionState<Zustand, FormData>(listeAnlegen, {});
  return (
    <form action={absenden} className="karte">
      <label htmlFor="listenname">Name der neuen Liste</label>
      <div className="nebeneinander">
        <input id="listenname" name="name" type="text" maxLength={80}
               placeholder="zum Beispiel: Kalender 2027" required />
        <button className="haupt" type="submit" disabled={laeuft}>Anlegen</button>
      </div>
      {zustand.fehler ? <p className="fehler">{zustand.fehler}</p> : null}
      {zustand.erledigt ? <p className="hinweis">{zustand.erledigt}</p> : null}
    </form>
  );
}

export function UmbenennenFormular({ id, name }: { id: number; name: string }) {
  const [zustand, absenden, laeuft] = useActionState<Zustand, FormData>(listeUmbenennen, {});
  return (
    <form action={absenden} className="karte">
      <input type="hidden" name="id" value={id} />
      <label htmlFor="neuer-name">Neuer Name</label>
      <div className="nebeneinander">
        <input id="neuer-name" name="name" type="text" defaultValue={name} maxLength={80} required />
        {/* Der Knopf heisst, was er tut. "Umbenennen" hat das Feld geoeffnet. */}
        <button className="haupt" type="submit" disabled={laeuft}>Neuen Namen speichern</button>
      </div>
      {zustand.fehler ? <p className="fehler">{zustand.fehler}</p> : null}
      {zustand.erledigt ? <p className="hinweis">{zustand.erledigt}</p> : null}
    </form>
  );
}
