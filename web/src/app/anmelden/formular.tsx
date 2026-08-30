"use client";

import { useActionState } from "react";

import { anmelden, type Zustand } from "./aktionen";

export default function Formular() {
  const [zustand, absenden, laeuft] = useActionState<Zustand, FormData>(anmelden, {});

  return (
    <form action={absenden}>
      <label htmlFor="benutzername">Benutzername</label>
      <input
        id="benutzername"
        name="benutzername"
        type="text"
        autoComplete="username"
        autoCapitalize="none"
        autoCorrect="off"
        required
      />

      <label htmlFor="passwort">Passwort</label>
      <input
        id="passwort"
        name="passwort"
        type="password"
        autoComplete="current-password"
        required
      />

      {zustand.fehler ? <p className="fehler">{zustand.fehler}</p> : null}

      <button className="haupt" type="submit" disabled={laeuft}>
        {laeuft ? "…" : "Anmelden"}
      </button>
    </form>
  );
}
