import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  GESICHTER_JE_SEITE, fundeDesHaeufchens, haeufchen, personen, zahlen,
} from "@/lib/personen";
import { sichtVon } from "@/lib/sichtbar";
import { verlangeRecht } from "@/lib/zugriff";
import Kopf from "../../kopf";
import {
  ablegenAktion, gesichtZurueckAktion, herausnehmenAktion, loesenAktion,
  uebernehmenAktion, zurueckholenAktion,
} from "../../personen/aktionen";
import { NeuePersonFormular, ZuordnenFormular } from "../../personen/formulare";
import { Blaettern, FundKachel, Unterleiste, zeitraum } from "../../personen/teile";

export const metadata: Metadata = { title: "Häufchen" };

export default async function Haeufchenseite({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const wer = await verlangeRecht("gesichter");
  const nummer = Number((await params).id);
  if (!Number.isInteger(nummer) || nummer < 1) notFound();

  const suche = await searchParams;
  const rohSeite = Number(Array.isArray(suche.seite) ? suche.seite[0] : suche.seite);
  const seite = Number.isInteger(rohSeite) && rohSeite > 0 ? rohSeite : 1;

  const sicht = sichtVon(wer);
  const darfBenennen = wer.rolle === "verwalter";

  const h = await haeufchen(nummer, sicht);
  // Kein Häufchen, oder keins mit sichtbaren Funden: dieselbe Antwort wie eine
  // unbekannte Kennung.
  if (!h || h.funde === 0) notFound();

  const [funde, ausgenommene, liste, z] = await Promise.all([
    fundeDesHaeufchens(nummer, sicht, seite),
    fundeDesHaeufchens(nummer, sicht, 1, true),
    darfBenennen ? personen(sicht) : Promise.resolve([]),
    zahlen(sicht),
  ]);

  const abweichler = funde.zeilen.filter(
    (f) => f.personId !== null && f.personId !== h.personId,
  );

  return (
    <main className="weit">
      <Kopf wer={wer} />
      <h1>{h.personName ?? `Häufchen ${h.id}`}</h1>
      <Unterleiste
        hier={h.zustand === "unwichtig" ? "abgelegt" : h.personName ? "benannt" : "offen"}
        zahlen={z}
      />

      <p className="hinweis-filter">
        <strong>{h.funde}</strong> Funde auf <strong>{h.bilder}</strong> Aufnahmen ·{" "}
        {zeitraum(h.von, h.bis)}
        {h.personName ? (
          <>
            {" · zugeordnet zu "}
            <Link href={`/personen/${h.personId}`}>{h.personName}</Link>
          </>
        ) : h.zustand === "unwichtig" ? (
          " · abgelegt"
        ) : (
          " · noch offen"
        )}
      </p>

      {darfBenennen ? (
        <>
          {h.personName === null && h.zustand === "offen" ? (
            <>
              <ZuordnenFormular
                gruppe={h.id}
                personen={liste.map((p) => ({ id: p.id, name: p.name, aufnahmen: p.aufnahmen }))}
              />
              <NeuePersonFormular gruppe={h.id} />
              <div className="karte">
                <p>
                  <strong>Oder als unwichtig ablegen.</strong> Passanten, Leute im
                  Hintergrund, Gäste, die einmal vorkamen. Das Häufchen bleibt vollständig
                  erhalten und nimmt weiter neue Gesichter auf – es stellt nur keine Frage
                  mehr. Zurückholen geht jederzeit.
                </p>
                <form action={ablegenAktion}>
                  <button className="klein" type="submit">
                    Als unwichtig ablegen
                  </button>
                  <input type="hidden" name="gruppe" value={h.id} />
                </form>
              </div>
            </>
          ) : null}

          <div className="filterzeile">
            {h.personName !== null && h.ohnePerson > 0 ? (
              <form action={uebernehmenAktion}>
                <input type="hidden" name="gruppe" value={h.id} />
                <button className="haupt" type="submit">
                  {h.ohnePerson} neue Funde für {h.personName} übernehmen
                </button>
              </form>
            ) : null}
            {h.personName !== null ? (
              <form action={loesenAktion}>
                <input type="hidden" name="gruppe" value={h.id} />
                <button className="klein" type="submit">
                  Zuordnung dieses Häufchens lösen
                </button>
              </form>
            ) : null}
            {h.zustand === "unwichtig" ? (
              <form action={zurueckholenAktion}>
                <input type="hidden" name="gruppe" value={h.id} />
                <button className="klein" type="submit">
                  Aus der Ablage zurückholen
                </button>
              </form>
            ) : null}
          </div>

          {h.personName !== null && h.ohnePerson > 0 ? (
            <p className="leise">
              Diese <strong>{h.ohnePerson}</strong> Funde sind nach dem Benennen
              dazugekommen. <strong>Kein Lauf schreibt einen Namen</strong> – das bleibt
              eine menschliche Entscheidung. Erst ansehen, dann übernehmen.
            </p>
          ) : null}
        </>
      ) : null}

      {abweichler.length ? (
        <p className="hinweis">
          {abweichler.length} Fund(e) in diesem Häufchen sind einer anderen Person
          zugeordnet ({[...new Set(abweichler.map((a) => a.personName))].join(", ")}). Das
          bleibt so – eine Zuordnung von Hand überschreibt keine andere.
        </p>
      ) : null}

      <div className="fundraster">
        {funde.zeilen.map((f) => (
          <FundKachel
            key={f.id}
            fund={f}
            gruppe={h.id}
            darfBenennen={darfBenennen}
            herausnehmen={herausnehmenAktion}
            zurueckholen={gesichtZurueckAktion}
          />
        ))}
      </div>

      <Blaettern
        pfad={`/haeufchen/${h.id}`}
        seite={seite}
        treffer={funde.treffer}
        jeSeite={GESICHTER_JE_SEITE}
      />

      <p className="leise">
        Sortiert nach Ähnlichkeit zum Mittel des Häufchens, sicherste zuerst. Die Zahl
        unter jedem Gesicht ist der Kosinus. <strong>Ganz hinten steht das Zweifelhafte</strong>
        {" "}– dort lohnt der Blick, wenn ein fremdes Gesicht dabei ist.
      </p>

      {ausgenommene.treffer > 0 ? (
        <>
          <h2>Herausgenommen</h2>
          <p className="leise">
            {ausgenommene.treffer} Fund(e) wurden von Hand aus diesem Häufchen genommen.
            Sie zählen nirgends mit, und{" "}
            <strong>kein Lauf ordnet sie wieder zu</strong>. Der Vermerk lässt sich
            zurücknehmen.
          </p>
          <div className="fundraster">
            {ausgenommene.zeilen.map((f) => (
              <FundKachel
                key={f.id}
                fund={f}
                gruppe={h.id}
                darfBenennen={darfBenennen}
                herausnehmen={herausnehmenAktion}
                zurueckholen={gesichtZurueckAktion}
              />
            ))}
          </div>
        </>
      ) : null}
    </main>
  );
}
