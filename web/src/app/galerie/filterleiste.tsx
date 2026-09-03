import Link from "next/link";

import {
  HERKUENFTE, MONATE, type Filter, filterlink,
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
 *
 * Dieselbe Leiste steht in der Galerie und auf der Karte. `pfad` sagt, wohin
 * die Verweise zeigen; alles andere ist gleich, weil die Filter dieselben sind
 * und dieselbe Menge meinen sollen. Auf der Karte entfaellt die Zeile "Ort":
 * dort ist "ohne Ort" nicht einschraenkend, sondern leer.
 */
export default function Filterleiste({
  filter, zahlen, treffer, zeitraeume, pfad = "/galerie", ortszeile = true, was = "Aufnahmen",
  personen = [],
}: {
  filter: Filter;
  zahlen: Zahlen;
  treffer: number;
  zeitraeume: { jahr: number; monat: number; anzahl: number }[];
  pfad?: string;
  ortszeile?: boolean;
  was?: string;
  /**
   * Die benannten Personen – leer, wenn das Recht `gesichter` fehlt oder noch
   * niemand benannt ist. Die Zeile entfaellt dann ganz.
   *
   * Dass sie fehlt, ist KEINE Pruefung: ein `?person=3` in der Adresse wird in
   * `bedingung()` an `sicht.gesichter` geprueft und sonst schlicht nicht
   * angewandt.
   */
  personen?: { id: number; name: string; aufnahmen: number }[];
}) {
  const verweis = (aenderung: Partial<Filter>) => filterlink(pfad, filter, aenderung);
  const jahre = [...new Set(zeitraeume.map((z) => z.jahr))].sort((a, b) => b - a);

  /*
    Ein Jahr an- oder abwaehlen. Kaestchen statt einer Auswahlliste: mehrere
    Jahre nebeneinander sind der Zweck, und "2022 und 2025, aber nicht 2023"
    laesst sich mit Kaestchen sagen und mit einer Liste nicht.

    Es bleiben VERWEISE, keine Formularfelder – dieselbe Begruendung wie beim
    Markieren in der Galerie (siehe src/lib/markierung.ts): was in der Adresse
    steht, ueberlebt jedes Blaettern, und React setzt bei einem Kaestchen nur
    das Attribut, nicht die tatsaechliche Ankreuzung.
  */
  const umschalten = (j: number): number[] =>
    filter.jahr.includes(j)
      ? filter.jahr.filter((x) => x !== j)
      : [...filter.jahr, j].sort((a, b) => a - b);

  /*
    Monate ueber ALLE gewaehlten Jahre zusammengezaehlt. "Juli 2022, 2023 und
    2025" ist eine sinnvolle Frage, und der Monatsfilter wirkt in der Abfrage
    ohnehin unabhaengig vom Jahr. Ohne Jahresauswahl bleibt die Zeile weg –
    zwoelf Monate ueber acht Jahrgaenge sind keine Auswahl, sondern eine Wand.
  */
  const monate = filter.jahr.length
    ? [...zeitraeume
         .filter((z) => filter.jahr.includes(z.jahr))
         .reduce((karte, z) => karte.set(z.monat, (karte.get(z.monat) ?? 0) + z.anzahl),
                 new Map<number, number>())]
        .map(([monat, anzahl]) => ({ monat, anzahl }))
        .sort((a, b) => b.monat - a.monat)
    : [];

  const gefiltert = treffer < zahlen.gesamt;

  return (
    <div className="filter">
      {gefiltert ? (
        <p className="hinweis-filter">
          <strong>{treffer}</strong> von <strong>{zahlen.gesamt}</strong> {was} –
          es wird gefiltert.{" "}
          <Link href={`${pfad}?herkunft=alle`}>alles zeigen</Link>
        </p>
      ) : (
        <p className="hinweis-filter">
          Alle <strong>{zahlen.gesamt}</strong> {was}.
        </p>
      )}

      <div className="filterzeile">
        <b>Jahr</b>
        <Marke ziel={verweis({ jahr: [], monat: null })} text="alle"
               gewaehlt={filter.jahr.length === 0} />
        {jahre.map((j) => (
          <Marke key={j} ziel={verweis({ jahr: umschalten(j) })}
                 text={String(j)} gewaehlt={filter.jahr.includes(j)}
                 anzahl={zeitraeume.filter((z) => z.jahr === j)
                   .reduce((s, z) => s + z.anzahl, 0)} />
        ))}
        {filter.jahr.length > 1 ? (
          <span className="leise">{filter.jahr.length} Jahrgänge gewählt</span>
        ) : null}
      </div>

      {monate.length ? (
        <div className="filterzeile">
          <b>Monat</b>
          <Marke ziel={verweis({ monat: null })} text="alle"
                 gewaehlt={filter.monat === null} />
          {monate.map((m) => (
            <Marke key={m.monat} ziel={verweis({ monat: m.monat })}
                   text={MONATE[m.monat - 1]} anzahl={m.anzahl}
                   gewaehlt={filter.monat === m.monat} />
          ))}
        </div>
      ) : null}

      <div className="filterzeile">
        <b>Herkunft</b>
        <Marke ziel={verweis({ herkunft: "alle" })} text="alle"
               anzahl={Object.values(zahlen.jeHerkunft).reduce((s, n) => s + n, 0)}
               gewaehlt={filter.herkunft === "alle"} />
        {HERKUENFTE.map((h) => (
          <Marke key={h} ziel={verweis({ herkunft: h })} text={h}
                 anzahl={zahlen.jeHerkunft[h] ?? 0} gewaehlt={filter.herkunft === h} />
        ))}
      </div>

      <div className="filterzeile">
        <b>Typ</b>
        <Marke ziel={verweis({ typ: "alle" })} text="alle"
               anzahl={Object.values(zahlen.jeTyp).reduce((s, n) => s + n, 0)}
               gewaehlt={filter.typ === "alle"} />
        <Marke ziel={verweis({ typ: "bild" })} text="Bilder"
               anzahl={zahlen.jeTyp.bild ?? 0} gewaehlt={filter.typ === "bild"} />
        <Marke ziel={verweis({ typ: "video" })} text="Videos"
               anzahl={zahlen.jeTyp.video ?? 0} gewaehlt={filter.typ === "video"} />
      </div>

      {personen.length ? (
        <div className="filterzeile">
          <b>Person</b>
          <Marke ziel={verweis({ person: null })} text="alle"
                 gewaehlt={filter.person === null} />
          {personen.map((p) => (
            <Marke key={p.id} ziel={verweis({ person: p.id })} text={p.name}
                   anzahl={p.aufnahmen} gewaehlt={filter.person === p.id} />
          ))}
        </div>
      ) : null}

      {ortszeile ? (
        <div className="filterzeile">
          <b>Ort</b>
          <Marke ziel={verweis({ ort: "alle" })} text="egal"
                 anzahl={Object.values(zahlen.jeOrt).reduce((s, n) => s + n, 0)}
                 gewaehlt={filter.ort === "alle"} />
          <Marke ziel={verweis({ ort: "mit" })} text="mit Ort"
                 anzahl={zahlen.jeOrt.mit ?? 0} gewaehlt={filter.ort === "mit"} />
          <Marke ziel={verweis({ ort: "ohne" })} text="ohne Ort"
                 anzahl={zahlen.jeOrt.ohne ?? 0} gewaehlt={filter.ort === "ohne"} />
        </div>
      ) : null}
    </div>
  );
}
