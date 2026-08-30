import Link from "next/link";

import {
  HERKUENFTE, MONATE, type Filter, galerielink,
} from "@/lib/galerie";

interface Zahlen {
  gesamt: number;
  jeHerkunft: Record<string, number>;
  jeTyp: Record<string, number>;
  jeOrt: Record<string, number>;
}

function Marke({
  ziel, text, anzahl, gewaehlt,
}: { ziel: string; text: string; anzahl?: number; gewaehlt: boolean }) {
  return (
    <Link href={ziel} className={`marke-filter${gewaehlt ? " gewaehlt" : ""}`}>
      {text}
      {anzahl !== undefined ? <span className="zahl"> {anzahl}</span> : null}
    </Link>
  );
}

/**
 * Zu jedem Filter steht die Trefferzahl – jeweils unter den uebrigen Filtern.
 *
 * Wer 665 von 922 sieht, versteht die Vorgabe; wer nur 665 sieht, haelt sie
 * fuer alles. Deshalb steht ueber der Leiste ausdruecklich, dass gefiltert
 * wird, sobald etwas ausgeblendet ist.
 */
export default function Filterleiste({
  filter, zahlen, treffer, zeitraeume,
}: {
  filter: Filter;
  zahlen: Zahlen;
  treffer: number;
  zeitraeume: { jahr: number; monat: number; anzahl: number }[];
}) {
  const jahre = [...new Set(zeitraeume.map((z) => z.jahr))].sort((a, b) => b - a);
  const monate = filter.jahr === null
    ? []
    : zeitraeume.filter((z) => z.jahr === filter.jahr).sort((a, b) => b.monat - a.monat);

  const gefiltert = treffer < zahlen.gesamt;

  return (
    <div className="filter">
      {gefiltert ? (
        <p className="hinweis-filter">
          <strong>{treffer}</strong> von <strong>{zahlen.gesamt}</strong> Aufnahmen –
          es wird gefiltert.{" "}
          <Link href="/galerie?herkunft=alle">alles zeigen</Link>
        </p>
      ) : (
        <p className="hinweis-filter">
          Alle <strong>{zahlen.gesamt}</strong> Aufnahmen.
        </p>
      )}

      <div className="filterzeile">
        <b>Jahr</b>
        <Marke ziel={galerielink(filter, { jahr: null, monat: null })} text="alle"
               gewaehlt={filter.jahr === null} />
        {jahre.map((j) => (
          <Marke key={j} ziel={galerielink(filter, { jahr: j, monat: null })}
                 text={String(j)} gewaehlt={filter.jahr === j}
                 anzahl={zeitraeume.filter((z) => z.jahr === j)
                   .reduce((s, z) => s + z.anzahl, 0)} />
        ))}
      </div>

      {monate.length ? (
        <div className="filterzeile">
          <b>Monat</b>
          <Marke ziel={galerielink(filter, { monat: null })} text="alle"
                 gewaehlt={filter.monat === null} />
          {monate.map((m) => (
            <Marke key={m.monat} ziel={galerielink(filter, { monat: m.monat })}
                   text={MONATE[m.monat - 1]} anzahl={m.anzahl}
                   gewaehlt={filter.monat === m.monat} />
          ))}
        </div>
      ) : null}

      <div className="filterzeile">
        <b>Herkunft</b>
        <Marke ziel={galerielink(filter, { herkunft: "alle" })} text="alle"
               anzahl={Object.values(zahlen.jeHerkunft).reduce((s, n) => s + n, 0)}
               gewaehlt={filter.herkunft === "alle"} />
        {HERKUENFTE.map((h) => (
          <Marke key={h} ziel={galerielink(filter, { herkunft: h })} text={h}
                 anzahl={zahlen.jeHerkunft[h] ?? 0} gewaehlt={filter.herkunft === h} />
        ))}
      </div>

      <div className="filterzeile">
        <b>Typ</b>
        <Marke ziel={galerielink(filter, { typ: "alle" })} text="alle"
               anzahl={Object.values(zahlen.jeTyp).reduce((s, n) => s + n, 0)}
               gewaehlt={filter.typ === "alle"} />
        <Marke ziel={galerielink(filter, { typ: "bild" })} text="Bilder"
               anzahl={zahlen.jeTyp.bild ?? 0} gewaehlt={filter.typ === "bild"} />
        <Marke ziel={galerielink(filter, { typ: "video" })} text="Videos"
               anzahl={zahlen.jeTyp.video ?? 0} gewaehlt={filter.typ === "video"} />
      </div>

      <div className="filterzeile">
        <b>Ort</b>
        <Marke ziel={galerielink(filter, { ort: "alle" })} text="egal"
               anzahl={Object.values(zahlen.jeOrt).reduce((s, n) => s + n, 0)}
               gewaehlt={filter.ort === "alle"} />
        <Marke ziel={galerielink(filter, { ort: "mit" })} text="mit Ort"
               anzahl={zahlen.jeOrt.mit ?? 0} gewaehlt={filter.ort === "mit"} />
        <Marke ziel={galerielink(filter, { ort: "ohne" })} text="ohne Ort"
               anzahl={zahlen.jeOrt.ohne ?? 0} gewaehlt={filter.ort === "ohne"} />
      </div>
    </div>
  );
}
