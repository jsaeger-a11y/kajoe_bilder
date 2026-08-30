import type { Metadata } from "next";
import Link from "next/link";

import { eigeneListen, freigegebeneListen } from "@/lib/listen";
import { HOECHSTENS_LISTEN } from "@/lib/rechte";
import { verlangeAnmeldung } from "@/lib/zugriff";
import Kopf from "../kopf";
import { AnlegenFormular } from "./formulare";

export const metadata: Metadata = { title: "Auswahllisten" };

function zeit(d: Date): string {
  const t = new Date(d);
  const z = (n: number) => String(n).padStart(2, "0");
  return `${z(t.getUTCDate())}.${z(t.getUTCMonth() + 1)}.${t.getUTCFullYear()}`;
}

export default async function Listen() {
  const wer = await verlangeAnmeldung();
  const [eigene, fremde] = await Promise.all([
    eigeneListen(wer.benutzerId),
    freigegebeneListen(wer.benutzerId),
  ]);

  return (
    <main>
      <Kopf wer={wer} />
      <h1>Auswahllisten</h1>

      <p className="leise">
        Benannte Listen, privat. So lässt sich die Arbeit unterbrechen und fortsetzen,
        und „Kalender 2027“ steht neben „Kalender 2028“. Freigegeben heißt{" "}
        <strong>sehen, nicht ändern</strong>.
      </p>

      <h2>Meine Listen ({eigene.length} von {HOECHSTENS_LISTEN})</h2>
      {eigene.length === 0 ? (
        <p className="hinweis">Noch keine Liste. Leg unten eine an.</p>
      ) : (
        <div className="tabellenrahmen">
          <table>
            <thead>
              <tr>
                <th>Name</th><th>Bilder</th><th>Freigegeben</th><th>Geändert</th>
              </tr>
            </thead>
            <tbody>
              {eigene.map((l) => (
                <tr key={l.id}>
                  <td><Link href={`/listen/${l.id}`}>{l.name}</Link></td>
                  <td>{l.anzahl}</td>
                  <td>{l.freigegeben ? "ja" : "nein"}</td>
                  <td className="leise">{zeit(l.geaendert_am)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2>Für mich freigegeben</h2>
      {fremde.length === 0 ? (
        <p className="leise">Niemand hat eine Liste freigegeben.</p>
      ) : (
        <div className="tabellenrahmen">
          <table>
            <thead>
              <tr><th>Name</th><th>von</th><th>Bilder</th><th>Geändert</th></tr>
            </thead>
            <tbody>
              {fremde.map((l) => (
                <tr key={l.id}>
                  <td><Link href={`/listen/${l.id}`}>{l.name}</Link></td>
                  <td>{l.besitzer}</td>
                  <td>{l.anzahl}</td>
                  <td className="leise">{zeit(l.geaendert_am)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2>Neue Liste</h2>
      <AnlegenFormular />
    </main>
  );
}
