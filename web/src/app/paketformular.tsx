import {
  HOECHSTENS_JE_PAKET, geschaetzteGroesse, groessentext, type Groessenzeile,
} from "@/lib/herunterladen";

/**
 * Der Download-Knopf.
 *
 * Er steht **sichtbar** an der Auswahlliste und an der Sammelauswahl, nicht in
 * einem Untermenue: durchsehen, sammeln, herunterladen ist der eigentliche
 * Ablauf, und der letzte Schritt darf nicht gesucht werden muessen.
 *
 * **Vorher sagen, was kommt** – Anzahl und geschaetzte Groesse stehen davor,
 * nicht danach. Ebenso der Hinweis auf die Obergrenze: wer zweihundert Bilder
 * auswaehlt und danach abgewiesen wird, hat die Arbeit umsonst gemacht.
 *
 * Ein reines Formular ohne JavaScript. `method="POST"` loest den Download im
 * Browser genauso aus wie ein Verweis.
 */
export default function Paketformular({
  zeilen, listeId, ids, was, fehlend = 0,
}: {
  zeilen: Groessenzeile[];
  listeId?: number;
  ids?: number[];
  was: string;
  /** Wie viele wegen eines gesperrten Jahrgangs NICHT dabei sind. */
  fehlend?: number;
}) {
  const anzahl = zeilen.length;
  const teile = Math.ceil(anzahl / HOECHSTENS_JE_PAKET);

  if (anzahl === 0) return null;

  const jpeg = geschaetzteGroesse(zeilen, "jpeg");
  const original = geschaetzteGroesse(zeilen, "original");
  const jeTeil = (bytes: number) =>
    teile > 1 ? Math.round(bytes / teile) : bytes;

  return (
    <div className="paket">
      <h2>Herunterladen</h2>
      <p>
        {/*
          Die Zahl vor dem Herunterladen ist die der VERFUEGBAREN Bilder, und
          der Unterschied steht dabei. Wer 55 in der Liste sieht und 43 im
          Paket bekommt, soll den Grund hier lesen und nicht spaeter zaehlen.
        */}
        <strong>{anzahl}</strong> {was} – als JPEG rund{" "}
        <strong>{groessentext(jpeg)}</strong>, als Original rund{" "}
        <strong>{groessentext(original)}</strong>.
        {fehlend > 0 ? (
          <>
            {" "}
            <strong>{fehlend} weitere</strong> {fehlend === 1 ? "steht" : "stehen"} in der
            Liste, {fehlend === 1 ? "ist" : "sind"} aber derzeit nicht freigeschaltet und
            {fehlend === 1 ? " kommt" : " kommen"} nicht mit ins Paket.
          </>
        ) : null}
      </p>

      {teile > 1 ? (
        <p className="hinweis">
          Ein Paket fasst {HOECHSTENS_JE_PAKET} Aufnahmen. Das sind{" "}
          <strong>{teile} Pakete</strong> zu je rund {groessentext(jeTeil(jpeg))} –
          unten einzeln abzuholen. Die Liste bleibt dabei bestehen.
        </p>
      ) : null}

      {Array.from({ length: teile }, (_, i) => i + 1).map((teil) => (
        <form key={teil} method="POST" action="/herunterladen/paket" className="nebeneinander">
          {listeId !== undefined ? <input type="hidden" name="liste" value={listeId} /> : null}
          {ids !== undefined ? <input type="hidden" name="ids" value={ids.join(",")} /> : null}
          <input type="hidden" name="teil" value={teil} />
          <span className="leise">
            {teile > 1
              ? `Teil ${teil}: Aufnahmen ${(teil - 1) * HOECHSTENS_JE_PAKET + 1}–${Math.min(teil * HOECHSTENS_JE_PAKET, anzahl)}`
              : "Alle Aufnahmen"}
          </span>
          <button className="haupt" type="submit" name="art" value="jpeg">
            als JPEG
          </button>
          <button type="submit" name="art" value="original">
            als Original
          </button>
        </form>
      ))}

      <p className="leise">
        JPEG: volle Auflösung, Qualität 95, sRGB, mit Aufnahmezeit und Ort in der
        Datei – das, was ein Druckdienstleister annimmt. Originale sind HEIC und
        gehen dort nicht. Videos kommen in beiden Fällen als Original.
      </p>
    </div>
  );
}
