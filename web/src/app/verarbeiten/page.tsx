import type { Metadata } from "next";
import Link from "next/link";

import { gb } from "@/lib/bestand";
import { zahlen as personenzahlen } from "@/lib/personen";
import { sichtVon } from "@/lib/sichtbar";
import {
  dauerSchaetzung, dauertext, eingangZustand, fehlerDesLaufs, laufend, letzteLaeufe,
  quarantaeneDesLaufs, tempo, uebertragungLaeuftVermutlich, wartetAufStart,
} from "@/lib/verarbeitung";
import { verlangeVerwalter } from "@/lib/zugriff";
import Kopf from "../kopf";
import { Anstossknopf, Selbstauffrischung } from "./anzeige";
import { anstossAbbrechen } from "./aktionen";

export const metadata: Metadata = { title: "Verarbeiten" };

// Nichts hier darf aus einem Zwischenspeicher kommen – die Seite zeigt einen
// Stand, der sich jede Sekunde aendert.
export const dynamic = "force-dynamic";

function zeit(d: Date | null): string {
  if (!d) return "–";
  const t = new Date(d);
  const z = (n: number) => String(n).padStart(2, "0");
  return `${z(t.getUTCDate())}.${z(t.getUTCMonth() + 1)}. ${z(t.getUTCHours())}:${z(t.getUTCMinutes())}`;
}

