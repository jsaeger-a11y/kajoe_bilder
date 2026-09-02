import type { Metadata } from "next";
import Link from "next/link";

import { gb, ueberblick, zahl } from "@/lib/bestand";
import { sichtVon } from "@/lib/sichtbar";
import { darf, verlangeAnmeldung } from "@/lib/zugriff";
import KeinJahr from "./keinjahr";
import Kopf from "./kopf";

export const metadata: Metadata = { title: "Übersicht" };

export default async function Uebersicht() {
  const wer = await verlangeAnmeldung();
  const b = await ueberblick(sichtVon(wer));

  const anteil = (n: number) => (b.gesamt ? `${zahl((100 * n) / b.gesamt, 1)} %` : "–");

  return (
    <main>
      <Kopf wer={wer} />
      <h1>Übersicht</h1>

      {b.gesamt === 0 && b.jahreEingeschraenkt ? <KeinJahr /> : null}

      <div className="karte">
        <p>
          {b.jahreEingeschraenkt ? "Für dich freigeschaltet sind " : "Im Archiv liegen "}
          <strong>{zahl(b.gesamt)}</strong> Aufnahmen: {zahl(b.bilder)} Bilder und{" "}
          {zahl(b.videos)} Videos, zusammen {gb(b.originalBytes)} an Originalen
          {b.abgeleitetBytes !== null ? ` und ${gb(b.abgeleitetBytes)} an Ableitungen` : ""}.{" "}
          {zahl(b.mitOrt)} davon tragen eine brauchbare Koordinate.
        </p>
        <p className="leise">
          Bei {zahl(b.ohneExifZeit)} Aufnahmen ({anteil(b.ohneExifZeit)}) ist der
          Aufnahmezeitpunkt hergeleitet und nicht aus der Kamera – das steht bei
          jeder einzelnen dabei. Von {zahl(b.videos)} Videos{" "}
          {b.wiedergabeErzeugt === 1 ? "hat eines" : `haben ${zahl(b.wiedergabeErzeugt)}`}{" "}
          bereits eine abspielbare Fassung; die übrigen entstehen beim ersten
          Abspielen.
        </p>
        <p>
          <Link href="/galerie">Zur Galerie →</Link>
          {/* Der Verweis steht nur da, wo auch die Seite offen ist – die
              Prüfung selbst sitzt in /karte und in /api/karte. */}
          {darf(wer, "karte") ? (
            <>
              {"  ·  "}
              <Link href="/karte?herkunft=alle">Zur Karte →</Link>
            </>
          ) : null}
        </p>
      </div>

      <h2>Nach Jahr</h2>
      <div className="tabellenrahmen">
      <table>
        <thead>
          <tr>
            <th>Jahr</th>
            <th>Aufnahmen</th>
            <th>Bilder</th>
            <th>Videos</th>
          </tr>
        </thead>
        <tbody>
          {b.jeJahr.map((j) => (
            <tr key={j.jahr}>
              <td>
                <Link href={`/galerie?herkunft=alle&jahr=${j.jahr}`}>{j.jahr}</Link>
              </td>
              <td>{zahl(j.anzahl)}</td>
              <td>{zahl(j.bilder)}</td>
              <td>{zahl(j.videos)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      <h2>Nach Herkunft</h2>
      <div className="tabellenrahmen">
      <table>
        <thead>
          <tr>
            <th>Herkunft</th>
            <th>Aufnahmen</th>
            <th>Anteil</th>
          </tr>
        </thead>
        <tbody>
          {b.jeHerkunft.map((h) => (
            <tr key={h.herkunft}>
              <td>
                <Link href={`/galerie?herkunft=${h.herkunft}`}>{h.herkunft}</Link>
              </td>
              <td>{zahl(h.anzahl)}</td>
              <td className="leise">{anteil(h.anzahl)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      {/*
        Plattenzahlen nur ohne Jahreseinschraenkung: sie zaehlen Dateien und
        lassen sich nicht je Jahrgang trennen. Wer nur 2025 sehen darf, laese
        hier sonst den Umfang des ganzen Bestands ab.
      */}
      {b.platteGesamt !== null && b.platteFrei !== null && b.platteReserve !== null ? (
        <>
          <h2>Platte</h2>
          {/*
            Der Einhaengepunkt ist <code>/data</code> und nicht
            /data/kajoe_bilder – dort steht seit dem Plattenumzug nur noch ein
            Ordner. Die Zahlen gelten fuer die ganze Platte, die sich alle
            Projekte teilen; sie /data/kajoe_bilder zuzuschreiben waere eine
            stille Unwahrheit, sobald ein zweites Projekt dazukommt.
          */}
          <p className="leise">
            {gb(b.platteGesamt - b.platteFrei - b.platteReserve)} von{" "}
            {gb(b.platteGesamt)} belegt, {gb(b.platteFrei)} frei auf{" "}
            <code>/data</code> – der Platte, die sich alle Projekte teilen.
            {b.platteReserve > 0
              ? ` ${gb(b.platteReserve)} sind für root reserviert.`
              : ""}
          </p>
        </>
      ) : null}
    </main>
  );
}
