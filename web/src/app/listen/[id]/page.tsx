import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { dauertext } from "@/lib/galerie";
import { bilderDerListe, listeZumSehen } from "@/lib/listen";
import { HOECHSTENS_JE_LISTE } from "@/lib/rechte";
import { sichtVon } from "@/lib/sichtbar";
import { verlangeAnmeldung } from "@/lib/zugriff";
import Kopf from "../../kopf";
import Paketformular from "../../paketformular";
import { UmbenennenFormular } from "../formulare";
import { bildAusListe, freigabeUmschalten, listeLoeschen } from "../aktionen";

export const metadata: Metadata = { title: "Auswahlliste" };

function datum(d: Date): string {
  const t = new Date(d);
  const z = (n: number) => String(n).padStart(2, "0");
  return `${z(t.getUTCDate())}.${z(t.getUTCMonth() + 1)}.${t.getUTCFullYear()}`;
}

export default async function Listenansicht({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const wer = await verlangeAnmeldung();
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) notFound();

  // Eigene Liste ODER freigegebene fremde – gefiltert in der Abfrage, mit der
  // Kennung aus der Sitzung.
  const sicht = sichtVon(wer);
  const liste = await listeZumSehen(id, wer.benutzerId, sicht);
  if (!liste) notFound();

  const meine = liste.besitzer_id === wer.benutzerId;
  const tun = String((await searchParams).tun ?? "");
  const bilder = await bilderDerListe(id, sicht);
  // Was wegen eines gesperrten Jahrgangs fehlt. Still weglassen waere das
  // Schlimmste: man laedt das Paket herunter und baut einen Kalender mit
  // Luecken, ohne zu wissen, dass welche fehlen.
  const fehlend = liste.anzahl - liste.verfuegbar;

  return (
    <main>
      <Kopf wer={wer} />

      <nav className="blaettern">
        <Link href="/listen">← alle Listen</Link>
        <span>{liste.anzahl} von {HOECHSTENS_JE_LISTE} Bildern</span>
      </nav>

      <h1>{liste.name}</h1>
      <p className="leise">
        {meine ? "Deine Liste" : `Liste von ${liste.besitzer}`}
        {liste.freigegeben ? ", freigegeben" : ""} · angelegt {datum(liste.angelegt_am)}
      </p>

      {/*
        Die Bilder bleiben in der Liste, auch wenn ihr Jahrgang gesperrt ist –
        und das muss dastehen. Still weglassen waere das Schlimmste: man laedt
        das Paket herunter und baut einen Kalender mit Luecken, ohne zu wissen,
        dass welche fehlen.
      */}
      {fehlend > 0 ? (
        <p className="hinweis">
          <strong>{liste.anzahl} Bilder, davon {fehlend} derzeit nicht verfügbar.</strong>{" "}
          Sie stehen weiter in der Liste und sind wieder da, sobald der Jahrgang
          freigeschaltet ist – im Paket unten sind sie nicht enthalten.
        </p>
      ) : null}

      {!meine ? (
        <p className="hinweis">
          Diese Liste ist für dich <strong>freigegeben</strong>: du kannst sie sehen,
          aber nicht ändern.
        </p>
      ) : null}

      {meine ? (
        <div className="filterzeile">
          <b>Liste</b>
          {tun === "umbenennen" ? (
            <Link className="marke-filter gewaehlt" href={`/listen/${id}`}>Abbrechen</Link>
          ) : (
            <Link className="marke-filter" href={`/listen/${id}?tun=umbenennen`}>Umbenennen …</Link>
          )}
          <form action={freigabeUmschalten}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="freigegeben" value={liste.freigegeben ? "0" : "1"} />
            <button className="klein" type="submit">
              {liste.freigegeben ? "Freigabe zurücknehmen" : "Für andere freigeben"}
            </button>
          </form>
          {tun === "loeschen" ? (
            <Link className="marke-filter gewaehlt" href={`/listen/${id}`}>Abbrechen</Link>
          ) : (
            <Link className="marke-filter" href={`/listen/${id}?tun=loeschen`}>Löschen …</Link>
          )}
        </div>
      ) : null}

      {meine && tun === "umbenennen" ? (
        <UmbenennenFormular id={id} name={liste.name} />
      ) : null}

      {meine && tun === "loeschen" ? (
        <div className="karte">
          <p>
            Die Liste <strong>{liste.name}</strong> mit {bilder.length} Bild(ern) wirklich
            löschen? <strong>Die Bilder selbst bleiben</strong> – nur die Sammlung
            verschwindet.
          </p>
          <form action={listeLoeschen} className="nebeneinander">
            <input type="hidden" name="id" value={id} />
            <button className="haupt" type="submit">Ja, Liste löschen</button>
            <Link className="marke-filter" href={`/listen/${id}`}>Abbrechen</Link>
          </form>
        </div>
      ) : null}

      {/* Der Download-Knopf gehoert an die Liste, nicht in ein Untermenue:
          durchsehen, sammeln, herunterladen ist der eigentliche Ablauf.
          Nach dem Herunterladen bleibt die Liste bestehen – sie ist kein
          Warenkorb, der sich leert. */}
      <Paketformular zeilen={bilder} listeId={id} was="Aufnahmen in dieser Liste"
                     fehlend={fehlend} />

      {bilder.length === 0 ? (
        <p className="hinweis">
          Noch nichts drin. In der <Link href="/galerie">Galerie</Link> auf
          „Bilder auswählen“ und dann in diese Liste legen.
        </p>
      ) : (
        <div className="gitter">
          {bilder.map((b) => {
            const laenge = dauertext(b.dauer_sekunden);
            return (
              <div key={b.id} className="kachel-rahmen">
                <Link href={`/bild/${b.id}`} className="kachel">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/datei/${b.id}/vorschau`} alt="" loading="lazy"
                       decoding="async" width={300} height={300} />
                  <span className="marke">{datum(b.aufnahme_lokal)}</span>
                  {b.typ === "video" ? (
                    <span className="tag">▶ Video{laenge ? ` ${laenge}` : ""}</span>
                  ) : null}
                </Link>
                {meine ? (
                  <form action={bildAusListe}>
                    <input type="hidden" name="liste" value={id} />
                    <input type="hidden" name="bild" value={b.id} />
                    <button className="klein" type="submit">aus der Liste nehmen</button>
                  </form>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