export default async function Verarbeiten() {
  // Nur Verwalter, und das steht IN der Seite.
  const wer = await verlangeVerwalter();

  const [eingang, aktiv, wartet, laeufe, personen] = await Promise.all([
    eingangZustand(), laufend(), wartetAufStart(), letzteLaeufe(8),
    // Wie viele Funde bei benannten Personen auf ein Ja warten. Ein Verwalter
    // sieht ohnehin alles, deshalb genuegt seine eigene Sicht.
    personenzahlen(sichtVon(wer)),
  ]);
  const schaetzung = dauerSchaetzung(eingang);

  const warnung = uebertragungLaeuftVermutlich(eingang);
  const t = aktiv ? await tempo(aktiv.id, aktiv.gesamt, aktiv.erledigt) : null;
  const verstrichen = aktiv
    ? (Date.now() - new Date(aktiv.begonnen_am).getTime()) / 1000
    : 0;

  // Namen zum letzten abgeschlossenen Lauf.
  const letzter = laeufe.find((l) => l.beendet_am !== null) ?? null;
  const [fehler, quarantaene] = letzter
    ? await Promise.all([
        fehlerDesLaufs(letzter.id),
        letzter.ingest_lauf_id ? quarantaeneDesLaufs(letzter.ingest_lauf_id) : Promise.resolve([]),
      ])
    : [[], []];

  return (
    <main>
      <Kopf wer={wer} />
      <h1>Verarbeiten</h1>

      {/* ------------------------------------------------ was liegt an */}
      <div className="karte">
        <h2>In <code>eingang/</code></h2>
        {eingang.anzahl === 0 && eingang.filepartAnzahl === 0 ? (
          <p>
            Es liegt <strong>nichts</strong> in <code>/data/kajoe_bilder/eingang/</code>.
            Kopiere zuerst Dateien dorthin – dann erscheint hier ein Knopf.
          </p>
        ) : (
          <>
            <p>
              <strong>{eingang.anzahl.toLocaleString("de-DE")}</strong> Datei(en),{" "}
              <strong>{gb(eingang.bytes)}</strong>
              {eingang.juengsteSekunden !== null ? (
                <> · jüngste vor {dauertext(eingang.juengsteSekunden)}</>
              ) : null}
            </p>
            {eingang.beispiele.length ? (
              <p className="leise">
                zum Beispiel: {eingang.beispiele.join(", ")}
                {eingang.anzahl > eingang.beispiele.length ? " …" : ""}
              </p>
            ) : null}
          </>
        )}
      </div>

      {/* ------------------------------------------------ laufender Vorgang */}
      {aktiv ? (
        <div className="paket">
          <h2>Läuft gerade: {aktiv.schritt}</h2>
          <p>
            <strong>{aktiv.erledigt.toLocaleString("de-DE")}</strong> von{" "}
            <strong>{aktiv.gesamt.toLocaleString("de-DE")}</strong>
            {aktiv.gesamt > 0 ? ` (${Math.round((100 * aktiv.erledigt) / aktiv.gesamt)} %)` : ""}
            {" · "}läuft seit {dauertext(verstrichen)}
            {aktiv.benutzername ? ` · angestoßen von ${aktiv.benutzername}` : " · von Hand"}
          </p>
          <div className="balken">
            <span style={{ width: `${aktiv.gesamt ? (100 * aktiv.erledigt) / aktiv.gesamt : 0}%` }} />
          </div>
          <p>
            {t?.restSekunden !== null && t?.restSekunden !== undefined ? (
              <>
                noch etwa <strong>{dauertext(t.restSekunden)}</strong>{" "}
                <span className="leise">
                  ({(t.proSekunde ?? 0).toFixed(1)} Dateien/s, gemessen über die letzten{" "}
                  {dauertext(t.fensterSekunden)}
                  {t.vorlaeufig ? " – noch zu kurz für eine belastbare Schätzung" : ""})
                </span>
              </>
            ) : (
              <span className="leise">
                Restzeit noch nicht messbar – dafür braucht es zwei Messpunkte.
              </span>
            )}
          </p>
          <p className="leise">
            Zuletzt gemeldet {zeit(aktiv.aktualisiert_am)} UTC. Der Lauf gehört systemd:
            Browser schließen, Telefon weglegen, später nachsehen.
          </p>
          <Selbstauffrischung takt={5} />
        </div>
      ) : wartet ? (
        <div className="paket">
          <h2>Angestoßen</h2>
          <p>
            Die Auslösedatei liegt bereit; <code>kajoe-verarbeiten.path</code> startet
            den Dienst gleich. Wenn hier nach einer Minute noch dasselbe steht, läuft
            die path-Einheit nicht.
          </p>
          <form action={anstossAbbrechen}>
            <button type="submit">Anstoß zurücknehmen</button>
          </form>
          <Selbstauffrischung takt={3} />
        </div>
      ) : eingang.anzahl > 0 ? (
        <div className="paket">
          <h2>Verarbeitung starten</h2>
          <p>
            Drei Schritte nacheinander: <strong>einlesen</strong>,{" "}
            <strong>ableiten</strong>, <strong>Gesichter</strong>. Schlägt einer fehl,
            laufen die folgenden nicht an. Der Lauf hängt nicht am Browser – Fenster
            schließen ist in Ordnung.
          </p>
          {/*
            Die Schätzung ist kein Versprechen. Sie steht hier, damit niemand
            einen Knopf drückt, der zwei Minuten dauern soll und drei Stunden
            läuft. Die Werte stehen an einer Stelle (DAUER_JE_DATEI_MS) und sind
            an diesem Bestand gemessen.
          */}
          <p>
            Grobe Schätzung: <strong>etwa {dauertext(schaetzung.gesamtSekunden)}</strong>{" "}
            <span className="leise">
              (einlesen {dauertext(schaetzung.einlesenSekunden)}, ableiten{" "}
              {dauertext(schaetzung.ableitenSekunden)}, Gesichter{" "}
              {dauertext(schaetzung.gesichterSekunden)} für{" "}
              {eingang.bilder.toLocaleString("de-DE")} Bilder, dazu{" "}
              {dauertext(schaetzung.vorlaufSekunden)} fester Vorlauf)
            </span>
          </p>
          <p className="leise">
            Gerechnet aus gemessenen Mittelwerten dieses Bestands – kein Versprechen.
            Große Videos dauern länger, ein Bild ohne Gesichter geht schneller.
          </p>
          <Anstossknopf anzahl={eingang.anzahl} warnung={warnung} />
        </div>
      ) : null}

      {/*
        Der Hinweis, der sonst niemandem auffiele: der Knopf ist gedrückt, der
        Lauf ist durch, und die sieben neuen Gesichter an "Oma" warten still.
        Der Gesichtsschritt ordnet mit Absicht nichts zu – ein Fund, der still
        der falschen Person zugeschlagen wird, ist nicht wiederzufinden, weil
        niemand die Zuordnung je gesehen hat.
      */}
      {personen.neue > 0 ? (
        <div className="paket">
          <h2>Es warten {personen.neue.toLocaleString("de-DE")} Funde auf ein Ja</h2>
          <p>
            Bei bereits benannten Personen sind neue Gesichter dazugekommen. Die
            Verarbeitung ordnet sie <strong>nicht</strong> von selbst zu – das bleibt eine
            menschliche Entscheidung. Bis dahin fehlen diese Aufnahmen in der Galerie
            unter der jeweiligen Person.
          </p>
          <p>
            <Link className="marke-filter" href="/haeufchen/benannt">
              Zu den benannten Häufchen
            </Link>
          </p>
        </div>
      ) : null}

      {/* ------------------------------------------------ Bericht */}
      <h2>Letzte Läufe</h2>
      {laeufe.length === 0 ? (
        <p className="hinweis">Noch kein Lauf verzeichnet.</p>
      ) : (
        <div className="tabellenrahmen">
          <table>
            <thead>
              <tr>
                <th>Nr.</th><th>Schritt</th><th>Zustand</th><th>Beginn</th><th>Dauer</th>
                <th>Ergebnis</th><th>angestoßen von</th>
              </tr>
            </thead>
            <tbody>
              {laeufe.map((l) => (
                <tr key={l.id}>
                  <td>{l.id}</td>
                  <td>{l.schritt}</td>
                  <td>{l.zustand}</td>
                  <td className="leise">{zeit(l.begonnen_am)}</td>
                  <td className="leise">
                    {l.beendet_am
                      ? dauertext((new Date(l.beendet_am).getTime() -
                                   new Date(l.begonnen_am).getTime()) / 1000)
                      : "läuft"}
                  </td>
                  <td>
                    {l.schritt === "einlesen" ? (
                      <>
                        gefunden {l.gefunden ?? 0}, übernommen {l.uebernommen ?? 0},
                        Dubletten {l.dubletten ?? 0}, Quarantäne {l.quarantaene ?? 0},
                        übersprungen {l.ingest_uebersprungen ?? 0}
                      </>
                    ) : l.schritt === "gesichter" ? (
                      <>
                        {(l.g_bilder ?? 0).toLocaleString("de-DE")} Bilder untersucht,{" "}
                        {(l.g_gesichter ?? 0).toLocaleString("de-DE")} Funde, davon{" "}
                        {(l.g_tauglich ?? 0).toLocaleString("de-DE")} tauglich; {" "}
                        {l.g_gruppen_neu ?? 0} neue Häufchen,{" "}
                        {(l.g_zugeordnet ?? 0).toLocaleString("de-DE")} an bestehende
                        angehängt
                        {l.fehlgeschlagen > 0 ? `, ${l.fehlgeschlagen} nicht lesbar` : ""}
                      </>
                    ) : (
                      <>
                        erzeugt {l.erzeugt}, übersprungen {l.uebersprungen},
                        fehlgeschlagen {l.fehlgeschlagen}
                      </>
                    )}
                    {l.bemerkung ? <div className="leise">{l.bemerkung}</div> : null}
                  </td>
                  <td className="leise">{l.benutzername ?? "von Hand"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ------------------------------------------------ Namen */}
      {letzter && (fehler.length > 0 || quarantaene.length > 0) ? (
        <>
          <h2>Was nicht durchkam (Lauf {letzter.id})</h2>
          <p className="leise">
            Namentlich, nicht nur gezählt – sonst weiß niemand, welche Datei fehlt.
          </p>
          <div className="tabellenrahmen">
            <table>
              <thead><tr><th>Art</th><th>Datei</th><th>Grund</th></tr></thead>
              <tbody>
                {quarantaene.map((q) => (
                  <tr key={`q${q.pfad}`}>
                    <td>Quarantäne</td><td>{q.pfad}</td><td>{q.grund}</td>
                  </tr>
                ))}
                {fehler.map((f) => (
                  <tr key={`f${f.pfad}`}>
                    <td>Ableitung</td><td>{f.pfad}</td><td>{f.grund}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      <p className="leise">
        Ohne Oberfläche geht es genauso: <code>tools/einlesen.sh</code>,{" "}
        <code>tools/ableiten.sh</code> und <code>tools/gesichter.sh</code> bleiben
        einzeln von Hand aufrufbar, und <code>tools/verarbeiten.sh</code> macht alle
        drei nacheinander. Wenn dieser Dienst nicht läuft, hängt die Verarbeitung
        nicht davon ab.
      </p>
    </main>
  );
}
