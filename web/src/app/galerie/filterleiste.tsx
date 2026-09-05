import Link from "next/link";

import {
  HERKUENFTE, MONATE, VORGABE, type Filter, filterlink, herkunftstext,
} from "@/lib/galerie";
import Personenklappe from "./personenklappe";

interface Zahlen {
  gesamt: number;
  jeHerkunft: Record<string, number>;
  jeTyp: Record<string, number>;
  jeOrt: Record<string, number>;
  jePerson: Record<number, number>;
}

export interface Personeneintrag {
  id: number;
  name: string;
}

/**
 * Die Beschriftung aller Achsen: was steht dran, und schraenkt sie ein?
 *
 * Steht hier und wird von zwei Stellen benutzt – von den Klappen selbst und
 * von der zugeklappten Leiste auf der Karte. Zwei Fassungen derselben
 * Beschriftung liefen frueher oder spaeter auseinander, und dann behauptet die
 * Zusammenfassung etwas anderes als die Klappe darunter.
 */
export function achsentexte(
  filter: Filter,
  personen: Personeneintrag[] = [],
): { achse: string; wert: string; gesetzt: boolean }[] {
  const person = personen.find((p) => p.id === filter.person);
  return [
    {
      achse: "Jahr",
      wert: filter.jahr.length === 0 ? "alle"
        : filter.jahr.length <= 3 ? filter.jahr.join(", ")
          : `${filter.jahr.length} gewählt`,
      gesetzt: filter.jahr.length > 0,
    },
    {
      achse: "Monat",
      wert: filter.monat === null ? "alle" : MONATE[filter.monat - 1],
      gesetzt: filter.monat !== null,
    },
    {
      achse: "Herkunft",
      wert: herkunftstext(filter.herkunft),
      gesetzt: filter.herkunft !== "alle",
    },
    {
      achse: "Typ",
      wert: filter.typ === "bild" ? "Bilder" : filter.typ === "video" ? "Videos" : "alle",
      gesetzt: filter.typ !== "alle",
    },
    {
      achse: "Person",
      wert: filter.person === null ? "alle" : (person?.name ?? `Nr. ${filter.person}`),
      gesetzt: filter.person !== null,
    },
    {
      achse: "Ort",
      wert: filter.ort === "mit" ? "mit Ort" : filter.ort === "ohne" ? "ohne Ort" : "egal",
      gesetzt: filter.ort !== "alle",
    },
  ];
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
 * Eine Achse als Klappliste.
 *
 * **`name` macht die Klappen gegenseitig ausschliessend** – das ist HTML, kein
 * JavaScript: oeffnet man die zweite, schliesst der Browser die erste. Sechs
 * offene Klappen waeren wieder die alte Zeile, nur hoeher.
 *
 * **Ob eine Klappe offen ist, steht bewusst NICHT in der Adresse.** Der
 * Filterzustand gehoert dorthin, weil eine Ansicht wiederzufinden sein muss;
 * ob jemand gerade eine Liste aufgeklappt hat, geht beim Weiterklicken
 * verloren und soll es auch.
 *
 * **Die geschlossene Klappe nennt den gewaehlten Wert, nicht nur die Achse.**
 * Sonst waere der Umbau genau das, wovor CLAUDE.md seit Phase 2b warnt: ein
 * stiller Filter, der jemanden glauben laesst, mehr sei nicht da. Zusaetzlich
 * traegt eine eingeschraenkte Achse ein Kennzeichen, das man **ohne Oeffnen**
 * sieht – Text allein reicht nicht, wenn sechs Klappen nebeneinander stehen.
 */
function Klappe({
  achse, wert, eingeschraenkt, zuruecksetzen, children,
}: {
  achse: string;
  wert: string;
  eingeschraenkt: boolean;
  /** Wohin "diese Achse zeigt alles" fuehrt. */
  zuruecksetzen: string;
  children: React.ReactNode;
}) {
  return (
    <details name="filterklappe" className={`klappe${eingeschraenkt ? " gesetzt" : ""}`}>
      <summary>
        <span className="klappe-achse">{achse}</span>
        <span className="klappe-wert">{wert}</span>
      </summary>
      <div className="klappe-inhalt">
        {children}
        {eingeschraenkt ? (
          <Link className="klappe-zurueck" href={zuruecksetzen}>
            {achse}: alles zeigen
          </Link>
        ) : null}
      </div>
    </details>
  );
}

/**
 * Die Filterleiste – dieselbe in der Galerie und auf der Karte.
 *
 * `pfad` sagt, wohin die Verweise zeigen; alles andere ist gleich, weil die
 * Filter dieselben sind und dieselbe Menge meinen sollen. Zwei Fassungen
 * liefen frueher oder spaeter auseinander, und dann zeigte die Karte etwas
 * anderes als die Galerie.
 *
 * **Der Kartenausschnitt ist keine Klappliste.** Er laesst sich hier nicht
 * auswaehlen – er kommt von der Karte. Er steht als eigener Hinweis auf der
 * Seite, mit dem Weg zurueck zur Karte und dem Weg, ihn aufzuheben.
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
   * niemand benannt ist. Die Klappe entfaellt dann ganz.
   *
   * Dass sie fehlt, ist KEINE Pruefung: ein `?person=3` in der Adresse wird in
   * `bedingung()` an `sicht.gesichter` geprueft und sonst nicht angewandt.
   */
  personen?: Personeneintrag[];
}) {
  const verweis = (aenderung: Partial<Filter>) => filterlink(pfad, filter, aenderung);
  const jahre = [...new Set(zeitraeume.map((z) => z.jahr))].sort((a, b) => b - a);

  /*
    Ein Jahr an- oder abwaehlen. Kaestchen waeren naheliegend und sind es
    nicht: was in der Adresse steht, ueberlebt jedes Blaettern, und React setzt
    bei einem Kaestchen nur das Attribut, nicht die tatsaechliche Ankreuzung –
    die `defaultChecked`-Falle, die in diesem Projekt zweimal zugeschlagen hat.
    Es bleiben deshalb VERWEISE, auch in der Klappe.
  */
  const umschalten = (j: number): number[] =>
    filter.jahr.includes(j)
      ? filter.jahr.filter((x) => x !== j)
      : [...filter.jahr, j].sort((a, b) => a - b);

  // Monate ueber ALLE gewaehlten Jahre zusammengezaehlt; ohne Jahresauswahl
  // ueber den ganzen gefilterten Bestand. "Juli 2022, 2023 und 2025" ist eine
  // sinnvolle Frage, und der Monatsfilter wirkt in der Abfrage ohnehin
  // unabhaengig vom Jahr.
  const monate = [
    ...zeitraeume
      .filter((z) => !filter.jahr.length || filter.jahr.includes(z.jahr))
      .reduce((karte, z) => karte.set(z.monat, (karte.get(z.monat) ?? 0) + z.anzahl),
              new Map<number, number>()),
  ]
    .map(([monat, anzahl]) => ({ monat, anzahl }))
    .sort((a, b) => a.monat - b.monat);

  const gefiltert = treffer < zahlen.gesamt;

  // Steht alles auf der Vorgabe? Dann gibt es nichts zurueckzusetzen.
  const istVorgabe =
    filter.jahr.length === 0 && filter.monat === null &&
    filter.herkunft === VORGABE.herkunft && filter.typ === "alle" &&
    filter.ort === "alle" && filter.person === null && filter.zelle === null;

  // "Alles zeigen" ist etwas anderes als "zuruecksetzen": das eine hebt jede
  // Einschraenkung auf, das andere fuehrt auf die Vorgabe aus CLAUDE.md.
  const allesZeigen = filterlink(pfad, filter, {
    jahr: [], monat: null, herkunft: "alle", typ: "alle", ort: "alle",
    person: null, zelle: null,
  });

  const texte = Object.fromEntries(
    achsentexte(filter, personen).map((a) => [a.achse, a.wert]),
  ) as Record<string, string>;
  const { Jahr: jahrText, Typ: typText, Ort: ortText, Person: personText } = texte;

  return (
    <div className="filter">
      {gefiltert ? (
        <p className="hinweis-filter">
          <strong>{treffer.toLocaleString("de-DE")}</strong> von{" "}
          <strong>{zahlen.gesamt.toLocaleString("de-DE")}</strong> {was} – es wird
          gefiltert.{" "}
          <Link href={allesZeigen}>alles zeigen</Link>
          {!istVorgabe ? (
            <>
              {" · "}
              <Link href={pfad}>alle Filter zurücksetzen</Link>
            </>
          ) : null}
        </p>
      ) : (
        <p className="hinweis-filter">
          Alle <strong>{zahlen.gesamt.toLocaleString("de-DE")}</strong> {was}.
          {!istVorgabe ? (
            <>
              {" "}
              <Link href={pfad}>alle Filter zurücksetzen</Link>
            </>
          ) : null}
        </p>
      )}

      <div className="klappen">
        <Klappe achse="Jahr" wert={jahrText} eingeschraenkt={filter.jahr.length > 0}
                zuruecksetzen={verweis({ jahr: [], monat: null })}>
          <div className="filterzeile">
          {jahre.map((j) => (
            <Marke key={j} ziel={verweis({ jahr: umschalten(j) })}
                   text={String(j)} gewaehlt={filter.jahr.includes(j)}
                   anzahl={zeitraeume.filter((z) => z.jahr === j)
                     .reduce((s, z) => s + z.anzahl, 0)} />
          ))}
          {jahre.length === 0 ? <span className="leise">kein Jahrgang freigeschaltet</span> : null}
          </div>
        </Klappe>

        <Klappe achse="Monat" wert={filter.monat === null ? "alle" : MONATE[filter.monat - 1]}
                eingeschraenkt={filter.monat !== null}
                zuruecksetzen={verweis({ monat: null })}>
          <div className="filterzeile">
          {monate.map((m) => (
            <Marke key={m.monat} ziel={verweis({ monat: m.monat })}
                   text={MONATE[m.monat - 1]} anzahl={m.anzahl}
                   gewaehlt={filter.monat === m.monat} />
          ))}
          </div>
        </Klappe>

        {/* Die Vorgabe `iphone` IST eine Einschraenkung und wird auch so
            gekennzeichnet – das ist der Kern von Punkt 1 des Auftrags. */}
        <Klappe achse="Herkunft" wert={herkunftstext(filter.herkunft)}
                eingeschraenkt={filter.herkunft !== "alle"}
                zuruecksetzen={verweis({ herkunft: "alle" })}>
          <div className="filterzeile">
          {HERKUENFTE.map((h) => (
            <Marke key={h} ziel={verweis({ herkunft: h })} text={herkunftstext(h)}
                   anzahl={zahlen.jeHerkunft[h] ?? 0} gewaehlt={filter.herkunft === h} />
          ))}
          </div>
        </Klappe>

        <Klappe achse="Typ" wert={typText} eingeschraenkt={filter.typ !== "alle"}
                zuruecksetzen={verweis({ typ: "alle" })}>
          <div className="filterzeile">
          <Marke ziel={verweis({ typ: "bild" })} text="Bilder"
                 anzahl={zahlen.jeTyp.bild ?? 0} gewaehlt={filter.typ === "bild"} />
          <Marke ziel={verweis({ typ: "video" })} text="Videos"
                 anzahl={zahlen.jeTyp.video ?? 0} gewaehlt={filter.typ === "video"} />
          </div>
        </Klappe>

        {personen.length ? (
          <Klappe achse="Person" wert={personText} eingeschraenkt={filter.person !== null}
                  zuruecksetzen={verweis({ person: null })}>
            <Personenklappe
              eintraege={personen
                .map((p) => ({
                  id: p.id, name: p.name,
                  anzahl: zahlen.jePerson[p.id] ?? 0,
                  ziel: verweis({ person: p.id }),
                }))
                .sort((a, b) => b.anzahl - a.anzahl || a.name.localeCompare(b.name, "de"))}
              gewaehlt={filter.person}
            />
          </Klappe>
        ) : null}

        {ortszeile ? (
          <Klappe achse="Ort" wert={ortText} eingeschraenkt={filter.ort !== "alle"}
                  zuruecksetzen={verweis({ ort: "alle" })}>
            <div className="filterzeile">
            <Marke ziel={verweis({ ort: "mit" })} text="mit Ort"
                   anzahl={zahlen.jeOrt.mit ?? 0} gewaehlt={filter.ort === "mit"} />
            <Marke ziel={verweis({ ort: "ohne" })} text="ohne Ort"
                   anzahl={zahlen.jeOrt.ohne ?? 0} gewaehlt={filter.ort === "ohne"} />
            </div>
          </Klappe>
        ) : null}
      </div>
    </div>
  );
}
