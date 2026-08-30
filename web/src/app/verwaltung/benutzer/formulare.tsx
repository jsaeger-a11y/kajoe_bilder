"use client";

import { useActionState } from "react";

import {
  benutzerAnlegen,
  passwortZuruecksetzen,
  type Zustand,
} from "./aktionen";

export function AnlegenFormular({ mindestlaenge }: { mindestlaenge: number }) {
  const [zustand, absenden, laeuft] = useActionState<Zustand, FormData>(benutzerAnlegen, {});

  return (
    <form action={absenden} className="karte">
      <label htmlFor="neu-name">Benutzername</label>
      <input id="neu-name" name="benutzername" type="text" autoCapitalize="none" required />

      <label htmlFor="neu-passwort">Passwort (mindestens {mindestlaenge} Zeichen)</label>
      <input id="neu-passwort" name="passwort" type="password" autoComplete="new-password" required />

      <label htmlFor="neu-rolle">Rolle</label>
      <select id="neu-rolle" name="rolle" defaultValue="betrachter">
        <option value="betrachter">betrachter</option>
        <option value="verwalter">verwalter</option>
      </select>

      {zustand.fehler ? <p className="fehler">{zustand.fehler}</p> : null}
      {zustand.erledigt ? <p className="hinweis">{zustand.erledigt}</p> : null}

      <button className="haupt" type="submit" disabled={laeuft}>
        Anlegen
      </button>
    </form>
  );
}

export function PasswortFormular({ mindestlaenge }: { mindestlaenge: number }) {
  const [zustand, absenden, laeuft] = useActionState<Zustand, FormData>(
    passwortZuruecksetzen,
    {},
  );

  return (
    <form action={absenden} className="karte">
      <label htmlFor="pw-id">Konto-Nummer</label>
      <input id="pw-id" name="id" type="text" inputMode="numeric" required />

      <label htmlFor="pw-neu">Neues Passwort (mindestens {mindestlaenge} Zeichen)</label>
      <input id="pw-neu" name="passwort" type="password" autoComplete="new-password" required />

      {zustand.fehler ? <p className="fehler">{zustand.fehler}</p> : null}
      {zustand.erledigt ? <p className="hinweis">{zustand.erledigt}</p> : null}

      <button type="submit" disabled={laeuft}>
        Passwort setzen
      </button>
    </form>
  );
}
