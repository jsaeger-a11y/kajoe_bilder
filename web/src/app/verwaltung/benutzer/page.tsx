import type { Metadata } from "next";

import { abfrage } from "@/lib/db";
import { FEHLVERSUCHE_BIS_SPERRE } from "@/lib/anmeldung";
import { PASSWORT_MINDESTLAENGE } from "@/lib/passwort";
import { verlangeVerwalter } from "@/lib/zugriff";
import Kopf from "../../kopf";
import { aktivSetzen, fehlversucheZuruecksetzen, rolleAendern } from "./aktionen";
import { AnlegenFormular, PasswortFormular } from "./formulare";

export const metadata: Metadata = { title: "Benutzer" };

interface Zeile {
  id: number;
  benutzername: string;
  rolle: string;
  aktiv: boolean;
  fehlversuche: number;
  angelegt_am: Date;
  letzte_anmeldung: Date | null;
  sitzungen: string;
}

export default async function Benutzerverwaltung() {
  // Die Pruefung steht IN der Seite, nicht nur im Menue.
  const wer = await verlangeVerwalter();

  const zeilen = await abfrage<Zeile>(
    `SELECT b.id::int AS id, b.benutzername, b.rolle, b.aktiv, b.fehlversuche,
            b.angelegt_am, b.letzte_anmeldung,
            (SELECT count(*) FROM sitzung s
              WHERE s.benutzer_id = b.id AND s.laeuft_ab_am > now()) AS sitzungen
       FROM benutzer b ORDER BY b.benutzername`,
  );

  const zeit = (d: Date | null) =>
    d ? new Date(d).toISOString().slice(0, 16).replace("T", " ") + " UTC" : "–";

  return (
    <main>
      <Kopf wer={wer} />
      <h1>Benutzer</h1>

      <table>
        <thead>
          <tr>
            <th>Nr.</th>
            <th>Name</th>
            <th>Rolle</th>
            <th>Zustand</th>
            <th>Fehlversuche</th>
            <th>Sitzungen</th>
            <th>letzte Anmeldung</th>
          </tr>
        </thead>
        <tbody>
          {zeilen.map((z) => (
            <tr key={z.id}>
              <td>{z.id}</td>
              <td>
                {z.benutzername}
                {z.id === wer.benutzerId ? <span className="leise"> (das bin ich)</span> : null}
              </td>
              <td>
                <form action={rolleAendern}>
                  <input type="hidden" name="id" value={z.id} />
                  <input
                    type="hidden"
                    name="rolle"
                    value={z.rolle === "verwalter" ? "betrachter" : "verwalter"}
                  />
                  {z.rolle}{" "}
                  <button className="klein" type="submit">
                    → {z.rolle === "verwalter" ? "betrachter" : "verwalter"}
                  </button>
                </form>
              </td>
              <td>
                <form action={aktivSetzen}>
                  <input type="hidden" name="id" value={z.id} />
                  <input type="hidden" name="aktiv" value={z.aktiv ? "0" : "1"} />
                  {z.aktiv ? "aktiv" : "abgeschaltet"}{" "}
                  <button className="klein" type="submit">
                    {z.aktiv ? "abschalten" : "einschalten"}
                  </button>
                </form>
              </td>
              <td>
                {z.fehlversuche}
                {z.fehlversuche >= FEHLVERSUCHE_BIS_SPERRE ? (
                  <strong> gesperrt</strong>
                ) : null}{" "}
                {z.fehlversuche > 0 ? (
                  <form action={fehlversucheZuruecksetzen}>
                    <input type="hidden" name="id" value={z.id} />
                    <button className="klein" type="submit">
                      zurücksetzen
                    </button>
                  </form>
                ) : null}
              </td>
              <td>{Number(z.sitzungen)}</td>
              <td className="leise">{zeit(z.letzte_anmeldung)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="leise">
        Konten werden abgeschaltet, nicht gelöscht – sonst verwaisen später die
        Auswahllisten. Gesperrt wird nach {FEHLVERSUCHE_BIS_SPERRE} Fehlversuchen in Folge.
      </p>

      <h2>Konto anlegen</h2>
      <AnlegenFormular mindestlaenge={PASSWORT_MINDESTLAENGE} />

      <h2>Passwort zurücksetzen</h2>
      <PasswortFormular mindestlaenge={PASSWORT_MINDESTLAENGE} />
    </main>
  );
}
