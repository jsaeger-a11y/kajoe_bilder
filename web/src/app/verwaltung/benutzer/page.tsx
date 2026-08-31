import type { Metadata } from "next";
import { Fragment } from "react";

import { abfrage } from "@/lib/db";
import { FEHLVERSUCHE_BIS_SPERRE } from "@/lib/anmeldung";
import { PASSWORT_MINDESTLAENGE } from "@/lib/passwort";
import { RECHTE, RECHT_TEXT, type Recht } from "@/lib/rechte";
import { verlangeVerwalter } from "@/lib/zugriff";
import Kopf from "../../kopf";
import {
  aktivSetzen, fehlversucheZuruecksetzen, jahreSetzen, rechtUmschalten, rolleAendern,
} from "./aktionen";
import { AnlegenFormular, PasswortFormular } from "./formulare";

export const metadata: Metadata = { title: "Benutzer" };

interface Zeile {
  id: number;
  benutzername: string;
  rolle: string;
  aktiv: boolean;
  rechte: string[] | null;
  jahre: number[] | null;
  fehlversuche: number;
  angelegt_am: Date;
  letzte_anmeldung: Date | null;
  sitzungen: string;
}

export default async function Benutzerverwaltung({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Die Pruefung steht IN der Seite, nicht nur im Menue.
  const wer = await verlangeVerwalter();

  // Welche Zeile aufgeklappt ist, steht in der ADRESSE. Ein <details>, das der
  // Server nachtraeglich aufziehen muesste, waere nach jedem Absenden wieder
  // zu, und die Ansicht liesse sich nicht wiederfinden.
  const offen = Number(
    Array.isArray((await searchParams).jahre)
      ? ((await searchParams).jahre as string[])[0]
      : ((await searchParams).jahre ?? ""),
  );

  const [zeilen, jahrgaenge] = await Promise.all([
    abfrage<Zeile>(
      `SELECT b.id::int AS id, b.benutzername, b.rolle, b.aktiv, b.rechte, b.jahre,
              b.fehlversuche, b.angelegt_am, b.letzte_anmeldung,
              (SELECT count(*) FROM sitzung s
                WHERE s.benutzer_id = b.id AND s.laeuft_ab_am > now()) AS sitzungen
         FROM benutzer b ORDER BY b.benutzername`,
    ),
    // Die Jahre kommen AUS DEN DATEN, nicht aus einer Liste im Code. Sonst
    // muesste sie jemand nachfuehren und wuerde es vergessen.
    abfrage<{ jahr: number; anzahl: string }>(
      `SELECT jahr, count(*) AS anzahl FROM bild WHERE geloescht_am IS NULL
        GROUP BY jahr ORDER BY jahr DESC`,
    ),
  ]);

  const zeit = (d: Date | null) =>
    d ? new Date(d).toISOString().slice(0, 16).replace("T", " ") + " UTC" : "–";

  return (
    <main>
      <Kopf wer={wer} />
      <h1>Benutzer</h1>

      <div className="tabellenrahmen">
      <table>
        <thead>
          <tr>
            <th>Nr.</th>
            <th>Name</th>
            <th>Rolle</th>
            <th>Zustand</th>
            <th>Rechte</th>
            <th>Jahrgänge</th>
            <th>Fehlversuche</th>
            <th>Sitzungen</th>
            <th>letzte Anmeldung</th>
          </tr>
        </thead>
        <tbody>
          {zeilen.map((z) => (
            <Fragment key={z.id}>
            <tr id={`b${z.id}`}>
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
                {z.rolle === "verwalter" ? (
                  <span className="leise">darf ohnehin alles</span>
                ) : (
                  RECHTE.map((r: Recht) => {
                    const hat = (z.rechte ?? []).includes(r);
                    return (
                      <form key={r} action={rechtUmschalten}>
                        <input type="hidden" name="id" value={z.id} />
                        <input type="hidden" name="recht" value={r} />
                        <input type="hidden" name="geben" value={hat ? "0" : "1"} />
                        <button className="klein" type="submit" title={RECHT_TEXT[r]}>
                          {hat ? `✓ ${r}` : `+ ${r}`}
                        </button>
                      </form>
                    );
                  })
                )}
              </td>
              <td>
                {/*
                  Sichtbar machen, was gilt: bei einem eingeschraenkten Konto
                  steht hier, WELCHE Jahre es sind – nicht nur "eingeschraenkt".
                */}
                {z.rolle === "verwalter" ? (
                  <span className="leise">alle</span>
                ) : (
                  <>
                    {z.jahre === null
                      ? "alle, auch künftige"
                      : z.jahre.length === 0
                        ? <strong>keine</strong>
                        : z.jahre.map(Number).sort((a, b) => a - b).join(", ")}{" "}
                    <a className="klein-verweis"
                       href={offen === z.id
                         ? "/verwaltung/benutzer"
                         : `/verwaltung/benutzer?jahre=${z.id}#b${z.id}`}>
                      {offen === z.id ? "schließen" : "ändern …"}
                    </a>
                  </>
                )}
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

            {offen === z.id && z.rolle !== "verwalter" ? (
              <tr className="jahreszeile">
                <td colSpan={9}>
                  {/*
                    Der Schluessel enthaelt den gespeicherten Wert. Das ist
                    Absicht: React setzt beim Aktualisieren nur das ATTRIBUT
                    `defaultChecked`, nicht die tatsaechliche Ankreuzung des
                    Feldes. Bleibt dasselbe Formular stehen, zeigt es nach dem
                    Uebernehmen weiter die alten Haken – etwa, wenn "alle
                    Jahre" die einzeln angekreuzten ueberstimmt hat. Ein
                    veraenderter Schluessel wirft die Felder weg und baut sie
                    neu, dann stimmt, was zu sehen ist.
                  */}
                  <form action={jahreSetzen} key={`j${z.id}-${z.jahre === null ? "alle" : z.jahre.join("_")}`}>
                    <input type="hidden" name="id" value={z.id} />
                    <p className="leise">
                      Jahrgänge für <strong>{z.benutzername}</strong>
                    </p>

                    <label className="ankreuz">
                      <input type="checkbox" name="alle" value="1"
                             defaultChecked={z.jahre === null} />
                      {" "}Alle Jahre, auch künftige
                    </label>
                    <p className="leise">
                      Der Normalfall. Ein neuer Jahrgang erscheint damit von selbst,
                      sobald die ersten Bilder daraus eingelesen sind – niemand muss
                      eine Liste nachführen.
                    </p>

                    <p className="leise">
                      Ist der Schalter aus, gelten genau die angekreuzten Jahre.
                      Keines angekreuzt heißt: keines.
                    </p>
                    <div className="jahrekaesten">
                      {jahrgaenge.map((j) => (
                        <label className="ankreuz" key={j.jahr}>
                          <input type="checkbox" name="jahr" value={j.jahr}
                                 defaultChecked={(z.jahre ?? []).map(Number).includes(j.jahr)} />
                          {" "}{j.jahr}{" "}
                          <span className="leise">({Number(j.anzahl)})</span>
                        </label>
                      ))}
                    </div>

                    <button className="haupt" type="submit">Übernehmen</button>
                  </form>
                </td>
              </tr>
            ) : null}
            </Fragment>
          ))}
        </tbody>
      </table>
      </div>

      <p className="leise">
        Konten werden abgeschaltet, nicht gelöscht – sonst verwaisen später die
        Auswahllisten. Gesperrt wird nach {FEHLVERSUCHE_BIS_SPERRE} Fehlversuchen in Folge.
        Ein Verwalter ist von der Jahresfreischaltung nie betroffen; Rolle, Rechte und
        Jahrgänge sind drei getrennte Fragen.
      </p>

      <h2>Konto anlegen</h2>
      <AnlegenFormular mindestlaenge={PASSWORT_MINDESTLAENGE} />

      <h2>Passwort zurücksetzen</h2>
      <PasswortFormular mindestlaenge={PASSWORT_MINDESTLAENGE} />
    </main>
  );
}
