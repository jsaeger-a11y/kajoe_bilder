import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  beispieleDerPerson, haeufchenDerPerson, personMit, zahlen,
} from "@/lib/personen";
import { sichtVon } from "@/lib/sichtbar";
import { verlangeRecht } from "@/lib/zugriff";
import Kopf from "../../kopf";
import { aufloesenAktion } from "../aktionen";
import { UmbenennenFormular } from "../formulare";
import { Gesicht, HaeufchenKachel, Unterleiste, zeitraum } from "../teile";

export const metadata: Metadata = { title: "Person" };

export default async function Personenseite({
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
  const tun = String(suche.tun ?? "");
  const sicht = sichtVon(wer);
  const darfBenennen = wer.rolle === "verwalter";

  const p = await personMit(nummer, sicht);
  if (!p) notFound();

  const [beispiele, haeufchen, z] = await Promise.all([
    beispieleDerPerson(p.id, sicht, 24),
    haeufchenDerPerson(p.id, sicht),
    zahlen(sicht),
  ]);

  return (
    <main className="weit">
      <Kopf wer={wer} />
      <h1>{p.name}</h1>
      <Unterleiste hier="personen" zahlen={z} />

      <p className="hinweis-filter">
        <strong>{p.aufnahmen.toLocaleString("de-DE")}</strong> Aufnahmen,{" "}
        <strong>{p.funde}</strong> erkannte Gesichter in <strong>{p.haeufchen}</strong>{" "}
        Häufchen · {zeitraum(p.von, p.bis)}{" "}
        <Link href={`/galerie?herkunft=alle&person=${p.id}`}>in der Galerie ansehen</Link>
      </p>

      <div className="gesichtszeile">
        {beispiele.map((g) => (
          <Gesicht key={g.id} fund={g} />
        ))}
      </div>

      <h2>Häufchen dieser Person</h2>
      <p className="leise">
        Mehrere Häufchen sind der Normalfall, keine Panne: ein Kind sieht mit sechs
        anders aus als mit vierzehn, und ein Gesicht mit Bart ist für die Maschine ein
        anderes als ohne.
      </p>
      <div className="haeufchenliste">
        {haeufchen.map((h) => (
          <HaeufchenKachel key={h.id} h={h} />
        ))}
      </div>

      {darfBenennen ? (
        <>
          <h2>Nachbessern</h2>
          <div className="filterzeile">
            <Link
              className={`marke-filter${tun === "umbenennen" ? " gewaehlt" : ""}`}
              href={tun === "umbenennen" ? `/personen/${p.id}` : `/personen/${p.id}?tun=umbenennen`}
            >
              Umbenennen …
            </Link>
            <Link
              className={`marke-filter${tun === "aufloesen" ? " gewaehlt" : ""}`}
              href={tun === "aufloesen" ? `/personen/${p.id}` : `/personen/${p.id}?tun=aufloesen`}
            >
              Auflösen …
            </Link>
          </div>

          {/* Der Verweis oben öffnet nur das Feld. Gespeichert wird mit dem
              Knopf, der auch so heisst. */}
          {tun === "umbenennen" ? <UmbenennenFormular person={p.id} name={p.name} /> : null}

          {tun === "aufloesen" ? (
            <div className="karte">
              <p>
                <strong>{p.name}</strong> auflösen? Die <strong>{p.funde}</strong> erkannten
                Gesichter bleiben erhalten und die <strong>{p.aufnahmen}</strong> Aufnahmen
                ebenfalls – <strong>es wird kein Bild gelöscht</strong>. Weg ist nur die
                Zuordnung: die Häufchen stehen danach wieder als offene Frage in der Liste.
              </p>
              <form action={aufloesenAktion} className="nebeneinander">
                <input type="hidden" name="person" value={p.id} />
                <button className="haupt" type="submit">
                  Ja, Zuordnung auflösen
                </button>
                <Link className="marke-filter" href={`/personen/${p.id}`}>
                  Abbrechen
                </Link>
              </form>
            </div>
          ) : null}
        </>
      ) : null}
    </main>
  );
}
