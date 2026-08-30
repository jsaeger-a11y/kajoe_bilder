"use client";

import { useActionState } from "react";

import { eigenesPasswortAendern, type Zustand } from "./aktionen";

export default function Formular({ mindestlaenge }: { mindestlaenge: number }) {
  const [zustand, absenden, laeuft] = useActionState<Zustand, FormData>(
    eigenesPasswortAendern,
    {},
  );

  return (
    <form action={absenden}>
      <label htmlFor="alt">Bisheriges Passwort</label>
      <input id="alt" name="alt" type="password" autoComplete="current-password" required />

      <label htmlFor="neu">Neues Passwort (mindestens {mindestlaenge} Zeichen)</label>
      <input id="neu" name="neu" type="password" autoComplete="new-password" required />

      <label htmlFor="wiederholung">Neues Passwort wiederholen</label>
      <input
        id="wiederholung"
        name="wiederholung"
        type="password"
        autoComplete="new-password"
        required
      />

      {zustand.fehler ? <p className="fehler">{zustand.fehler}</p> : null}
      {zustand.erledigt ? <p className="hinweis">{zustand.erledigt}</p> : null}

      <button className="haupt" type="submit" disabled={laeuft}>
        Ändern
      </button>
    </form>
  );
}
