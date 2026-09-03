import Link from "next/link";

import { HAEUFCHEN_JE_SEITE, haeufchenSeite, zahlen, type Art } from "@/lib/personen";
import { sichtVon } from "@/lib/sichtbar";
import { verlangeRecht } from "@/lib/zugriff";
import Kopf from "../kopf";
import KeinJahr from "../keinjahr";
import { uebernehmenAktion, zurueckholenAktion } from "../personen/aktionen";
import { Blaettern, HaeufchenKachel, Unterleiste } from "../personen/teile";

/**
 * Die drei Häufchenlisten – offen, benannt, abgelegt.
 *
 * Eine Datei für alle drei: sie unterscheiden sich in der Auswahl und im Text,
 * nicht im Aufbau. Drei Abschriften desselben Rasters liefen früher oder
 * später auseinander, und dann sortiert eine Liste anders als die andere.
 */

const TEXTE: Record<
  Art,
  { titel: string; hier: "offen" | "benannt" | "abgelegt"; leer: string; hinweis: string }
> = {
  offen: {
    titel: "Offene Häufchen",
    hier: "offen",
    leer: "Keine offenen Häufchen mehr – alles ist entschieden.",
    hinweis:
      "Grösste zuerst: die lohnen sich am meisten. Die kleinen sind meist Passanten, " +
      "Hintergrundleute oder Gäste, die einmal vorkamen – dafür gibt es „Ablegen“.",
  },
  benannt: {
    titel: "Benannte Häufchen",
    hier: "benannt",
    leer: "Noch ist kein Häufchen benannt.",
    hinweis:
      "Steht hier „neu“, sind nach dem letzten Lauf Funde dazugekommen, die noch keine " +
      "Person tragen. Ein Lauf schreibt niemals einen Namen – das bleibt eine " +
      "menschliche Entscheidung. Ansehen und übernehmen.",
  },
  abgelegt: {
    titel: "Abgelegte Häufchen",
    hier: "abgelegt",
    leer: "Nichts abgelegt.",
    hinweis:
      "Abgelegt heisst entschieden, nicht gelöscht: die Funde stehen vollständig da, das " +
      "Häufchen nimmt weiter neue Gesichter auf und stellt keine Frage mehr. " +
      "Zurückholen geht jederzeit.",
  },
};

export default async function Haeufchenliste({
  art,
  pfad,
  suche,
}: {
  art: Art;
  pfad: string;
  suche: Record<string, string | string[] | undefined>;
}) {
  const wer = await verlangeRecht("gesichter");
  const sicht = sichtVon(wer);
  const darfBenennen = wer.rolle === "verwalter";

  const roh = Array.isArray(suche.seite) ? suche.seite[0] : suche.seite;
  const gewuenscht = Number(roh);
  const seite = Number.isInteger(gewuenscht) && gewuenscht > 0 ? gewuenscht : 1;

  const [liste, z] = await Promise.all([haeufchenSeite(art, sicht, seite), zahlen(sicht)]);
  const t = TEXTE[art];

  return (
    <main className="weit">
      <Kopf wer={wer} />
      <h1>{t.titel}</h1>
      <Unterleiste hier={t.hier} zahlen={z} />

      {sicht.jahre?.length === 0 ? <KeinJahr /> : null}

      <p className="hinweis-filter">
        {liste.treffer === 0 ? (
          t.leer
        ) : (
          <>
            <strong>{liste.treffer.toLocaleString("de-DE")}</strong> Häufchen. {t.hinweis}
          </>
        )}
      </p>

      <div className="haeufchenliste">
        {liste.zeilen.map((h) => (
          <div className="haeufchen-eintrag" key={h.id}>
            <HaeufchenKachel h={h} />
            {darfBenennen && art === "benannt" && h.ohnePerson > 0 ? (
              <form action={uebernehmenAktion}>
                <input type="hidden" name="gruppe" value={h.id} />
                <button className="klein" type="submit">
                  {h.ohnePerson} neue übernehmen
                </button>
              </form>
            ) : null}
            {darfBenennen && art === "abgelegt" ? (
              <form action={zurueckholenAktion}>
                <input type="hidden" name="gruppe" value={h.id} />
                <button className="klein" type="submit">
                  Zurückholen
                </button>
              </form>
            ) : null}
          </div>
        ))}
      </div>

      <Blaettern
        pfad={pfad}
        seite={seite}
        treffer={liste.treffer}
        jeSeite={HAEUFCHEN_JE_SEITE}
      />

      {!darfBenennen ? (
        <p className="leise">
          Benennen darf nur ein Verwalter. Wer Namen vergibt, legt fest, wer im Archiv
          namentlich auffindbar ist – das berührt Rechte Dritter.
        </p>
      ) : (
        <p className="leise">
          Ein Häufchen ist ein <em>Vorschlag</em> der Maschine: Gesichter, deren Vektoren
          nah beieinander liegen. Ob es dieselbe Person ist, entscheidet der Blick.{" "}
          <Link href="/personen">Zu den benannten Personen</Link>
        </p>
      )}
    </main>
  );
}
