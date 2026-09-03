"use client";

import { useActionState } from "react";

import { neuePersonAktion, umbenennenAktion, zuordnenAktion, type Zustand } from "./aktionen";

/**
 * Die Formulare mit Rückmeldung.
 *
 * **Keine Kästchen, keine Vorauswahl.** In diesem Projekt hat die
 * `defaultChecked`-Falle zweimal zugeschlagen: React schreibt bei einer
 * Vorauswahl nur das Attribut, und was das Formular tatsächlich abschickt,
 * steht woanders. Hier gibt es deshalb nur Felder ohne Vorgabewert – die
 * Auswahlliste beginnt mit einem leeren Eintrag, den der Server abweist.
 */

/** Einer bestehenden Person zuordnen – der häufigste Fall, deshalb zuerst. */
export function ZuordnenFormular({
  gruppe,
  personen,
}: {
  gruppe: number;
  personen: { id: number; name: string; aufnahmen: number }[];
}) {
  const [zustand, absenden, laeuft] = useActionState<Zustand, FormData>(zuordnenAktion, {});
  if (!personen.length) return null;

  return (
    <form action={absenden} className="karte">
      <input type="hidden" name="gruppe" value={gruppe} />
      <label htmlFor={`person-${gruppe}`}>Einer bestehenden Person zuordnen</label>
      <div className="nebeneinander">
        {/* Eine echte Auswahlliste: auf dem Telefon ist das der native
            Auswähler und damit das einzige, was sich mit dem Daumen
            zuverlässig treffen lässt. */}
        <select id={`person-${gruppe}`} name="person" required>
          <option value="">– bitte wählen –</option>
          {personen.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.aufnahmen})
            </option>
          ))}
        </select>
        <button className="haupt" type="submit" disabled={laeuft}>
          Zuordnen
        </button>
      </div>
      <p className="leise">
        Das ist zugleich das Zusammenführen: zwei Häufchen derselben Person bekommen
        denselben Namen. Die Häufchen bleiben getrennt – sie sind der Vorschlag der
        Maschine.
      </p>
      {zustand.fehler ? <p className="fehler">{zustand.fehler}</p> : null}
      {zustand.erledigt ? <p className="hinweis">{zustand.erledigt}</p> : null}
    </form>
  );
}

/** Neue Person anlegen. Freier Text, keine Prüfung auf „echte" Namen. */
export function NeuePersonFormular({ gruppe }: { gruppe: number }) {
  const [zustand, absenden, laeuft] = useActionState<Zustand, FormData>(neuePersonAktion, {});
  return (
    <form action={absenden} className="karte">
      <input type="hidden" name="gruppe" value={gruppe} />
      <label htmlFor={`neu-${gruppe}`}>Neue Person anlegen</label>
      <div className="nebeneinander">
        <input
          id={`neu-${gruppe}`}
          name="name"
          type="text"
          maxLength={80}
          placeholder="Name"
          autoComplete="off"
          required
        />
        <button className="haupt" type="submit" disabled={laeuft}>
          Anlegen und zuordnen
        </button>
      </div>
      <p className="leise">
        Der Name ist freier Text und wird nicht geprüft. Im Piloten war das drittgrösste
        Häufchen der Hund – der bekommt einen Namen wie alle anderen.
      </p>
      {zustand.fehler ? <p className="fehler">{zustand.fehler}</p> : null}
      {zustand.erledigt ? <p className="hinweis">{zustand.erledigt}</p> : null}
    </form>
  );
}

/**
 * Umbenennen.
 *
 * Das Feld steht erst da, wenn jemand „Umbenennen" gewählt hat; gespeichert
 * wird mit „Neuen Namen speichern". Kein Knopf heisst wie etwas, das er nicht
 * tut.
 */
export function UmbenennenFormular({ person, name }: { person: number; name: string }) {
  const [zustand, absenden, laeuft] = useActionState<Zustand, FormData>(umbenennenAktion, {});
  return (
    <form action={absenden} className="karte">
      <input type="hidden" name="person" value={person} />
      <label htmlFor="neuer-personenname">Neuer Name</label>
      <div className="nebeneinander">
        {/*
          Der Schluessel ist der gespeicherte Name – genau das Gegenmittel zur
          `defaultChecked`-Falle. `defaultValue` setzt nur das Attribut; nach
          einem erfolgreichen Umbenennen rendert die Seite neu, und ohne einen
          neuen Schluessel behielte das Feld im DOM den alten Wert. Beim
          naechsten Umbenennen stuende dann etwas anderes darin, als der Server
          kennt.
        */}
        <input
          key={name}
          id="neuer-personenname"
          name="name"
          type="text"
          defaultValue={name}
          maxLength={80}
          required
        />
        <button className="haupt" type="submit" disabled={laeuft}>
          Neuen Namen speichern
        </button>
      </div>
      {zustand.fehler ? <p className="fehler">{zustand.fehler}</p> : null}
      {zustand.erledigt ? <p className="hinweis">{zustand.erledigt}</p> : null}
    </form>
  );
}
